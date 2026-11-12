// Cost guard for a public demo: cap AI calls per window. When the cap is hit the call throws,
// and decide() falls back to templates (the UI says so), so the app keeps working.
export function withBudget(fn, { max = 120, windowMs = 3600000, now = Date.now } = {}) {
  const stamps = [];
  return async (...args) => {
    const t = now();
    while (stamps.length && t - stamps[0] > windowMs) stamps.shift();
    if (stamps.length >= max) throw new Error(`AI call budget reached (${max} per ${Math.round(windowMs / 60000)} min); using templates`);
    stamps.push(t);
    return fn(...args);
  };
}
