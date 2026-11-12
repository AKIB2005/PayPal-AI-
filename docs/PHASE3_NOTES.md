# Phase 3 notes: PayPal Agent Toolkit layer

## What changed
- `server/src/paypal/toolkit.js` (new): the PayPal adapter now runs on `@paypal/agent-toolkit` (`PayPalAPI.run(tool, args)`).
- `server/src/paypal/index.js`: `PAYPAL_MODE=mock | sandbox | sandbox-rest`. `sandbox` = toolkit, `sandbox-rest` = plain REST escape hatch.
- `GET /api/paypal/activity` + `paypalEngine` in `/api/config`: every PayPal call is logged (tool name, invoice id, ok, ms). No tokens, no message text.
- `scripts/smokePaypal.js` (new) and `scripts/seedSandbox.js` (toolkit `send_invoice`).
- 18 new tests (56 total), using a fake toolkit client that returns JSON text exactly like the real `PayPalAPI.run()`.

## Which PayPal tool does what
| Nudge action | PayPal Agent Toolkit tool |
|---|---|
| Load invoices | `list_invoices` |
| Read one invoice | `get_invoice` |
| Send the approved reminder | `send_invoice_reminder` |
| Demo "client paid" button | `get_invoice` + `record_payment_for_invoice` |
| Seed demo invoices (send step) | `send_invoice` |

## Plain REST, only where the toolkit has no tool
- Webhook signature check (`/v1/notifications/verify-webhook-signature`).
- Enabling partial payments on an already-sent invoice (full-invoice PUT; the toolkit's update tool is a flat full replacement and would drop fields). Seeded invoices already have partial payments on, so the demo path skips this.
- Creating seed invoices with due dates (the toolkit's `create_invoice` has no due-date field).

## Verified vs not verified
Verified (from the installed package, v1.11.0): tool names, argument schemas, that it imports from this ESM server, and that `run()` returns JSON text with errors included. 56 tests pass with a fake toolkit.
NOT verified: any call against the real PayPal sandbox. Run `npm run smoke:paypal` first.

## Known risks
1. The toolkit posts its whole argument object as the request body (including `invoice_id`) for `send_invoice` and `send_invoice_reminder`. If PayPal rejects that (HTTP 400/422), the adapter retries once with the documented REST body and logs it as `REST fallback`. 500s are never retried, so a reminder cannot double-send.
2. PayPal limits: 2 reminders/day per API caller; partial payments unavailable for India/Brazil/Israel accounts (use a US sandbox business account).
3. Server SDK (`@paypal/paypal-server-sdk`) is not used: not confirmed to cover Invoicing. Natural fit later: Upgrade B (client pays an installment via Orders/Checkout).
