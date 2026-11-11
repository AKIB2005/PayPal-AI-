# Nudge

An AI agent that chases overdue PayPal invoices for freelancers, with a human always in the loop.
The agent reads each overdue invoice, picks a stage (friendly, firm, final notice, or a split-payment offer),
explains why, and drafts the message. You approve, edit or reject. Only then does PayPal send it.

Built for the PayPal AI Hackathon. **PayPal tech:** REST Invoicing API v2 (list, remind, partial payments, record payment) and Webhooks (`INVOICING.INVOICE.*`), in the PayPal sandbox. **AI:** Claude or Gemini (swappable), with an offline mock mode.

## Run it in 2 minutes (no keys needed)
```bash
npm run install:all
npm run build
cd server && cp .env.example .env     # defaults: PAYPAL_MODE=mock, LLM_PROVIDER=mock
npm start                              # http://localhost:3001
```
Development with hot reload: `cd server && npm run dev` and `cd client && npm run dev` (UI on :5173).
Tests: `npm test` (38 tests).

## Use a real model
In `server/.env`: `LLM_PROVIDER=claude` and `ANTHROPIC_API_KEY=...` (or `gemini` and `GEMINI_API_KEY`). If the model fails or returns something unsafe, Nudge falls back to templates and says so in the UI.

## Use the real PayPal sandbox
1. Create a **US** sandbox business account and a sandbox personal account at developer.paypal.com. (PayPal partial payments are not available for accounts in India, Brazil or Israel.)
2. Create a REST app, copy the client id and secret into `server/.env`, set `PAYPAL_MODE=sandbox`, and set `PAYPAL_TEST_PAYER_EMAIL` to the personal account's email.
3. `cd server && npm run seed:sandbox` creates and sends five invoices.
4. In the dashboard set the demo date to the date the script prints (today + 21 days).
5. Webhooks (optional locally): register `https://<your-host>/api/webhooks/paypal` for the invoicing events, then put the webhook id in `PAYPAL_WEBHOOK_ID`. Without it, signature checks fail closed and the "simulate the client paying" button still updates the dashboard.

## How the agent decides
1. **Policy (code):** days overdue, cooldown between reminders, an escalation ladder (never softer than the last reminder, no final notice without an earlier one), a minimum amount for a split offer. This produces the list of *allowed* stages.
2. **AI:** picks one allowed stage using the client's payment history, explains why, drafts the message.
3. **Guardrails:** amounts and payment plans are calculated by code (the AI writes placeholders and is rejected if it writes a money amount); invalid output falls back to templates; every decision requires approval, and the server re-checks policy at approval time.

## Honest limitations
- **Demo date.** PayPal requires invoice due dates to be today or later, so past-due invoices can't be created in the sandbox. The dashboard has a simulated "today" so the 2-day and 3-week cases can be shown. This is for demonstration only.
- State is kept in memory and resets when the server restarts.
- PayPal enforces a maximum of 2 reminders per day per API caller.

## License
MIT
