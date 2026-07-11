export enum Tile {
  Floor = 0,
  Wall = 1,
}

export type TileSprite = {
  tilesetId: string;
  col: number; // tile column index in the tileset grid
  row: number; // tile row index in the tileset grid
};

export type TilesetMeta = {
  id: string;
  name: string;
  tileWidth: number;  // pixel width of each tile in the tileset
  tileHeight: number; // pixel height of each tile in the tileset
};

export type TileMap = {
  width: number;    // columns
  height: number;   // rows
  tileSize: number; // pixels per tile
  tiles: Tile[][];                      // [row][col] — collision layer
  visualLayer: (TileSprite | null)[][]; // [row][col] — visual overrides per cell
  tilesets: TilesetMeta[];             // tilesets registered in this map
};
