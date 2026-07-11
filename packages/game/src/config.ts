import Phaser from 'phaser';
import { WORLD_WIDTH, WORLD_HEIGHT } from '@org/common';
import { BootScene } from './scenes/BootScene.js';
import { GameScene } from './scenes/GameScene.js';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
  backgroundColor: '#1a1a2e',
  scene: [BootScene, GameScene],
};
