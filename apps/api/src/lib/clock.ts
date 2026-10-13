export interface Clock {
  now(): Date;
  /** Today's calendar date in UTC as `YYYY-MM-DD`. */
  today(): string;
}

export const systemClock: Clock = {
  now: () => new Date(),
  today: () => new Date().toISOString().slice(0, 10),
};

/** A clock frozen at `isoInstant`; advance it with `set` to simulate time passing in tests. */
export function fixedClock(isoInstant: string): Clock & { set(isoInstant: string): void } {
  let current = new Date(isoInstant);
  return {
    now: () => new Date(current),
    today: () => current.toISOString().slice(0, 10),
    set: (next) => {
      current = new Date(next);
    },
  };
}
