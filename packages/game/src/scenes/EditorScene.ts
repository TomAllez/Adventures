import Phaser from 'phaser';
import { Tile, MAP_TILE_SIZE } from '@org/common';
import type { TileMap, TilesetMeta, TileSprite } from '@org/common';
import { MapRenderer } from '../rendering/MapRenderer.js';

const EDGE_MARGIN = 52;

export class EditorScene extends Phaser.Scene {
  selectedTile: Tile = Tile.Wall;
  selectedTileSprite: TileSprite | null = null;
  mapLoadedCallback?: (map: TileMap) => void;

  private mapData!: TileMap;
  private mapRenderer!: MapRenderer;
  private hoverGraphics!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private lastPainted: { col: number; row: number } | null = null;
  private isPaintBlocked = false;
  private isLoaded = false;

  private edgeTop!: Phaser.GameObjects.Container;
  private edgeBottom!: Phaser.GameObjects.Container;
  private edgeLeft!: Phaser.GameObjects.Container;
  private edgeRight!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'EditorScene' });
  }

  create() {
    this.mapRenderer = new MapRenderer(this);
    this.hoverGraphics = this.add.graphics().setDepth(10);

    this.statusText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'Loading map…', {
        fontSize: '20px',
        color: '#aaaacc',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.input.mouse?.disableContextMenu();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.isLoaded || this.isPaintBlocked) return;
      this.lastPainted = null;
      this.paintAt(p);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.updateHover(p);
      if (p.isDown && this.isLoaded && !this.isPaintBlocked) this.paintAt(p);
    });
    this.input.on('pointerup', () => { this.lastPainted = null; });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _g: unknown, _dx: number, dy: number) => {
      const zoom = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.25, 4);
      this.cameras.main.setZoom(zoom);
    });

    fetch('/api/map')
      .then((r) => r.json())
      .then(async (map: TileMap) => {
        this.mapData = map;
        // Backwards compat — populate new fields if loading an old save
        if (!this.mapData.visualLayer) {
          this.mapData.visualLayer = Array.from(
            { length: map.height },
            () => new Array<TileSprite | null>(map.width).fill(null),
          );
        }
        if (!this.mapData.tilesets) this.mapData.tilesets = [];

        await this.loadAllTilesets();
        this.isLoaded = true;
        this.statusText.destroy();
        this.mapRenderer.render(this.mapData);
        this.createExpandButtons();
        this.fitCamera();
        this.mapLoadedCallback?.(this.mapData);
      })
      .catch(() => {
        this.statusText.setText('Failed to load map.\nIs the server running?').setColor('#ff4455');
      });
  }

  override update(_time: number, delta: number) {
    const speed = (400 / this.cameras.main.zoom) * (delta / 1000);
    if (this.cursors.left.isDown) this.cameras.main.scrollX -= speed;
    if (this.cursors.right.isDown) this.cameras.main.scrollX += speed;
    if (this.cursors.up.isDown) this.cameras.main.scrollY -= speed;
    if (this.cursors.down.isDown) this.cameras.main.scrollY += speed;
  }

  getMap(): TileMap {
    return this.mapData;
  }

  clearMap() {
    for (let row = 0; row < this.mapData.height; row++) {
      for (let col = 0; col < this.mapData.width; col++) {
        this.mapData.tiles[row][col] = Tile.Floor;
        this.mapData.visualLayer[row][col] = null;
      }
    }
    this.mapRenderer.render(this.mapData);
  }

  setSelectedTileSprite(sprite: TileSprite | null) {
    this.selectedTileSprite = sprite;
  }

  async loadTilesetFromServer(meta: TilesetMeta): Promise<void> {
    const key = `tileset_${meta.id}`;
    if (this.textures.exists(key)) {
      this.mapRenderer.registerTileset(meta);
      return;
    }
    return new Promise((resolve) => {
      this.load.image(key, `/api/tilesets/${meta.id}`);
      this.load.once('complete', () => {
        this.mapRenderer.registerTileset(meta);
        resolve();
      });
      this.load.start();
    });
  }

  private async loadAllTilesets() {
    for (const meta of this.mapData.tilesets) {
      await this.loadTilesetFromServer(meta);
    }
  }

  private get mapPixelWidth() { return this.mapData.width * MAP_TILE_SIZE; }
  private get mapPixelHeight() { return this.mapData.height * MAP_TILE_SIZE; }

  private createEdgeButton(label: string, callback: () => void): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, 110, 30, 0x1e2d6e, 0.92).setStrokeStyle(1, 0x3d5bcc);
    const text = this.add.text(0, 0, label, { fontSize: '13px', color: '#8aadff' }).setOrigin(0.5);
    const btn = this.add.container(0, 0, [bg, text])
      .setDepth(5)
      .setSize(110, 30)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => { bg.setFillStyle(0x2e3d8e, 0.96); this.isPaintBlocked = true; });
    btn.on('pointerout', () => { bg.setFillStyle(0x1e2d6e, 0.92); this.isPaintBlocked = false; });
    btn.on('pointerdown', () => callback());
    return btn;
  }

  private createExpandButtons() {
    this.edgeTop = this.createEdgeButton('＋ Row ↑', () => this.addRow('top'));
    this.edgeBottom = this.createEdgeButton('＋ Row ↓', () => this.addRow('bottom'));
    this.edgeLeft = this.createEdgeButton('＋ Col ←', () => this.addColumn('left'));
    this.edgeRight = this.createEdgeButton('＋ Col →', () => this.addColumn('right'));
    this.repositionExpandButtons();
  }

  private repositionExpandButtons() {
    const w = this.mapPixelWidth;
    const h = this.mapPixelHeight;
    this.edgeTop?.setPosition(w / 2, -EDGE_MARGIN);
    this.edgeBottom?.setPosition(w / 2, h + EDGE_MARGIN);
    this.edgeLeft?.setPosition(-EDGE_MARGIN, h / 2);
    this.edgeRight?.setPosition(w + EDGE_MARGIN, h / 2);
    // Loose camera bounds so edge buttons are always reachable
    this.cameras.main.setBounds(
      -EDGE_MARGIN * 4, -EDGE_MARGIN * 4,
      w + EDGE_MARGIN * 8, h + EDGE_MARGIN * 8,
    );
  }

  private addRow(edge: 'top' | 'bottom') {
    const emptyTiles = new Array<Tile>(this.mapData.width).fill(Tile.Floor);
    const emptyVisual: (TileSprite | null)[] = new Array(this.mapData.width).fill(null);
    if (edge === 'top') {
      this.mapData.tiles.unshift([...emptyTiles]);
      this.mapData.visualLayer.unshift([...emptyVisual]);
      // Compensate for the downward shift so the viewport stays on the same tiles
      this.cameras.main.scrollY += MAP_TILE_SIZE;
    } else {
      this.mapData.tiles.push([...emptyTiles]);
      this.mapData.visualLayer.push([...emptyVisual]);
    }
    this.mapData.height++;
    this.repositionExpandButtons();
    this.mapRenderer.render(this.mapData);
  }

  private addColumn(edge: 'left' | 'right') {
    for (let r = 0; r < this.mapData.height; r++) {
      if (edge === 'left') {
        this.mapData.tiles[r].unshift(Tile.Floor);
        this.mapData.visualLayer[r].unshift(null);
      } else {
        this.mapData.tiles[r].push(Tile.Floor);
        this.mapData.visualLayer[r].push(null);
      }
    }
    if (edge === 'left') this.cameras.main.scrollX += MAP_TILE_SIZE;
    this.mapData.width++;
    this.repositionExpandButtons();
    this.mapRenderer.render(this.mapData);
  }

  private paintAt(pointer: Phaser.Input.Pointer) {
    const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const col = Math.floor(wp.x / MAP_TILE_SIZE);
    const row = Math.floor(wp.y / MAP_TILE_SIZE);

    if (col < 0 || col >= this.mapData.width || row < 0 || row >= this.mapData.height) return;
    if (this.lastPainted?.col === col && this.lastPainted?.row === row) return;

    if (pointer.rightButtonDown()) {
      this.mapData.tiles[row][col] = Tile.Floor;
      this.mapData.visualLayer[row][col] = null;
    } else {
      this.mapData.tiles[row][col] = this.selectedTile;
      this.mapData.visualLayer[row][col] = this.selectedTileSprite;
    }

    this.lastPainted = { col, row };
    this.mapRenderer.render(this.mapData);
  }

  private updateHover(pointer: Phaser.Input.Pointer) {
    const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const col = Math.floor(wp.x / MAP_TILE_SIZE);
    const row = Math.floor(wp.y / MAP_TILE_SIZE);
    this.hoverGraphics.clear();
    if (!this.mapData || col < 0 || col >= this.mapData.width || row < 0 || row >= this.mapData.height) return;
    this.hoverGraphics.fillStyle(0xffff00, 0.25);
    this.hoverGraphics.fillRect(col * MAP_TILE_SIZE, row * MAP_TILE_SIZE, MAP_TILE_SIZE, MAP_TILE_SIZE);
  }

  private fitCamera() {
    const mapW = this.mapPixelWidth;
    const mapH = this.mapPixelHeight;
    const zx = this.scale.width / mapW;
    const zy = this.scale.height / mapH;
    this.cameras.main.setZoom(Math.min(zx, zy) * 0.85);
    this.cameras.main.centerOn(mapW / 2, mapH / 2);
  }
}
