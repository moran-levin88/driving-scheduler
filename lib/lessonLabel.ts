// A standard lesson is 40 minutes = 1 unit; 20 דק' = חצי שיעור, 60 = שיעור
// וחצי, 80 = 2 שיעורים, etc. Used on invoice line descriptions so the
// receipt itself says how many lessons it covers, not just the duration.
export function formatLessonCount(durationMin: number): string {
  const units = durationMin / 40
  if (units === 0.5) return 'חצי שיעור'
  if (units === 1) return 'שיעור'
  if (units === 1.5) return 'שיעור וחצי'
  if (Number.isInteger(units)) return `${units} שיעורים`

  const whole = Math.floor(units)
  const frac = units - whole
  if (Math.abs(frac - 0.5) < 1e-9) return whole > 0 ? `${whole} וחצי שיעורים` : 'חצי שיעור'
  // An odd fraction (e.g. a 30-min lesson = 0.75 unit) — no clean Hebrew
  // phrase for it, just state the number.
  return `${units} שיעורים`
}
