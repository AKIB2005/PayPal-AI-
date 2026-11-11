# Submission notes (draft facts for the Devpost form)

**PayPal technology used (sandbox):** REST Invoicing API v2: list invoices, send invoice reminder, enable partial payments (`minimum_amount_due`), record payment. Webhooks: `INVOICING.INVOICE.*` events, verified via `/v1/notifications/verify-webhook-signature`.

**AI tools (fill in what you actually use):**
- Claude (model: ___) via the Messages API: chooses a stage from the policy-allowed set, writes the reasoning and the draft message as strict JSON.
- Claude / IDE agent (Antigravity or VS Code) used to write code. Say which.

**What the AI does vs. what code does:** code decides what is allowed and computes all money; the AI picks the tone, explains it, and writes the words; a human approves.

**Testing instructions for judges:** `npm run install:all && npm run build && cd server && cp .env.example .env && npm start`, then open http://localhost:3001. Mock mode needs no keys. Use the demo-date buttons to move time forward, approve a draft, then press "simulate the client paying" to see a live update.
