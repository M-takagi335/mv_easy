import { useSyncExternalStore } from 'react';

export function createPlayhead(initial: number) {
  let time = initial;
  const listeners = new Set<() => void>();
  return {
    read: () => time,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    update(next: number) {
      if (Object.is(time, next)) return;
      time = next;
      for (const listener of listeners) listener();
    },
  };
}

export type Playhead = ReturnType<typeof createPlayhead>;

export function usePlayhead(playhead: Playhead) {
  return useSyncExternalStore(playhead.subscribe, playhead.read);
}
