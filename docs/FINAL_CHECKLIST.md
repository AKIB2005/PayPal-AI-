# Final checklist: what is left for YOU

Deadline: **Nov 12, 2026, 12:00 PM Pacific = Nov 13, 1:30 AM IST**. Aim to click Submit by **9 PM IST on Nov 12** so a failed upload or form error does not cost you the entry. Once the deadline passes you cannot edit the submission.

## What is required to submit (official rules) vs optional
| Required | Optional |
|---|---|
| Working project using PayPal (sandbox) + an AI tool | Hosted URL (run instructions in the repo are enough) |
| Text description | Render deploy (only for the Render sponsor prize) |
| Public GitHub repo with a license visible in the About box | PayPal webhook registration (the demo button covers it) |
| Demo video: under 3:00, public on YouTube, no copyrighted music | |
| Way for judges to run it (README instructions or hosted URL) | |

## Part 1. Get your keys (about 20 to 30 min)
Menu names below are from memory; PayPal and the AI sites may label things slightly differently.

**PayPal sandbox**
1. developer.paypal.com, log in, open the Dashboard.
2. **Apps & Credentials**, switch to **Sandbox**, **Create App**. Copy the **Client ID** and **Secret**.
3. Under sandbox accounts (Testing Tools), make sure you have a **US business** account and a **personal** account. PayPal's docs say partial payments are not available in India, Brazil or Israel, so use a US account. Copy the personal account's email.

**AI key (pick one)**
- Claude: console.anthropic.com, create an API key (the account needs a little credit).
- Gemini: Google AI Studio, create an API key.

## Part 2. Configure and test (60 to 120 min, the riskiest part)
```powershell
cd server
copy .env.example .env
notepad .env
```
Fill in, save and close:
```
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_TEST_PAYER_EMAIL=your_sandbox_personal_email
LLM_PROVIDER=claude          # or gemini
ANTHROPIC_API_KEY=...        # or GEMINI_API_KEY=...
SENDER_NAME=Your Name
```
Then, one at a time. Stop at the first `[FAIL]` and fix it before moving on:
```powershell
npm install
npm run preflight            # checks keys, PayPal access, AI. Prints what to fix.
npm run smoke:paypal         # exercises each PayPal Agent Toolkit tool
npm run seed:sandbox         # creates and sends 5 demo invoices
cd ..
npm run build
cd server
npm start                    # open http://localhost:3001
```
In the dashboard: click **Demo day (+21)**, approve one draft, and confirm the confirmation says **Agent Toolkit › send_invoice_reminder** and the **PayPal tool calls** panel shows it. The header badge must say **PayPal: Agent Toolkit**.

**If something fails:** copy the exact error text and send it to me. PayPal's response is included in the message, so it is usually a one-step fix. Likely ones:
| Symptom | Likely cause |
|---|---|
| `PayPal login` fails | Wrong ID/secret, or live keys instead of Sandbox keys |
| Invoices call returns 403 | App/account permissions; paste the message |
| Reminder returns 400 | Nudge retries automatically with the documented REST body; the panel will show "REST" |
| "Could not enable partial payments" | Non-fatal; the plan still goes in the message. Check the account country |
| AI shows "Template fallback" | The reason is on the card: key, model name, timeout, or the hourly cap |

## Part 3. Put the code on GitHub (10 min)
Use the push commands from the earlier message. Then:
- Repo is **Public**.
- Add the **About** description and topics (paypal, ai, agent, invoicing). Confirm the **MIT license** shows in the About box.
- `npm run check:submission` (from the repo root): fix every `[FAIL]`.

## Part 4. Record the video (60 min)
Follow `docs/VIDEO_SCRIPT.md`. Record in the real sandbox, not mock mode. Upload to YouTube as **Public**. Check it in a private window.

## Part 5. Devpost (30 min)
1. Open the hackathon page, **Join hackathon** (if you have not), then **Enter a Submission**.
2. Copy the fields from `docs/DEVPOST_SUBMISSION.md`. Fill every `[[...]]` marker first (`npm run check:submission` will tell you if any are left).
3. Add: GitHub URL, YouTube URL, 3 to 5 screenshots (dashboard, a split offer, the PayPal tool calls panel, a closed invoice), the tech tags.
4. **Add your teammate to the Devpost team**, not only to GitHub. One person (the Representative) submits.
5. Save a draft early, then press **Submit** and confirm the status shows submitted, not draft.
6. Open the public project page in a private window; check the video plays.

## Part 6. Optional: Render deploy (30 to 60 min)
Only if you have time. See `docs/DEPLOY.md`. It earns the Render prize eligibility and a hosted URL, but the rules do not require either.

## If time runs short (priority order)
1. Public repo + license + README that runs in mock mode (already true).
2. A real sandbox approve through the Agent Toolkit, recorded. Without PayPal visibly working, Stage One (does it reasonably use PayPal) is at risk.
3. Video under 3 minutes.
4. Devpost text with video + repo links, submitted.
5. Everything else (deploy, webhook registration, polish) is optional.

## After you submit
Do not redeploy or force-push to the repo before judging ends (Dec 15). Judges may run what is in the repo.
