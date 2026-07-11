import type { Player } from '../types/player.js';
import type { TileMap } from '../types/tilemap.js';
import type { GameState } from '../types/world.js';

export type ServerMessage =
  | { type: 'welcome'; playerId: string; state: GameState; map: TileMap }
  | { type: 'tick'; tick: number; state: GameState }
  | { type: 'player_joined'; player: Player }
  | { type: 'player_left'; playerId: string }
  | { type: 'map_updated'; map: TileMap };
