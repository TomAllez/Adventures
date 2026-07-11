import type { GameState, Player, TileMap } from '@org/common';
import { TICK_INTERVAL_MS } from '@org/common';
import Phaser from 'phaser';
import type { NetworkClient } from '../network/client.js';
import { MapRenderer } from '../rendering/MapRenderer.js';
import { ShadowLayer } from '../rendering/ShadowLayer.js';
import { lerp } from '../utils/math.js';

type InitData = {
  net: NetworkClient;
  playerId: string;
  state: GameState;
  map: TileMap;
};

type PlayerView = {
  sprite: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
};

export class GameScene extends Phaser.Scene {
  private net!: NetworkClient;
  private playerId!: string;
  private currentTick = 0;
  private initialState!: GameState;
  private initialMap!: TileMap;
  private currentMap!: TileMap;

  private mapRenderer!: MapRenderer;
  private shadowLayer!: ShadowLayer;
  private views = new Map<string, PlayerView>();
  private previousState: GameState | null = null;
  private currentState: GameState | null = null;
  private lastTickTime = 0;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: InitData) {
    this.net = data.net;
    this.playerId = data.playerId;
    this.initialState = data.state;
    this.initialMap = data.map;
    this.currentMap = data.map;
    this.currentTick = data.state.tick;
  }

  create() {
    this.mapRenderer = new MapRenderer(this);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.applyState(this.initialState);
    this.loadTilesetsAndRender(this.initialMap);

    const mapW = this.initialMap.width * this.initialMap.tileSize;
    const mapH = this.initialMap.height * this.initialMap.tileSize;
    this.shadowLayer = new ShadowLayer(this, mapW, mapH);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.shadowLayer.destroy();
      this.mapRenderer.destroy();
    });
  }

  override update() {
    this.net.sendInput(this.currentTick, {
      up: this.cursors.up.isDown,
      down: this.cursors.down.isDown,
      left: this.cursors.left.isDown,
      right: this.cursors.right.isDown,
    });
    this.interpolateViews();
    this.updateShadow();
  }

  applyState(state: GameState) {
    this.previousState = this.currentState;
    this.currentState = state;
    this.lastTickTime = Date.now();
    this.currentTick = state.tick;

    for (const [id, player] of Object.entries(state.players)) {
      if (!this.views.has(id)) this.spawnView(id, player);
    }
    for (const id of this.views.keys()) {
      if (!state.players[id]) this.destroyView(id);
    }
  }

  applyMap(map: TileMap) {
    this.currentMap = map;
    this.loadTilesetsAndRender(map);
    const mapW = map.width * map.tileSize;
    const mapH = map.height * map.tileSize;
    this.shadowLayer?.resize(mapW, mapH);
  }

  addPlayer(player: Player) {
    if (!this.views.has(player.id)) this.spawnView(player.id, player);
  }

  removePlayer(playerId: string) {
    this.destroyView(playerId);
  }

  private loadTilesetsAndRender(map: TileMap) {
    const mapW = map.width * map.tileSize;
    const mapH = map.height * map.tileSize;
    this.cameras.main.setBounds(0, 0, mapW, mapH);

    const missing = map.tilesets.filter((t) => !this.textures.exists(`tileset_${t.id}`));

    if (missing.length === 0) {
      for (const meta of map.tilesets) this.mapRenderer.registerTileset(meta);
      this.mapRenderer.render(map);
      return;
    }

    for (const meta of missing) {
      this.load.image(`tileset_${meta.id}`, `/api/tilesets/${meta.id}`);
    }
    this.load.once('complete', () => {
      for (const meta of map.tilesets) this.mapRenderer.registerTileset(meta);
      this.mapRenderer.render(map);
    });
    this.load.start();
  }

  private interpolateViews() {
    if (!this.currentState) return;
    const alpha = Math.min((Date.now() - this.lastTickTime) / TICK_INTERVAL_MS, 1);

    for (const [id, current] of Object.entries(this.currentState.players)) {
      const view = this.views.get(id);
      if (!view) continue;
      const prev = this.previousState?.players[id]?.position ?? current.position;
      const x = lerp(prev.x, current.position.x, alpha);
      const y = lerp(prev.y, current.position.y, alpha);
      view.sprite.setPosition(x, y);
      view.label.setPosition(x, y - 28);
    }
  }

  private updateShadow() {
    if (!this.currentMap) return;
    const self = this.views.get(this.playerId);
    if (!self) return;
    const localPos = { x: self.sprite.x, y: self.sprite.y };
    const others: { x: number; y: number }[] = [];
    for (const [id, view] of this.views) {
      if (id !== this.playerId) others.push({ x: view.sprite.x, y: view.sprite.y });
    }
    this.shadowLayer.update(localPos, others, this.currentMap);
  }

  private spawnView(id: string, player: Player) {
    const isSelf = id === this.playerId;
    const color = isSelf ? 0x00ff88 : 0xff4455;
    // depth 5 — above map base (0) and visual tiles (1), below shadow (20)
    const sprite = this.add
      .rectangle(player.position.x, player.position.y, 28, 28, color)
      .setDepth(5);
    const label = this.add
      .text(player.position.x, player.position.y - 28, player.name, {
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(6);

    this.views.set(id, { sprite, label });
    if (isSelf) {
      this.cameras.main.setZoom(2);
      this.cameras.main.startFollow(sprite, true, 0.1, 0.1);
    }
  }

  private destroyView(id: string) {
    const view = this.views.get(id);
    if (!view) return;
    view.sprite.destroy();
    view.label.destroy();
    this.views.delete(id);
  }
}
