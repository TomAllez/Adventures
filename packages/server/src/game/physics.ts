import { PLAYER_SPEED, PLAYER_RADIUS, Tile } from '@org/common';
import type { Player, PlayerInput, TileMap } from '@org/common';

export function movePlayer(player: Player, input: PlayerInput, deltaMs: number, map: TileMap): Player {
  const dt = deltaMs / 1000;
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);

  const velocity = { x: dx * PLAYER_SPEED, y: dy * PLAYER_SPEED };

  // Resolve axes independently to allow wall-sliding
  let { x, y } = player.position;

  const nx = x + velocity.x * dt;
  if (!isCollidingAt(nx, y, map)) x = nx;

  const ny = y + velocity.y * dt;
  if (!isCollidingAt(x, ny, map)) y = ny;

  return { ...player, position: { x, y }, velocity };
}

function isCollidingAt(cx: number, cy: number, map: TileMap): boolean {
  const r = PLAYER_RADIUS;
  return (
    isWallAt(cx - r, cy - r, map) ||
    isWallAt(cx + r, cy - r, map) ||
    isWallAt(cx - r, cy + r, map) ||
    isWallAt(cx + r, cy + r, map)
  );
}

function isWallAt(wx: number, wy: number, map: TileMap): boolean {
  const col = Math.floor(wx / map.tileSize);
  const row = Math.floor(wy / map.tileSize);
  if (col < 0 || col >= map.width || row < 0 || row >= map.height) return true;
  return map.tiles[row][col] === Tile.Wall;
}
