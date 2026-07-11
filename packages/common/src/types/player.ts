import type { Vector2 } from './geometry.js';

export type Player = {
  id: string;
  name: string;
  position: Vector2;
  velocity: Vector2;
};

export type PlayerInput = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
};
