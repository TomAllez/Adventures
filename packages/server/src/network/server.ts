import type { PlayerInput, ServerMessage } from '@org/common';
import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { parseClientMessage, serializeServerMessage } from './codec.js';

export type Send = (msg: ServerMessage) => void;

export type ConnectionCallbacks = {
  onJoin: (id: string, name: string, send: Send) => void;
  onInput: (id: string, input: PlayerInput, tick: number) => void;
  onLeave: (id: string) => void;
};

export type NetworkServer = {
  broadcast: Send;
};

export function createNetworkServer(port: number, callbacks: ConnectionCallbacks): NetworkServer {
  const wss = new WebSocketServer({ port });
  const sockets = new Map<string, WebSocket>();

  wss.on('connection', (ws) => {
    const id = randomUUID();
    sockets.set(id, ws);

    const send: Send = (msg) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(serializeServerMessage(msg));
    };

    ws.on('message', (raw) => {
      const msg = parseClientMessage(raw.toString());
      if (!msg) return;
      if (msg.type === 'join') callbacks.onJoin(id, msg.name, send);
      else if (msg.type === 'input') callbacks.onInput(id, msg.input, msg.tick);
    });

    ws.on('close', () => {
      sockets.delete(id);
      callbacks.onLeave(id);
    });
  });

  const broadcast: Send = (msg) => {
    const serialized = serializeServerMessage(msg);
    for (const ws of sockets.values()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(serialized);
    }
  };

  console.log(`Server listening on ws://localhost:${port}`);

  return { broadcast };
}
