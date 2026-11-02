/** The current time, injected so tests are deterministic. */
export interface Clock {
  now(): Date;
}
