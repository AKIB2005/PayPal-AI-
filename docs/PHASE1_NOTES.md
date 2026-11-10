# Phase 1 notes

## Stage rules (edit in server/src/config.js)
| Stage | Allowed when |
|---|---|
| friendly | 1-14 days overdue, and not softer than the last reminder |
| firm | 7+ days overdue |
| final | 15+ days overdue AND at least one earlier reminder |
| split_offer | 14+ days overdue AND amount due >= minimum |
| wait | not overdue, paid, cooldown (3 days), or 5 reminders already sent |

## Things to verify later
- Model names in `.env.example` (ANTHROPIC_MODEL, GEMINI_MODEL) against current provider docs.
- PayPal field names (`minimum_amount_due`, remind payload) before Phase 3 code.

## Handing to the IDE agent (Phase 2 prompt)
"Read AGENTS.md. Build the Express server in server/src/routes and a Vite + React dashboard in client/.
Use `decide()` from server/src/agent/decide.js with LLM_PROVIDER=mock and server/src/data/sampleInvoices.json.
Do not modify server/src/agent. Show each invoice with days overdue, stage badge, reasoning, editable draft,
and Approve / Edit / Reject buttons (approve can just log for now). Add a demo-date picker."
