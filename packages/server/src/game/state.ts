import type { GameState, Player, PlayerInput, TileMap } from '@org/common';
import { movePlayer } from './physics.js';

const EMPTY_INPUT: PlayerInput = { up: false, down: false, left: false, right: false };

export function createGameState(): GameState {
  return { tick: 0, players: {} };
}

export function addPlayer(state: GameState, player: Player): GameState {
  return { ...state, players: { ...state.players, [player.id]: player } };
}

export function removePlayer(state: GameState, playerId: string): GameState {
  const { [playerId]: _, ...rest } = state.players;
  return { ...state, players: rest };
}

export function tickState(
  state: GameState,
  inputs: ReadonlyMap<string, PlayerInput>,
  map: TileMap,
  deltaMs: number,
): GameState {
  const players = Object.fromEntries(
    Object.entries(state.players).map(([id, player]) => [
      id,
      movePlayer(player, inputs.get(id) ?? EMPTY_INPUT, deltaMs, map),
    ]),
  );
  return { tick: state.tick + 1, players };
}
