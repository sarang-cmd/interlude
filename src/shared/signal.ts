/**
 * Minimal observable — no external deps.
 * Signal<T> holds a value, emits to subscribers on change.
 */
export type Subscriber<T> = (value: T, previous: T) => void;

export class Signal<T> {
  private subscribers = new Set<Subscriber<T>>();
  private current: T;

  constructor(initial: T) {
    this.current = initial;
  }

  get value(): T {
    return this.current;
  }

  set(next: T): void {
    const prev = this.current;
    if (Object.is(prev, next)) return;
    this.current = next;
    for (const sub of this.subscribers) sub(next, prev);
  }

  subscribe(sub: Subscriber<T>): () => void {
    this.subscribers.add(sub);
    return () => this.subscribers.delete(sub);
  }
}

/** boolean signal with named reasons for diagnostics */
export interface GeneratingState {
  generating: boolean;
  reasons: string[];
}
