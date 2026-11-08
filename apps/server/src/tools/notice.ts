/**
 * The `notice` every response carries (ARCHITECTURE.md tool contracts). The publisher's name comes
 * from config, so the generic server names whichever publisher its preset is for (ADR 0015).
 */
export function noticeFor(publisher: string): string {
  return `Evidence pointers, not clinical advice. Independent prototype, not affiliated with ${publisher}.`;
}
