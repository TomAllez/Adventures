import type { Player } from '../types/player.js';
import type { GameState } from '../types/world.js';

export type ServerMessage =
  | { type: 'welcome'; playerId: string; state: GameState }
  | { type: 'tick'; tick: number; state: GameState }
  | { type: 'player_joined'; player: Player }
  | { type: 'player_left'; playerId: string };
