# Nudge

An AI agent that chases overdue PayPal invoices for freelancers, with a human always in the loop.

> Status: Phase 1 (agent core) complete. Dashboard and PayPal integration are in progress. See `AGENTS.md`.

## Try the agent now (no API key, no install)
```
cd server
npm test
npm run demo
```
Use a real model: `LLM_PROVIDER=claude ANTHROPIC_API_KEY=... npm run demo` (or `gemini` with `GEMINI_API_KEY`).
Copy `server/.env.example` to `server/.env` for settings.

## How the agent decides
1. **Policy (code):** days overdue, cooldown between reminders, escalation ladder, minimum amount for a split offer.
   This produces the list of allowed stages.
2. **AI:** picks one allowed stage using the client's payment history, explains why, drafts the message.
3. **Guardrails:** amounts are filled in by code (the AI can't invent money), invalid output falls back to templates,
   and every decision requires human approval.

## Demo-date note (honesty)
Sandbox invoices can't naturally become weeks overdue, so the app takes an "as of" demo date. That lets us show
2-day and 3-week cases. This is for demonstration only.

## License
MIT
