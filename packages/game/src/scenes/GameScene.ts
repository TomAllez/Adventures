import Phaser from 'phaser';
import { TICK_INTERVAL_MS, WORLD_WIDTH, WORLD_HEIGHT } from '@org/common';
import type { GameState, Player } from '@org/common';
import type { NetworkClient } from '../network/client.js';
import { lerp } from '../utils/math.js';

type InitData = {
  net: NetworkClient;
  playerId: string;
  state: GameState;
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
    this.currentTick = data.state.tick;
  }

  create() {
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.drawGrid();
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.applyState(this.initialState);
  }

  override update() {
    this.net.sendInput(this.currentTick, {
      up: this.cursors.up.isDown,
      down: this.cursors.down.isDown,
      left: this.cursors.left.isDown,
      right: this.cursors.right.isDown,
    });

    this.interpolateViews();
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

  addPlayer(player: Player) {
    if (!this.views.has(player.id)) this.spawnView(player.id, player);
  }

  removePlayer(playerId: string) {
    this.destroyView(playerId);
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

  private spawnView(id: string, player: Player) {
    const isSelf = id === this.playerId;
    const color = isSelf ? 0x00ff88 : 0xff4455;

    const sprite = this.add.rectangle(player.position.x, player.position.y, 32, 32, color);
    const label = this.add
      .text(player.position.x, player.position.y - 28, player.name, {
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    this.views.set(id, { sprite, label });

    if (isSelf) this.cameras.main.startFollow(sprite, true, 0.1, 0.1);
  }

  private destroyView(id: string) {
    const view = this.views.get(id);
    if (!view) return;
    view.sprite.destroy();
    view.label.destroy();
    this.views.delete(id);
  }

  private drawGrid() {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x3333aa, 0.25);

    for (let x = 0; x <= WORLD_WIDTH; x += 64) {
      graphics.moveTo(x, 0).lineTo(x, WORLD_HEIGHT);
    }
    for (let y = 0; y <= WORLD_HEIGHT; y += 64) {
      graphics.moveTo(0, y).lineTo(WORLD_WIDTH, y);
    }
    graphics.strokePath();

    // World border
    graphics.lineStyle(2, 0x6666ff, 0.8);
    graphics.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }
}
