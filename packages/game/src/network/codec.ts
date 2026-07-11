import type { ClientMessage, ServerMessage } from '@org/common';

export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    return JSON.parse(raw) as ServerMessage;
  } catch {
    return null;
  }
}

export function serializeClientMessage(msg: ClientMessage): string {
  return JSON.stringify(msg);
}
