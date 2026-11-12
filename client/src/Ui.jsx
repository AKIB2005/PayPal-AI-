import React, { useEffect, useRef, useState } from 'react';

/* ---------- Icons (inline SVG, no dependencies) ---------- */
const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
export const Icon = {
  Bell: (p) => <svg {...base} {...p}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>,
  Sparkle: (p) => <svg {...base} {...p}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z" /></svg>,
  Shield: (p) => <svg {...base} {...p}><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>,
  User: (p) => <svg {...base} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></svg>,
  Send: (p) => <svg {...base} {...p}><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></svg>,
  Check: (p) => <svg {...base} strokeWidth={3} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  Clock: (p) => <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  Refresh: (p) => <svg {...base} {...p}><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 12A9 9 0 0 1 18.5 5.8L21 8" /><path d="M21 3v5h-5" /><path d="M3 21v-5h5" /></svg>,
  Calendar: (p) => <svg {...base} {...p}><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>,
  Bolt: (p) => <svg {...base} {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>,
  Layers: (p) => <svg {...base} {...p}><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></svg>,
  X: (p) => <svg {...base} strokeWidth={2.5} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>
};

/* ---------- Brand mark: original "Nudge" glyph in PayPal palette ---------- */
export function Logo({ size = 36 }) {
  return (
    <span className="logo" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 40 40" width={size} height={size}>
        <defs>
          <linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#009cde" /><stop offset="1" stopColor="#003087" /></linearGradient>
        </defs>
        <rect width="40" height="40" rx="11" fill="url(#lg1)" />
        <path d="M13 29V12h7.2c3.6 0 5.8 1.9 5.8 5s-2.2 5-5.8 5H17" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle className="logo-dot" cx="29" cy="28" r="3.2" fill="#ffc439" />
      </svg>
    </span>
  );
}

/* ---------- Count-up number (respects reduced motion) ---------- */
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reduced() || from.current === target) { setVal(target); from.current = target; return undefined; }
    const start = performance.now();
    const a = from.current;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      setVal(a + (target - a) * eased);
      if (t < 1) raf = requestAnimationFrame(tick); else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = target; };
  }, [target, duration]);
  return val;
}

export function Money({ value, currency = 'USD', decimals = 2 }) {
  const v = useCountUp(value);
  let text;
  try { text = new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v); }
  catch { text = `${currency} ${v.toFixed(decimals)}`; }
  return <span className="tnum">{text}</span>;
}

export function Count({ value }) {
  const v = useCountUp(value, 700);
  return <span className="tnum">{Math.round(v)}</span>;
}

/* ---------- Agent pipeline: Rules -> AI -> You -> PayPal ---------- */
const STEPS = [
  { key: 'rules', label: 'Rules', sub: 'decide what is allowed', icon: Icon.Shield },
  { key: 'ai', label: 'AI', sub: 'chooses and explains', icon: Icon.Sparkle },
  { key: 'you', label: 'You', sub: 'approve, edit or reject', icon: Icon.User },
  { key: 'paypal', label: 'PayPal', sub: 'sends the reminder', icon: Icon.Send }
];

export function Pipeline({ loading, pending }) {
  const [active, setActive] = useState(-1);
  useEffect(() => {
    if (!loading) { setActive(-1); return undefined; }
    setActive(0);
    const id = setInterval(() => setActive((a) => (a + 1) % 2), 700); // Rules <-> AI while the agent works
    return () => clearInterval(id);
  }, [loading]);

  return (
    <ol className={`pipeline${loading ? ' running' : ''}`} aria-label="How Nudge works">
      {STEPS.map((s, i) => {
        const S = s.icon;
        const state = loading ? (i === active ? 'active' : i < 2 ? 'warm' : '') : i === 2 && pending > 0 ? 'waiting' : 'done';
        return (
          <li key={s.key} className={`step ${state}`} style={{ '--i': i }}>
            <span className="step-icon"><S /></span>
            <span className="step-text"><b>{s.label}</b><small>{i === 2 && pending > 0 && !loading ? `${pending} waiting for you` : s.sub}</small></span>
            {i < STEPS.length - 1 && <span className="step-link" aria-hidden="true"><i /></span>}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Skeleton card shown while the agent is thinking ---------- */
export function Skeleton() {
  return (
    <div className="card skeleton" aria-hidden="true">
      <div className="sk-row"><span className="sk avatar" /><span className="sk-col"><span className="sk line w40" /><span className="sk line w25" /></span></div>
      <span className="sk line w90" /><span className="sk line w70" />
      <span className="sk block" />
    </div>
  );
}

/* ---------- Animated success check ---------- */
export function SuccessBurst({ label }) {
  return (
    <div className="burst" role="status"><div className="burst-in">
      <svg viewBox="0 0 52 52" width="64" height="64" aria-hidden="true">
        <circle className="burst-ring" cx="26" cy="26" r="23" fill="none" strokeWidth="3" />
        <path className="burst-check" d="M15 27l8 8 14-16" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p>{label}</p>
      <span className="confetti" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--n': i }} />)}</span>
    </div></div>
  );
}
