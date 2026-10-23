// Compare displayed draft values before trimming or converting them. Unchanged
// imported whitespace and local datetime representations are not edit intent.
export function changedDraftFields<Draft extends object, Patch extends object>(
  draft: Draft,
  initial: Draft,
  normalized: Patch,
): Patch {
  const changes = { ...normalized };
  for (const key of Object.keys(changes) as (keyof Patch & string)[]) {
    if (key in draft && key in initial &&
      Object.is(Reflect.get(draft, key), Reflect.get(initial, key))) {
      delete changes[key];
    }
  }
  return changes;
}
