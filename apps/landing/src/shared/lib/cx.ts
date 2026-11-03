/** Joins CSS module class names, skipping missing ones. */
export function cx(...names: readonly (string | false | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}
