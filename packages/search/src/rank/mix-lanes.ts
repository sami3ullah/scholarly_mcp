/**
 * Makes sure the first `within` results hold more than one language lane when another lane
 * has a result that may move (ADR 0044): when they all come from the first result's lane,
 * the best movable result of any other lane moves up to place `within`, and the rest keep
 * their order. The search service lets only results related in meaning move, so a lone word
 * match never jumps the queue.
 */
export function mixLanes<T>(
  ordered: readonly T[],
  laneOf: (result: T) => number | undefined,
  within: number,
  canMove: (result: T) => boolean = () => true,
): T[] {
  const [first] = ordered;
  if (first === undefined || within < 1) return [...ordered];
  const lead = laneOf(first);
  if (ordered.slice(0, within).some((result) => laneOf(result) !== lead)) return [...ordered];
  const other = ordered.findIndex((result) => laneOf(result) !== lead && canMove(result));
  if (other === -1) return [...ordered];
  const mixed = ordered.filter((_, index) => index !== other);
  mixed.splice(within - 1, 0, ordered[other] as T);
  return mixed;
}
