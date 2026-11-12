# Deploying Nudge on Render

Render is a hackathon sponsor with its own prize, so a hosted demo is worth the 20 minutes.
These steps are from Render's documented Blueprint format; the dashboard button names may differ slightly.

## Before you start
- Push the repo to GitHub (public).
- Locally, `npm run preflight` should show no `[FAIL]` lines with your real keys.

## 1. First deploy in mock mode (proves the plumbing)
1. Render dashboard -> **New** -> **Blueprint** -> pick your repo. It reads `render.yaml`.
2. Secrets are marked `sync: false`, so Render asks for them. For the first deploy leave them blank.
3. Wait for the build (about 10 s locally; allow a few minutes on Render's free tier).
4. Check it from your laptop:
   ```
   cd server
   npm run smoke:deployed -- https://YOUR-APP.onrender.com
   ```
   Expect `[PASS]` for health, dashboard, invoices; `[WARN]` for mock modes is normal at this stage.

## 2. Switch to the real PayPal sandbox and AI
In the Render dashboard -> your service -> **Environment**, set:

| Variable | Value |
|---|---|
| `PAYPAL_MODE` | `sandbox` |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | your **Sandbox** app credentials |
| `PAYPAL_TEST_PAYER_EMAIL` | your sandbox personal account email |
| `LLM_PROVIDER` | `claude` (or `gemini`) |
| `ANTHROPIC_API_KEY` (or `GEMINI_API_KEY`) | your key |
| `LLM_MAX_CALLS_PER_HOUR` | `120` (keep it: the URL is public) |

Save; Render redeploys. Run `npm run seed:sandbox` **locally** (same credentials) to create the demo invoices, then re-run the smoke check. Expect no `[WARN]` for modes.

## 3. Register the webhook (optional but good for the demo)
1. developer.paypal.com -> your sandbox app -> **Webhooks** -> add `https://YOUR-APP.onrender.com/api/webhooks/paypal`.
2. Select the invoicing events (`INVOICING.INVOICE.PAID` at least).
3. Copy the **webhook id** into Render as `PAYPAL_WEBHOOK_ID`, redeploy.
4. `npm run preflight` (locally, with the same id) should show `[PASS] Webhook`.
Without this, real webhooks are rejected (by design) and the demo "client pays" button still updates the dashboard.

## Things to know before you record the video
- **Free instances sleep when idle** (from memory of Render's free tier; check their docs). Open the URL about a minute before recording so it is awake.
- **State is in memory.** A restart or redeploy clears the approvals log and reminder history. Do not redeploy between takes.
- **The URL is public.** Anyone who finds it can approve sandbox reminders and trigger AI calls. The hourly AI cap and the 10 s "Re-run agent" throttle limit the cost. Set `DEMO_TOOLS=off` if you do not want the "simulate the client paying" button visible.
- **Do not set `ALLOW_UNVERIFIED_WEBHOOKS=1`** on a hosted instance. The smoke check fails if an unsigned webhook is accepted.
- If AI drafts show "Template fallback", the reason is shown on the card (key, model name, timeout, or the hourly cap).
