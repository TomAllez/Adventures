import Phaser from 'phaser';
import { gameConfig } from './config.js';
import { createNetworkClient } from './network/client.js';
import { BootScene } from './scenes/BootScene.js';
import { GameScene } from './scenes/GameScene.js';

const game = new Phaser.Game(gameConfig);

const getScene = <T>(key: string) => game.scene.getScene(key) as T;
const isActive = (key: string) => game.scene.isActive(key);

const net = createNetworkClient('ws://localhost:3000', {
  onConnected() {
    net.join(`Player${Math.floor(Math.random() * 1000)}`);
  },

  onError() {
    if (isActive('BootScene')) {
      getScene<BootScene>('BootScene').showError('Could not connect to server.\nIs the server running?');
    }
  },

  onWelcome(playerId, state) {
    game.scene.start('GameScene', { net, playerId, state });
    game.scene.stop('BootScene');
  },

  onTick(_tick, state) {
    if (isActive('GameScene')) getScene<GameScene>('GameScene').applyState(state);
  },

  onPlayerJoined(player) {
    if (isActive('GameScene')) getScene<GameScene>('GameScene').addPlayer(player);
  },

  onPlayerLeft(playerId) {
    if (isActive('GameScene')) getScene<GameScene>('GameScene').removePlayer(playerId);
  },
});
