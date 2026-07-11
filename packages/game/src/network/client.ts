import type { ClientMessage, GameState, Player, PlayerInput } from '@org/common';
import { parseServerMessage, serializeClientMessage } from './codec.js';

export type NetworkCallbacks = {
  onConnected: () => void;
  onError: () => void;
  onWelcome: (playerId: string, state: GameState) => void;
  onTick: (tick: number, state: GameState) => void;
  onPlayerJoined: (player: Player) => void;
  onPlayerLeft: (playerId: string) => void;
};

export type NetworkClient = {
  join: (name: string) => void;
  sendInput: (tick: number, input: PlayerInput) => void;
};

export function createNetworkClient(url: string, callbacks: NetworkCallbacks): NetworkClient {
  const ws = new WebSocket(url);

  ws.onopen = () => callbacks.onConnected();
  ws.onerror = () => callbacks.onError();
  ws.onclose = () => callbacks.onError();

  ws.onmessage = (event: MessageEvent<string>) => {
    const msg = parseServerMessage(event.data);
    if (!msg) return;
    switch (msg.type) {
      case 'welcome':       callbacks.onWelcome(msg.playerId, msg.state); break;
      case 'tick':          callbacks.onTick(msg.tick, msg.state); break;
      case 'player_joined': callbacks.onPlayerJoined(msg.player); break;
      case 'player_left':   callbacks.onPlayerLeft(msg.playerId); break;
    }
  };

  const send = (msg: ClientMessage) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(serializeClientMessage(msg));
  };

  return {
    join: (name) => send({ type: 'join', name }),
    sendInput: (tick, input) => send({ type: 'input', tick, input }),
  };
}
