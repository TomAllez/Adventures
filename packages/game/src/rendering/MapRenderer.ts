import Phaser from 'phaser';
import { Tile } from '@org/common';
import type { TileMap, TilesetMeta } from '@org/common';

function tileColor(tile: Tile): number {
  return tile === Tile.Wall ? 0x4a5580 : 0x1a1a36;
}

export class MapRenderer {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics;
  private tileImages = new Map<string, Phaser.GameObjects.Image>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics().setDepth(0);
  }

  render(map: TileMap) {
    // Destroy previous visual tile images before redrawing
    for (const img of this.tileImages.values()) img.destroy();
    this.tileImages.clear();

    this.graphics.clear();
    const { tileSize } = map;

    // Collision layer — colored rectangles
    for (let row = 0; row < map.height; row++) {
      for (let col = 0; col < map.width; col++) {
        this.graphics.fillStyle(tileColor(map.tiles[row][col]));
        this.graphics.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);
      }
    }

    // Visual layer — tileset images placed on top (depth 1)
    for (let row = 0; row < map.height; row++) {
      for (let col = 0; col < map.width; col++) {
        const sprite = map.visualLayer?.[row]?.[col];
        if (!sprite) continue;

        const key = `tileset_${sprite.tilesetId}`;
        if (!this.scene.textures.exists(key)) continue;

        const texture = this.scene.textures.get(key);
        const frameName = `${sprite.col}_${sprite.row}`;
        if (!texture.has(frameName)) continue;

        const x = col * tileSize + tileSize / 2;
        const y = row * tileSize + tileSize / 2;
        const img = this.scene.add.image(x, y, key, frameName);
        img.setDisplaySize(tileSize, tileSize).setDepth(1);
        this.tileImages.set(`${row}_${col}`, img);
      }
    }
  }

  // Call after the texture is loaded to create named frames for each tile in the grid.
  registerTileset(meta: TilesetMeta) {
    const key = `tileset_${meta.id}`;
    if (!this.scene.textures.exists(key)) return;
    const texture = this.scene.textures.get(key);
    const cols = Math.floor(texture.source[0].width / meta.tileWidth);
    const rows = Math.floor(texture.source[0].height / meta.tileHeight);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const frameName = `${c}_${r}`;
        if (!texture.has(frameName)) {
          texture.add(frameName, 0, c * meta.tileWidth, r * meta.tileHeight, meta.tileWidth, meta.tileHeight);
        }
      }
    }
  }

  destroy() {
    for (const img of this.tileImages.values()) img.destroy();
    this.tileImages.clear();
    this.graphics.destroy();
  }
}
