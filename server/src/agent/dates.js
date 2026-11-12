const DAY = 86400000;

export function toDayNumber(d) {
  const t = typeof d === 'string'
    ? Date.parse(d.length === 10 ? `${d}T00:00:00Z` : d)
    : d.getTime();
  if (Number.isNaN(t)) throw new Error(`Invalid date: ${d}`);
  return Math.floor(t / DAY);
}

export function daysBetween(from, to) {
  return toDayNumber(to) - toDayNumber(from);
}

export function addDays(isoDate, n) {
  const t = toDayNumber(isoDate) * DAY + n * DAY;
  return new Date(t).toISOString().slice(0, 10);
}

// The "demo date": lets you show 2-day and 3-week cases in a sandbox.
export function resolveAsOf(override) {
  const v = override || process.env.DEMO_DATE;
  return v ? v : new Date().toISOString().slice(0, 10);
}
