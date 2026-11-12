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
      paypal/                  <- mock.js, sandbox.js, mapping.js (Phase 2/3)
      app.js service.js store.js events.js   <- Express API + approval logic (Phase 2)
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

## API (built in Phase 2)
- `GET  /api/config` -> `{ paypalMode, llmProvider, defaultAsOf, today, demoTools }`
- `GET  /api/invoices?asOf=YYYY-MM-DD[&refresh=1]` -> `{ asOf, rows: [{ invoice, decision, rejected }] }`
- `POST /api/invoices/:id/approve` body `{ asOf, subject?, body? }` -> re-checks policy on the server, then PayPal remind (+ partial payment for split offers)
- `POST /api/invoices/:id/reject` body `{ asOf }`
- `POST /api/webhooks/paypal` -> verifies signature with PayPal, then refreshes + pushes an SSE event
- `POST /api/demo/pay/:id` -> demo button: records a payment, goes through the same webhook handler
- `GET  /api/events` (SSE) and `GET /api/audit`
- `GET  /api/paypal/activity` -> `{ engine, entries: [{ at, via: agent-toolkit|rest|mock, tool, invoiceId?, ok, ms, error? }] }` (client: show as a "PayPal activity" panel)
State is in memory (resets on restart). Reminder history is tracked locally (PayPal doesn't give us stage info).

## PayPal tech used (hackathon requirement: at least one PayPal technology, sandbox)
**PayPal Agent Toolkit (`@paypal/agent-toolkit`, the official tool layer behind PayPal's MCP server)** on top of the **Invoicing API v2**, plus **Webhooks**.
`PAYPAL_MODE=sandbox` runs every invoice action through toolkit tools via `PayPalAPI.run(tool, args)` in `server/src/paypal/toolkit.js`:
`list_invoices`, `get_invoice`, `send_invoice_reminder`, `record_payment_for_invoice` (and `send_invoice` in the seed script).
Plain REST is used ONLY where the toolkit has no tool: webhook signature verification, enabling partial payments on an already-sent
invoice (full-invoice PUT), and creating seed invoices with due dates (the toolkit's `create_invoice` has no due-date field).
Every call is logged (`GET /api/paypal/activity`, entries say `agent-toolkit` or `rest`). `PAYPAL_MODE=sandbox-rest` is the REST-only escape hatch.
Details and what is verified: `docs/PHASE3_NOTES.md`.

REST details, checked against developer.paypal.com on Nov 11, 2026:
- `POST /v2/invoicing/invoices/{id}/remind` body: `subject`, `note`, `send_to_recipient`, `additional_recipients`, `send_to_invoicer`. Max 2 reminders/day per API caller.
- `GET /v2/invoicing/invoices?page&page_size&total_required` -> `{ total_pages, total_items, items }`.
- Partial payment is `configuration.partial_payment { allow_partial_payment, minimum_amount_due }`. **Not available for accounts in India, Brazil or Israel**: use a US sandbox business account.
- Invoice date and due date must be **today or later**, so past-due invoices cannot be seeded. Use the demo date (`asOf`).
- Create invoice returns a link, not an id: the id is the last path segment of `href`.
- Webhooks: `INVOICING.INVOICE.CREATED / SENT / CANCELLED / PAID / REFUNDED`. Verify with `POST /v1/notifications/verify-webhook-signature` using the webhook id from the dashboard (not the client id). Events only fire for the REST app that did the action. The webhook simulator can't pass verification.
- Recording a payment via `POST /v2/invoicing/invoices/{id}/payments` fires the PAID webhook (used by the demo button).

**Written from the docs/package source but NOT yet run against a real sandbox** (test first, in this order):
0. `npm run smoke:paypal` (OAuth, toolkit `list_invoices`, `get_invoice`; then `-- --remind <id>` for one real reminder)
1. `npm run seed:sandbox` (create/send body shape, `business_name` field, `href` id parsing, toolkit `send_invoice`)
2. approve -> remind (note length limits unknown)
3. split offer -> `ensurePartialPayment` (GET + PUT on an already-sent invoice is unverified; failure is non-fatal and reported in the UI)
4. demo pay button -> toolkit `record_payment_for_invoice` (`CASH` is a valid method in the toolkit schema)
5. real webhook with a public URL (ngrok/Render) and `PAYPAL_WEBHOOK_ID`

## Commands
```
npm run install:all          # root: installs server + client
cd server && npm test        # 79 tests
cd server && npm run preflight     # checks PayPal + AI setup, says exactly what to fix
cd server && npm run smoke:deployed -- https://YOUR-APP.onrender.com   # read-only post-deploy check (never sends anything)
cd server && npm run smoke:paypal  # deeper: every toolkit tool Nudge uses (add --remind INV2-XXX to send one real email)
cd server && npm run demo    # prints decisions for sample invoices (mock AI)
cd server && npm run dev     # API on :3001   (copy .env.example to .env first)
cd client && npm run dev     # UI on :5173, proxies /api to :3001
npm run build && npm start   # production: Express serves client/dist
cd server && npm run smoke:paypal   # FIRST real-sandbox check: OAuth, toolkit list_invoices, get_invoice (add --remind <id> to send one email)
cd server && npm run seed:sandbox   # create demo invoices in the PayPal sandbox (toolkit send_invoice)
```

## Who does what (to avoid merge conflicts)
- `server/src/agent/**`, `docs/**`, `AGENTS.md`: Claude-owned. IDE agents: don't rewrite; ask or open a small PR.
- `client/**`, `server/src/routes/**`, deploy config: IDE agent.
- `server/src/paypal/**`, `server/src/service.js`: Claude wrote these; IDE agent should debug against the real sandbox and keep the tests passing.

## Checklist
- [x] Phase 1: agent policy, prompt, schema, fallbacks, tests, demo, this file
- [x] Phase 2: Express API, React dashboard, live updates (SSE), approve/edit/reject, audit log, mock PayPal, tested in a browser
- [~] Phase 3: PayPal adapter rebuilt on @paypal/agent-toolkit, activity log + endpoint, seed + smoke scripts, 56 tests (fake toolkit). NOT yet run against the real sandbox: do `npm run smoke:paypal` first
- [x] Phase 4 (code): toolkit mode checked against the real @paypal/agent-toolkit 1.11.0 source (request shapes, error JSON incl. status, so the 400/422 REST fallback does trigger); PayPal tech is visible in the UI (engine badge, "what PayPal will run" preview, confirmation naming the tool, live PayPal tool-call panel); preflight command; end-to-end run in toolkit mode with a PayPal-shaped fake
- [ ] Phase 4 (needs YOUR keys): `npm run preflight`, then `npm run smoke:paypal`, then `npm run seed:sandbox`, then approve one real reminder and confirm the email arrives
- [x] Phase 5 (code): AI call timeout (20 s) + hourly AI budget cap + 10 s "Re-run agent" throttle (public-URL cost safety), graceful SIGTERM shutdown, loading state + stale-card guard in the UI, mobile layout checked at 390 px, `smoke:deployed` post-deploy check, `docs/DEPLOY.md`, Render build/start commands run from a clean copy (10 s build, serves app, SPA fallback, 404 JSON for unknown /api)
- [ ] Phase 5 (needs YOU): deploy on Render (docs/DEPLOY.md), then run `npm run smoke:deployed`
- [ ] Phase 6: README, Devpost text, video script, submission checklist
- [ ] Upgrade A: client payment-behavior scoring (history already feeds the agent)
- [ ] Upgrade B: client-facing negotiation page for the split offer
