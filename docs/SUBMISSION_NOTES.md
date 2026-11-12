# Submission notes (draft facts for the Devpost form)

**PayPal technology used (sandbox):** PayPal Agent Toolkit (`@paypal/agent-toolkit`) tools `list_invoices`, `get_invoice`, `send_invoice_reminder`, `record_payment_for_invoice`, `send_invoice`, on the Invoicing API v2 (partial payments via `minimum_amount_due`). Webhooks: `INVOICING.INVOICE.*` events, verified via `/v1/notifications/verify-webhook-signature`. A live "PayPal activity" log in the app shows each tool call.

**AI tools (fill in what you actually use):**
- Claude (model: ___) via the Messages API: chooses a stage from the policy-allowed set, writes the reasoning and the draft message as strict JSON.
- Claude / IDE agent (Antigravity or VS Code) used to write code. Say which.

**What the AI does vs. what code does:** code decides what is allowed and computes all money; the AI picks the tone, explains it, and writes the words; a human approves.

**Testing instructions for judges:** `npm run install:all && npm run build && cd server && cp .env.example .env && npm start`, then open http://localhost:3001. Mock mode needs no keys. Use the demo-date buttons to move time forward, approve a draft, then press "simulate the client paying" to see a live update.

## Technologies at a glance (for the "Built with" field and the video)
| PayPal technology | Where Nudge uses it |
|---|---|
| **PayPal Agent Toolkit** (`@paypal/agent-toolkit`) | `list_invoices`, `get_invoice`, `send_invoice_reminder`, `record_payment_for_invoice`, `send_invoice`: every approved reminder is sent by a toolkit tool |
| **Invoicing API v2** (REST) | Partial payments (`minimum_amount_due`) for split offers; creating seed invoices with due dates (the toolkit's create tool has no due-date field) |
| **Webhooks** | `INVOICING.INVOICE.*` events, signature-verified with PayPal, push live updates to the dashboard |
| **PayPal sandbox** | All of the above, no real money |

**Say this in the video (honest and strong):** "The agent only proposes. A human approves. Then PayPal's own Agent Toolkit sends the reminder, and you can see the exact tool call in the panel." Point at the **PayPal tool calls** panel while approving.

**Limits to state openly:** sandbox invoices cannot be created in the past, so the app has a simulated demo date; state is in memory; the toolkit's reminder tool posts its arguments as the request body, so Nudge falls back to the documented REST body only if PayPal rejects it (shown as REST in the panel).
