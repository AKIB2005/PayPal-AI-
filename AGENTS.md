# AGENTS.md - Nudge (read this first in every session)

Shared context for Claude, Antigravity, Copilot, or any IDE agent. Update the checklist at the bottom after each phase.

## What Nudge is
An AI agent for freelancers that chases overdue PayPal invoices. For each overdue invoice it picks a stage
(friendly / firm / final / split offer), explains why, and drafts the message. A human ALWAYS approves,
edits or rejects before PayPal sends anything.

Hackathon: PayPal + AI must both be central; working demo required. Deadline: Nov 12, 12:00 PM PST (= Nov 13, 1:30 AM IST).
Treat **Nov 12 evening IST** as the real deadline.

Demo story (do not lose this): "It's not a cron job. Rules decide what is ALLOWED, the AI chooses within limits,
explains itself, and a human approves."

## Stack
- Node 18+ / Express (server), React + Vite (client), SQLite or MongoDB (small store). ES modules everywhere.
- Server agent code has ZERO npm dependencies (uses built-in fetch and node:test).
- LLM provider is swappable via `LLM_PROVIDER=mock|claude|gemini`. `mock` needs no key: build the UI with it.

## Folder structure
```
nudge/
  AGENTS.md  README.md  LICENSE
  docs/
  client/                      <- IDE agent builds this (React dashboard)
  server/
    package.json  .env.example
    scripts/demo.js            <- prints decisions for sample data
    src/
      config.js                <- ALL policy numbers (cooldown, stage days, split rules)
      agent/
        dates.js  split.js  policy.js  templates.js  prompt.js
        llm.js  schema.js  decide.js     <- DONE (Phase 1)
      data/sampleInvoices.json
      paypal/                  <- Phase 3 (invoicing service, webhook)
      routes/                  <- Phase 4 (Express API)
    test/
```

## Core rules (do not break)
1. **Rules decide what's allowed; the LLM chooses within it.** `policy.js` returns `allowedStages`.
2. **Money math stays in code.** Split plan amounts come from `split.js`. The LLM writes placeholders
   (`{{amountDue}}`, `{{splitPlan}}`) and `decide.js` fills them. If the LLM writes a money amount, its output is rejected.
3. **`requiresApproval` is always `true`.** `schema.js` throws otherwise. Never add a code path that sends without approval.
4. **LLM failure never breaks the app.** Invalid output -> template fallback, with `source: "fallback"` and `fallbackReason`.
5. **Demo date.** Sandbox invoices can't really be 3 weeks overdue. Everything takes an `asOf` date
   (`DEMO_DATE` env or request param). Say this openly in the README.

## The decision contract (agent -> API -> UI)
`decide({ invoice, history, asOf, provider })` returns:
```json
{
  "invoiceId": "INV-2003",
  "invoiceNumber": "0003",
  "clientName": "Acme Corp",
  "asOf": "2026-11-10",
  "daysOverdue": 21,
  "amountDue": "1200.00",
  "currency": "USD",
  "allowedStages": ["firm", "final", "split_offer"],
  "policyNotes": ["..."],
  "stage": "split_offer",                 // wait | friendly | firm | final | split_offer
  "reasoning": "1-2 sentences for the freelancer",
  "draft": { "subject": "...", "body": "..." },   // null when stage = "wait"
  "splitPlan": {                                   // null unless stage = "split_offer"
    "currency": "USD", "total": "1200.00", "minimumAmountDue": "400.00",
    "installments": [{ "number": 1, "amount": "400.00", "dueDate": "2026-11-17" }]
  },
  "source": "llm",                         // llm | fallback | policy
  "provider": "mock",                      // null for fallback/policy
  "fallbackReason": null,
  "requiresApproval": true
}
```

Input invoice shape (map PayPal's response into this in Phase 3):
```json
{ "id": "INV2-XXXX", "number": "0001", "clientId": "c1", "clientName": "Acme", "status": "SENT",
  "amount": { "currency": "USD", "value": "1200.00" }, "paidAmount": "0.00",
  "dueDate": "2026-10-20",
  "remindersSent": [{ "sentAt": "2026-10-30T09:00:00Z", "stage": "friendly" }] }
```
`history` per client: `{ "invoicesPaid": 4, "lateCount": 2, "avgDaysLate": 9 }` (drives the "payment-behavior" reasoning).

## Planned API (Phase 4)
- `GET  /api/invoices?asOf=YYYY-MM-DD` -> invoices + decision for each
- `POST /api/invoices/:id/approve` body `{ subject?, body? }` (edited text allowed) -> PayPal remind / apply split
- `POST /api/invoices/:id/reject` -> records rejection, no send
- `POST /api/webhooks/paypal` -> invoice paid/updated events

## PayPal (VERIFY in the official docs before coding; these are from memory)
- Invoicing API v2: create/list/get invoices, send reminder `POST /v2/invoicing/invoices/{id}/remind` (with `subject`, `note`).
- Split payment: simplest = partial payments with a minimum amount due on the invoice (`minimumAmountDue` in the plan).
- Webhooks for invoice paid events (don't poll).
- Seed invoices with past due dates if the API allows; otherwise rely on the demo-date offset.

## Commands
```
cd server
npm test        # 21 tests, no install needed
npm run demo    # prints decisions for sample invoices (mock provider)
LLM_PROVIDER=claude ANTHROPIC_API_KEY=... npm run demo
```

## Who does what (to avoid merge conflicts)
- `server/src/agent/**`, `docs/**`, `AGENTS.md`: Claude-owned. IDE agents: don't rewrite; ask or open a small PR.
- `client/**`, `server/src/routes/**`, deploy config: IDE agent.
- `server/src/paypal/**`: Claude (Phase 3), then IDE agent for debugging.

## Checklist
- [x] Phase 1: agent policy, prompt, schema, fallbacks, tests, demo, this file
- [ ] Phase 2: Express + React skeleton, dashboard with mock data (`LLM_PROVIDER=mock`)
- [ ] Phase 3: PayPal service layer (auth, list, remind, partial payment, webhook)
- [ ] Phase 4: wire agent + PayPal + UI; approve/edit/reject; sandbox debugging
- [ ] Phase 5: deploy (Render), polish, edge cases
- [ ] Phase 6: README, Devpost text, video script, submission checklist
- [ ] Upgrade A: client payment-behavior scoring (history already feeds the agent)
- [ ] Upgrade B: client-facing negotiation page for the split offer
