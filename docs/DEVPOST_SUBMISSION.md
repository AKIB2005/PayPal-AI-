# Devpost submission text (copy-paste)

Anything in double square brackets, like the markers below, is something only YOU can fill in.
Run `npm run check:submission` from the repo root: it fails while any marker is left in this file.

---

## Project name
Nudge

## Tagline (short)
AI that chases late invoices, with you in control

## Elevator pitch
Nudge reads your overdue PayPal invoices, decides how firm to be, explains why, and drafts the reminder. You approve, edit or reject it. Only then does PayPal's own Agent Toolkit send it.

---

## About the project (paste into the story box; Markdown works)

### Inspiration
Every freelancer and small business knows the awkward part of getting paid: the work is done, the invoice is late, and you have to chase it. Too soft and you get ignored; too hard and you risk the client. Scheduled reminders treat a client who is two days late the same as one who is three weeks late. We wanted an assistant that reasons about each invoice like a careful person would, but that never touches money without a human saying yes.

### What it does
- Reads overdue invoices from the PayPal sandbox and, for each one, picks a stage: **friendly, firm, final notice, or a split-payment offer**, or decides to **wait**.
- **Explains its reasoning** in plain language (days overdue, earlier reminders, the client's payment history) and drafts the message.
- Offers **payment plans** for badly overdue invoices. The installment amounts are calculated by code, never by the AI.
- A human **approves, edits or rejects** every draft. Nothing is sent otherwise.
- On approval, **PayPal's Agent Toolkit** sends the reminder (and enables partial payments for split offers). The dashboard shows which PayPal tool ran and how long it took.
- **PayPal webhooks** update invoice status live: when a client pays, the invoice moves to Closed without a refresh.

### How we built it
- **Rules decide what is allowed; the AI chooses within it.** A deterministic policy engine works out days overdue, a cooldown between reminders, an escalation ladder (never softer than the last reminder, no final notice without an earlier one) and a minimum amount for split offers. The AI can only pick from the allowed stages.
- **The AI never writes money.** It writes placeholders; code fills in amounts and payment plans. If a model writes a currency amount, its output is rejected and a template is used instead (and the UI says so).
- **Human approval is part of the data contract**, and the server re-checks policy at approval time, so a tampered browser request cannot send something the rules forbid.
- **PayPal layer:** the official **PayPal Agent Toolkit** (`@paypal/agent-toolkit`) for `list_invoices`, `get_invoice`, `send_invoice_reminder`, `record_payment_for_invoice` and `send_invoice`; the **Invoicing API v2** (REST) where the toolkit has no matching tool (creating invoices with due dates, enabling partial payments); and **Webhooks** (`INVOICING.INVOICE.*`) with signature verification through PayPal. We checked the toolkit's request shapes against its installed source and built a documented REST fallback.
- **AI:** [[MODEL NAME, e.g. Claude Sonnet via the Anthropic Messages API]] chooses the stage and writes the draft as strict JSON. The provider is swappable (Claude, Gemini, or an offline mock so the app runs with no keys).
- **Stack:** Node.js + Express, React + Vite, Server-Sent Events for live updates. 79 automated tests. A `preflight` command checks PayPal and AI setup and tells you what to fix; a read-only `smoke:deployed` command checks a hosted instance.
- **Safe to put online:** AI calls time out after 20 seconds, are capped per hour, and "Re-run agent" is throttled, so a public URL cannot run up an AI bill.

### Challenges we ran into
- **PayPal will not create past-due invoices in the sandbox** (invoice and due dates must be today or later). We seed invoices with staggered future due dates and added a clearly labelled simulated demo date to show the 2-day and 3-week cases.
- **Making AI safe around money.** Our answer was structural rather than a prompt: allowed stages from code, amounts from code, a human gate, and server-side re-checks.
- **Tool details:** the toolkit's reminder tool sends its arguments as the request body, so we wrapped it with a fallback to the documented REST body and label every REST call as REST in the activity panel.
- Partial payments are not available in every country per PayPal's docs, so a split offer degrades gracefully: the plan still appears in the message if PayPal declines the update.

### Accomplishments that we're proud of
- The AI cannot invent an amount or skip approval. This is enforced in code and covered by tests.
- The PayPal tools are visible in the product: a badge for the engine in use, a preview of what PayPal will run before you approve, and a live log of every call.
- It runs end to end with **no keys at all** (mock mode), so anyone can try it in two minutes.
- [[KEEP THIS LINE ONLY IF TRUE: We ran the full flow (seed invoices, AI draft, approve, PayPal reminder, webhook) against the live PayPal sandbox.]]

### What we learned
Trust in a money-handling agent comes from structure (limits, a human gate, honest labelling of what ran) more than from a clever prompt. Building on the Agent Toolkit also showed how much a well-defined tool layer simplifies an agent.

### What's next
A client-facing page where the customer picks one of the pre-approved payment plans; payment-behaviour scoring from real payment history; persistent storage; multi-currency; and extending the same approve-then-act pattern to other PayPal products.

---

## Built with (tags)
paypal-agent-toolkit, paypal-invoicing-api, paypal-webhooks, paypal-sandbox, claude-api, nodejs, express, react, vite, server-sent-events[[, render  (add only if you deployed there)]]

## PayPal technologies used
- PayPal **Agent Toolkit** (`@paypal/agent-toolkit`): list_invoices, get_invoice, send_invoice_reminder, record_payment_for_invoice, send_invoice
- PayPal **Invoicing API v2**: create invoice with due date, partial payments (`minimum_amount_due`)
- PayPal **Webhooks**: `INVOICING.INVOICE.*`, verified via `/v1/notifications/verify-webhook-signature`
- PayPal **sandbox** only (no real money)

## AI tools and models used, and how
**Inside the product:** [[MODEL NAME]] (via [[Anthropic Messages API / Gemini API]]) chooses one stage from the set the policy engine allows, writes a short reasoning and drafts the message as strict JSON. It never calculates amounts and never sends anything.
**To build it:** Claude (Anthropic) was used for architecture, the agent and policy logic, tests and documentation. [[NAME THE IDE AGENT YOU USED, e.g. Google Antigravity or GitHub Copilot, AND WHAT IT DID, e.g. scaffolding, PayPal toolkit integration, debugging]]. All code was run and tested by us; the test suite has 79 tests.

## New project statement
Nudge was created during the Submission Period (we started on November 10, 2026); it is not an earlier project.

## Try it out (links)
- Code: [[PUBLIC GITHUB REPO URL]]
- Demo video: [[YOUTUBE URL (Public)]]
- [[Hosted demo URL, only if you deployed; otherwise delete this line]]

## Testing instructions (for judges)
No keys are needed to run the app: it starts in mock mode with sample invoices.
```
git clone [[PUBLIC GITHUB REPO URL]]
cd [[REPO FOLDER NAME]]
npm run install:all
npm run build
cd server
cp .env.example .env        # Windows: copy .env.example .env
npm start                   # open http://localhost:3001
```
Then: (1) read an agent decision and its reasoning; (2) edit a draft and click **Approve & send**; (3) watch the **PayPal tool calls** panel; (4) use the **+7 days** button to move the demo date and see stages change; (5) click **Demo: simulate the client paying** to see the live webhook update.
To use the real PayPal sandbox and a real AI model, create a free sandbox app at developer.paypal.com and follow the "Use the real PayPal sandbox" section of the README (`npm run preflight` checks the setup). We have not published our own keys.

---

## Cheat-sheet: how this maps to the judging criteria (for your video, not for the form)
| Criterion (equal weight) | What to show |
|---|---|
| Technological Implementation | Agent Toolkit call in the panel, webhook update, policy + AI + guardrails, 79 tests |
| Design | The whole flow in one screen: decide, edit, approve, confirm, live update |
| Potential Impact | The real problem: freelancers losing hours and relationships to late invoices |
| Innovation | Policy-bounded AI with a human gate and code-calculated payment plans |
| Presentation | End-to-end working demo under 3 minutes, honest about limits |

Prizes that fit: Best Use of PayPal + AI, Best Use of Agentic Commerce, Best Demo Delivery, Most Impactful. [[Render prize only if you deployed on Render.]]
