import { readFileSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Tile, MAP_COLS, MAP_ROWS, MAP_TILE_SIZE } from '@org/common';
import type { TileMap, TileSprite } from '@org/common';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = resolve(__dirname, '../../maps/default.json');

function emptyVisualLayer(height: number, width: number): (TileSprite | null)[][] {
  return Array.from({ length: height }, () => new Array<TileSprite | null>(width).fill(null));
}

export function loadMap(): TileMap {
  try {
    const raw = JSON.parse(readFileSync(MAP_PATH, 'utf-8')) as Partial<TileMap>;
    const height = raw.height ?? MAP_ROWS;
    const width = raw.width ?? MAP_COLS;
    return {
      width,
      height,
      tileSize: raw.tileSize ?? MAP_TILE_SIZE,
      tiles: raw.tiles ?? Array.from({ length: height }, () => new Array<Tile>(width).fill(Tile.Floor)),
      visualLayer: raw.visualLayer ?? emptyVisualLayer(height, width),
      tilesets: raw.tilesets ?? [],
    };
  } catch {
    return createDefaultMap();
  }
}

export async function saveMap(map: TileMap): Promise<void> {
  mkdirSync(dirname(MAP_PATH), { recursive: true });
  await writeFile(MAP_PATH, JSON.stringify(map), 'utf-8');
}

export function createDefaultMap(): TileMap {
  const tiles: Tile[][] = Array.from({ length: MAP_ROWS }, () =>
    new Array<Tile>(MAP_COLS).fill(Tile.Wall),
  );

  const floor = (c1: number, r1: number, c2: number, r2: number) => {
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++) tiles[r][c] = Tile.Floor;
  };

  // Four corner rooms
  floor(2, 2, 14, 12);
  floor(35, 2, 47, 12);
  floor(2, 15, 14, 25);
  floor(35, 15, 47, 25);

  // Center room
  floor(20, 7, 29, 20);

  // Corridors connecting corners to center
  floor(14, 8, 20, 11);
  floor(29, 8, 35, 11);
  floor(14, 16, 20, 19);
  floor(29, 16, 35, 19);

  return {
    width: MAP_COLS,
    height: MAP_ROWS,
    tileSize: MAP_TILE_SIZE,
    tiles,
    visualLayer: emptyVisualLayer(MAP_ROWS, MAP_COLS),
    tilesets: [],
  };
}
