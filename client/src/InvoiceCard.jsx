import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { engineLabel, viaLabel } from './labels.js';
import { Icon, SuccessBurst } from './Ui.jsx';

const STAGE_LABEL = { wait: 'Wait', friendly: 'Friendly', firm: 'Firm', final: 'Final notice', split_offer: 'Split offer' };
const money = (c, v) => `${c} ${v}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

export default function InvoiceCard({ row, index = 0, asOf, config, onChange, onNotice }) {
  const { invoice, decision, rejected, error } = row;
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');

  // Reset the editor whenever the agent produces a new draft.
  useEffect(() => {
    setSubject(decision?.draft?.subject || '');
    setBody(decision?.draft?.body || '');
    setErr('');
  }, [decision]);

  if (error || !decision) {
    return <article className="card" style={{ '--i': index }}><b>{invoice.clientName}</b> <span className="muted">#{invoice.number}</span><p className="error">Agent error: {error}</p></article>;
  }

  const actionable = decision.stage !== 'wait' && !rejected;
  const edited = decision.draft && (subject !== decision.draft.subject || body !== decision.draft.body);
  const closed = ['PAID', 'MARKED_AS_PAID', 'CANCELLED', 'REFUNDED', 'MARKED_AS_REFUNDED'].includes(invoice.status);
  const overdue = decision.daysOverdue > 0 && !closed;

  // celebrate: play the success animation for a moment, then refresh the list.
  async function run(fn, ok, celebrate) {
    setBusy(true); setErr('');
    try {
      const r = await fn();
      const msg = ok(r);
      if (celebrate) { setDone(celebrate); await sleep(1300); }
      onNotice(`${invoice.clientName} #${invoice.number}: ${msg}`);
      onChange();
    } catch (e) { setErr(e.message); } finally { setBusy(false); setDone(''); }
  }

  const approve = () => run(
    () => api.approve(invoice.id, { asOf, subject, body }),
    (r) => `Sent via PayPal${r.paypal ? ` ${viaLabel(r.paypal.via)} › ${r.paypal.tool}` : ''}${r.edited ? ' (your edited version)' : ''}.${r.partialPayment ? ' ' + r.partialPayment.note : ''}`,
    'Reminder sent via PayPal'
  );
  const reject = () => run(() => api.reject(invoice.id, asOf), () => 'Rejected. Nothing was sent.');
  const pay = () => run(() => api.pay(invoice.id), () => 'Payment recorded.', 'Payment received');

  return (
    <article className={`card stage-${decision.stage}${rejected ? ' dim' : ''}`} style={{ '--i': index }}>
      {done && <SuccessBurst label={done} />}

      <div className="card-head">
        <div className="who">
          <span className="avatar" aria-hidden="true">{initials(invoice.clientName)}</span>
          <div>
            <h3>{invoice.clientName} <span className="muted">#{invoice.number}</span></h3>
            <p className="amount tnum">{closed ? money(invoice.amount.currency, invoice.amount.value) : <>{money(decision.currency, decision.amountDue)}<small>due</small></>}</p>
          </div>
        </div>
        <div className="pills">
          <span className="pill status">{invoice.status.replace(/_/g, ' ').toLowerCase()}</span>
          {overdue && <span className="pill days">{decision.daysOverdue} days overdue</span>}
          {!closed && <span className="pill stage">{STAGE_LABEL[decision.stage]}</span>}
        </div>
      </div>

      {!closed && <div className="why">
        <p className="label">
          <Icon.Sparkle width={14} height={14} /> Why this stage
          <span className={`src ${decision.source}`}>
            {decision.source === 'llm' ? `AI (${decision.provider})` : decision.source === 'fallback' ? 'Template fallback' : 'Policy'}
          </span>
        </p>
        <p className="reasoning">{decision.reasoning}</p>
        <p className="ladder">
          <Icon.Shield width={14} height={14} /> Policy allowed:
          {decision.allowedStages.map((s) => <span key={s} className={`mini ${s === decision.stage ? 'on' : ''}`}>{STAGE_LABEL[s]}</span>)}
        </p>
        {decision.source === 'fallback' && decision.fallbackReason && <p className="muted small">AI output was rejected: {decision.fallbackReason}</p>}
        {decision.policyNotes.length > 0 && decision.stage !== 'wait' && (
          <ul className="notes">{decision.policyNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        )}
      </div>}

      {decision.splitPlan && (
        <div className="split">
          <p className="label"><Icon.Layers width={14} height={14} /> Payment plan (calculated by code, not the AI)</p>
          <div className="plan">
            {decision.splitPlan.installments.map((i) => {
              const pct = Math.max(8, Math.min(100, (parseFloat(i.amount) / parseFloat(decision.splitPlan.total)) * 100));
              return (
                <div className="inst" key={i.number}>
                  <span className="n">{i.number}</span>
                  <div>
                    <b className="tnum">{money(decision.splitPlan.currency, i.amount)}</b>
                    <div className="bar"><i style={{ width: `${pct}%`, animationDelay: `${0.3 + i.number * 0.12}s` }} /></div>
                  </div>
                  <span className="when">by {i.dueDate}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {decision.draft && actionable && (
        <>
          <p className="label"><Icon.Send width={14} height={14} /> Your approval</p>
          <div className="draft">
            <p className="label">Draft message {edited && <span className="src edited">edited</span>}</p>
            <input aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={busy} />
            <textarea aria-label="Message" rows={8} value={body} onChange={(e) => setBody(e.target.value)} disabled={busy} />
            <div className="row">
              <button className="primary" onClick={approve} disabled={busy}>
                {busy ? <span className="btn-spinner" /> : <Icon.Send width={16} height={16} />}
                {busy ? 'Sending…' : edited ? 'Approve edited & send' : 'Approve & send'}
              </button>
              <button className="ghost" onClick={reject} disabled={busy}>Reject</button>
            </div>
            <p className="preview">
              On approve, PayPal {engineLabel(config?.paypalEngine, config?.paypalMode)} runs:{' '}
              {decision.stage === 'split_offer' && decision.splitPlan ? <>enable partial payments (minimum {money(decision.currency, decision.splitPlan.minimumAmountDue)}), then </> : null}
              <code>send_invoice_reminder</code>
            </p>
          </div>
        </>
      )}

      {rejected && <p className="muted">You rejected this suggestion. It will come back if anything changes.</p>}
      {err && <p className="error" role="alert">{err}</p>}

      {config?.demoTools && !closed && (
        <div className="demo-tools">
          <button className="link" onClick={pay} disabled={busy}>Demo: simulate the client paying</button>
        </div>
      )}
    </article>
  );
}
