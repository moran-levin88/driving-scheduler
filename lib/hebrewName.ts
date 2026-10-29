// Hebrew letters (א-ת) plus the punctuation that legitimately shows up in
// Hebrew names — hyphen for compound names (בת-אל), geresh/gershayim (and
// a plain apostrophe/quote as the common keyboard substitute) for
// transliterated sounds (ג'ורג'). Must start with an actual Hebrew letter
// so punctuation or whitespace alone never passes.
const HEBREW_NAME_RE = /^[א-ת][א-ת'"׳״\- ]*$/

export function isHebrewName(value: unknown): value is string {
  return typeof value === 'string' && HEBREW_NAME_RE.test(value.trim())
}

// Strips any character that isn't a Hebrew letter or the punctuation above
// — for filtering input as the student types, so the field only ever
// accepts Hebrew regardless of which UI language (he/ru) is selected.
export function filterHebrewInput(value: string): string {
  return value.replace(/[^א-ת'"׳״\- ]/g, '')
}
