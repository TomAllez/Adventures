import { TICK_INTERVAL_MS } from '@org/common';

export type TickFn = (deltaMs: number) => void;

export function startGameLoop(onTick: TickFn): () => void {
  let lastTime = Date.now();

  const handle = setInterval(() => {
    const now = Date.now();
    onTick(now - lastTime);
    lastTime = now;
  }, TICK_INTERVAL_MS);

  return () => clearInterval(handle);
}
