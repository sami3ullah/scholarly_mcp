/**
 * Posts a beacon that survives the page being left: `sendBeacon`, else `fetch` with
 * `keepalive`. A beacon is a side record, so failures are ignored.
 */
export function sendBeacon(path: string, payload: object): void {
  const body = JSON.stringify(payload);
  const blob = new Blob([body], { type: 'application/json' });
  if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(path, blob)) return;
  void fetch(path, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
    keepalive: true,
  }).catch(() => undefined);
}

/**
 * Remembers in `sessionStorage` that a beacon was sent, so a reload in the same tab does not
 * send it again. Returns false when it was already sent. Storage can be off (private mode,
 * blocked cookies); callers keep their own in-memory guard for that case.
 */
export function markSent(key: string): boolean {
  try {
    if (sessionStorage.getItem(key) !== null) return false;
    sessionStorage.setItem(key, '1');
  } catch {
    // Storage is off: only the in-memory guard stops repeats.
  }
  return true;
}
