import { WORLD_WIDTH, WORLD_HEIGHT } from '@org/common';
import type { PlayerInput } from '@org/common';
import { createNetworkServer } from './network/server.js';
import { createGameState, addPlayer, removePlayer, tickState } from './game/state.js';
import { startGameLoop } from './game/loop.js';

const PORT = 3000;

let state = createGameState();
const inputs = new Map<string, PlayerInput>();

const { broadcast } = createNetworkServer(PORT, {
  onJoin(id, name, send) {
    const player = {
      id,
      name,
      position: { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 },
      velocity: { x: 0, y: 0 },
    };

    state = addPlayer(state, player);
    send({ type: 'welcome', playerId: id, state });
    broadcast({ type: 'player_joined', player });
    console.log(`[+] ${name} joined (${Object.keys(state.players).length} online)`);
  },

  onInput(id, input) {
    inputs.set(id, input);
  },

  onLeave(id) {
    const name = state.players[id]?.name ?? id;
    state = removePlayer(state, id);
    inputs.delete(id);
    broadcast({ type: 'player_left', playerId: id });
    console.log(`[-] ${name} left (${Object.keys(state.players).length} online)`);
  },
});

startGameLoop((deltaMs) => {
  state = tickState(state, inputs, deltaMs);
  broadcast({ type: 'tick', tick: state.tick, state });
});
