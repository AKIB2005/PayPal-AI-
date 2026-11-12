# Demo video script (target 2:45, hard limit under 3:00)

Rules (official): under 3 minutes, public on YouTube, shows the project actually running, **no copyrighted music**, no third-party trademarks or copyrighted material you lack permission for. Use no music at all. Judges are not required to watch past 3:00.

## Before you hit record (10 minutes)
1. Use the **real sandbox**: `PAYPAL_MODE=sandbox` and a real AI key. A mock-mode recording will not show PayPal being used, and PayPal being central is a pass/fail test. The header badge must read **PayPal: Agent Toolkit**, not "mock".
2. Fresh state: `cd server && npm run seed:sandbox`, then **restart the server** (state is in memory) so the activity log starts empty.
3. In the dashboard click **Demo day (+21)**. You should see roughly a 2-day, 9-day and 20-day invoice.
4. Browser: 1080p window, zoom 110 to 125 percent, close other tabs and notifications. **Never show `.env` or any key on screen.**
5. Real AI output varies. Whatever stage the agent picks, read its reasoning aloud. If no card is a split offer, press **Re-run agent** once (it is throttled to one run per 10 s), or use the invoice closest to 3 weeks overdue.
6. Do a silent dry run first. Then record 2 or 3 takes and keep the best.

## Storyboard and narration
Pace is about 150 words per minute. The narration below is about 320 words, roughly 2:10 spoken, which leaves 30 to 40 seconds of breathing room for clicks and pauses inside the 2:45 target. If you run long, trim the Guardrails segment first.

**0:00 - 0:18  The problem** (screen: dashboard top, header badge visible)
> Every freelancer knows this: the work is done, the invoice is late, and now you have to chase it. Too soft and you get ignored. Too hard and you lose the client. PayPal can send scheduled reminders, but they treat someone two days late the same as someone three weeks late. This is Nudge.

**0:18 - 0:55  The agent decides** (scroll slowly past 3 cards; hover the stage badge, the reasoning, the "Policy allowed" chips)
> Nudge reads my overdue invoices from the PayPal sandbox and decides what each one needs. This client is only a few days late and pays reliably, so the agent suggests a friendly nudge. This one is three weeks overdue, so it proposes a payment plan. See "Policy allowed": plain code decides which tones are even permitted, based on days overdue, earlier reminders and a cooldown. The AI chooses within those limits, and explains why.

**0:55 - 1:35  Edit, preview, approve** (open the split-offer or firmest card; point at the plan table; change a word in the message; point at the "On approve, PayPal ... runs" line; click Approve)
> Here is the payment plan: three installments. The AI did not calculate these, the code did, so the AI can never invent an amount. I can edit the message myself. Before I approve, Nudge shows exactly what PayPal will run. I approve. The confirmation names the tool, PayPal's Agent Toolkit, and the panel at the bottom shows the real calls and how long they took.

**1:35 - 1:55  Guardrails** (the approved invoice now sits under "Waiting"; click Reject on another draft)
> That invoice now waits, so the agent does not nag. If I reject a draft, nothing is sent. Every decision needs a human, and the server re-checks the rules when I approve.

**1:55 - 2:20  Live payment** (click "Demo: simulate the client paying" on one invoice; the toast appears; it moves to Closed)
> When a client pays, PayPal fires a webhook and the dashboard updates live. In this demo I trigger the payment with the sandbox button, which goes through the same webhook handler. The invoice moves to Closed, and the activity log records it.

**2:20 - 2:45  How it is built, limits, close** (show the PayPal tool calls panel, then the header)
> Under the hood: React and Express, Claude for the agent, PayPal's Agent Toolkit, the Invoicing API and webhooks, and seventy-nine automated tests. It is sandbox only, and the demo date is simulated because PayPal will not create past-due invoices. Nudge: an AI that chases the money, with you in control.

## If something goes wrong while recording
| Problem | Fix |
|---|---|
| Header says "mock" | Wrong env. Set `PAYPAL_MODE=sandbox` and restart. Do not record in mock mode. |
| A card says "Template fallback" | The AI call failed or hit the cap. The reason is shown on the card. Fix the key or model name; do not talk over it. |
| Approve shows an error | Read the error. Tell me the exact text; PayPal's response is included. Re-seed and try a fresh invoice. |
| Nothing is overdue | Click **Demo day (+21)**. |
| Over 3:00 | Cut the Reject moment first, then shorten the intro. |

## After recording
1. Trim dead air at the start and end. Do not add music or logos.
2. Upload to YouTube. Title: "Nudge: AI that chases late PayPal invoices (PayPal AI Hackathon)". **Visibility: Public** (not Unlisted). Put the GitHub link in the description. Language: English.
3. Open the link in a private/incognito window to confirm it plays without logging in and is under 3:00.
4. Paste the URL into the Devpost form and into `docs/DEVPOST_SUBMISSION.md`.
