import { WORLD_WIDTH, WORLD_HEIGHT } from '@org/common';
import type { PlayerInput, TileMap } from '@org/common';
import type { Send } from './network/server.js';
import { createHttpServer } from './network/http.js';
import { createNetworkServer } from './network/server.js';
import { createGameState, addPlayer, removePlayer, tickState } from './game/state.js';
import { startGameLoop } from './game/loop.js';
import { loadMap, saveMap } from './game/map.js';

const PORT = 3000;

let state = createGameState();
let currentMap: TileMap = loadMap();
const inputs = new Map<string, PlayerInput>();

// Assigned after createNetworkServer; safe because HTTP callbacks fire asynchronously
let broadcast: Send = () => {};

const httpServer = createHttpServer({
  getMap: () => currentMap,
  setMap: async (newMap) => {
    currentMap = newMap;
    broadcast({ type: 'map_updated', map: newMap });
    await saveMap(newMap);
  },
});

const ws = createNetworkServer(httpServer, {
  onJoin(id, name, send) {
    const player = {
      id,
      name,
      position: { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 },
      velocity: { x: 0, y: 0 },
    };
    state = addPlayer(state, player);
    send({ type: 'welcome', playerId: id, state, map: currentMap });
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

broadcast = ws.broadcast;

startGameLoop((deltaMs) => {
  state = tickState(state, inputs, currentMap, deltaMs);
  broadcast({ type: 'tick', tick: state.tick, state });
});

httpServer.listen(PORT, () => {
  console.log(`Server → ws://localhost:${PORT}  http://localhost:${PORT}`);
});
