import type { Player } from './player.js';

export type GameState = {
  tick: number;
  players: Record<string, Player>;
};
