import type { PlayerInput } from '../types/player.js';

export type ClientMessage =
  | { type: 'join'; name: string }
  | { type: 'input'; tick: number; input: PlayerInput };
