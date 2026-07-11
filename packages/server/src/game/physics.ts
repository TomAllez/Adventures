import { PLAYER_SPEED, WORLD_WIDTH, WORLD_HEIGHT } from '@org/common';
import type { Player, PlayerInput } from '@org/common';

export function movePlayer(player: Player, input: PlayerInput, deltaMs: number): Player {
  const dt = deltaMs / 1000;
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);

  const velocity = { x: dx * PLAYER_SPEED, y: dy * PLAYER_SPEED };
  const position = {
    x: clamp(player.position.x + velocity.x * dt, 0, WORLD_WIDTH),
    y: clamp(player.position.y + velocity.y * dt, 0, WORLD_HEIGHT),
  };

  return { ...player, position, velocity };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
