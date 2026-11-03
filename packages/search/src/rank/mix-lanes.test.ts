import { describe, expect, it } from 'vitest';
import { mixLanes } from './mix-lanes.js';

/** Results named by lane and place, such as `de1` and `en2`. */
const laneOf = (result: string) => (result.startsWith('de') ? 0 : 1);

describe('mixLanes', () => {
  it("moves the other lane's best result up to the last place within the window", () => {
    expect(mixLanes(['de1', 'de2', 'de3', 'de4', 'en1', 'en2'], laneOf, 3)).toEqual([
      'de1',
      'de2',
      'en1',
      'de3',
      'de4',
      'en2',
    ]);
  });

  it('leaves the order alone when the window already holds both lanes', () => {
    const ordered = ['en1', 'de1', 'en2', 'en3'];
    expect(mixLanes(ordered, laneOf, 3)).toEqual(ordered);
  });

  it('leaves the order alone when only one lane has results', () => {
    const ordered = ['en1', 'en2', 'en3', 'en4'];
    expect(mixLanes(ordered, laneOf, 2)).toEqual(ordered);
  });

  it('moves only a result that may move', () => {
    const movable = (result: string) => result !== 'en1';
    expect(mixLanes(['de1', 'de2', 'de3', 'en1', 'en2'], laneOf, 2, movable)).toEqual([
      'de1',
      'en2',
      'de2',
      'de3',
      'en1',
    ]);
    expect(mixLanes(['de1', 'de2', 'en1'], laneOf, 2, () => false)).toEqual(['de1', 'de2', 'en1']);
  });

  it('handles empty lists, short lists and a window of one', () => {
    expect(mixLanes([], laneOf, 5)).toEqual([]);
    expect(mixLanes(['de1', 'en1'], laneOf, 5)).toEqual(['de1', 'en1']);
    expect(mixLanes(['de1', 'de2', 'en1'], laneOf, 1)).toEqual(['en1', 'de1', 'de2']);
  });
});
