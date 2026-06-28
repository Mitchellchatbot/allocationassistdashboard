# Testing Amir's feature requests — quick guide

Everything below is testable in **`npm run dev`** with **no deploys** and **no real emails sent**.
The fastest path: open the new **Feature Lab** page and click through it.

```bash
npm install      # if you haven't already
npm run dev      # opens http://localhost:8080
```

Then log in and either:
- Click **Feature Lab** in the sidebar (under *Hospital Introduction*), or go to **/feature-lab**, or
- Follow the per-request steps below.

> **Nothing in dev sends a real email.** The only things that need a deploy are the *actual* outbound send + the cron that fires scheduled rows — those are listed in **Section C** at the bottom and are clearly optional.

---

## A. One-click tour — the Feature Lab (`/feature-lab`)

Open it and you'll see, with sample data pre-loaded:
- **The email editor** with the new toolbar — *Table*, *Bold/Italic/lists/link*, and *Full screen*.
- **Template selection** — two dropdowns with live hover-previews.
- **Insert table / Full-screen / Attachments** standalone triggers.
- **Scheduling** — date + Gulf-time picker with a live countdown.
- Links to **Past Sent** and the **⌘K** search.

That single page exercises requests #1, #3, #4, #5, #7. #2/#6/#8 are below.

---

## B. Per-request checklist

### #1 — Email attachments (CVs, logbooks)
1. Feature Lab → **Attachments** card → drag/drop or pick a PDF. You'll see a chip with name + size.
2. Real flow: **Automations → Send Profile to Hospital** → pick a doctor → a hospital → *Preview & confirm* → **Attachments** section → add a file.
3. Also on **Batches**: open a batch → *Attachments* below the queued doctors.
- ✅ Expect: the file uploads, shows a chip, and (after deploy) rides on the hospital email only.

### #2 — Bulk personalization to all hospitals
1. **Batches** → open a *Daily duo* → queue doctors → **Preview & send**.
- ✅ Expect: one email BCG'd to every hospital recruiter, each personalized (this already existed; nothing to change).

### #3 — Template selection (doctor "working opportunity" email)
1. **Send Profile** → doctor → **one** hospital → *Preview & confirm*.
2. Above each email preview there's a **template dropdown**. Open the *Doctor 'working opportunity'* one.
- ✅ Expect: templates grouped by flow, a search box, **hover any row to preview** it rendered with the doctor's data, *default* + *draft* chips.
3. Pick a different template → the big preview below **re-renders instantly**. Use **Reset to default** to snap back. **Save as my default** remembers your pick next time.
- (Also try it in the Feature Lab → *Template selection* card.)

### #4 — Insert tables into the email editor (Top 15 / Specialty)
1. Feature Lab → in the editor toolbar click **Table** (or do this in any Send Profile / Batches preview).
2. Three ways in: **Build** a grid, **Paste from Excel** (copy cells from Excel/Sheets and paste), or **Upload .xlsx** (pick a sheet).
3. Style it: preset (*AA branded / Striped / Bordered / Minimal*), header row, stripes, borders, alignment, **accent colour**, caption. Watch the **live preview**.
4. Click **Insert table** → it drops into the email at your cursor and you can keep typing around it.

### #5 — Schedule for future delivery (two daily sends at different times)
1. **Batches → New batch**: there's now a **Time (GST)** field next to the date and a **Repeat** selector.
2. Create a *Daily duo* for **today at 09:00**, then create a **second** *Daily duo* for **today at 14:00** (same country).
- ✅ Expect: **both save** (previously the second would collide) — proving two daily sends at different times.
3. Each row shows a **GST time badge** + a live **"fires in Xh"** countdown.
4. **Send Profile** → *Preview & confirm* → flip **Send now → Schedule for later**, pick a date + Gulf time, confirm.
- ✅ Expect: a row appears in **Batches → Scheduled profile sends** with your edits, attachments and template captured. *Cancel* works.
- ⏳ The server-side cron that actually fires scheduled rows needs the Section-C deploy; until then use *Send now*.

### #6 — Unified search + Past Sent history
1. Press **⌘K / Ctrl-K**. There's a new **filter-chip row**: *All / 1st profile / 2nd profile / Top 15 / Daily specialty / Individual*.
2. Type a doctor name → results include a **Sent history** group ("1st profile · Cardiology · Jun 24"). Click a chip to narrow.
3. With no query you get **Saved searches** + **Recent searches** (★ to save).
4. Sidebar → **Past Sent** (or **/past-sent**): a full table with operators — `specialty:cardiology`, `hospital:american`, `doctor:costeira`, `sent:this week` — plus country + date-range filters, sortable columns, and **Export CSV**.
- *No sent data yet?* See the tip under Section C to fabricate a test row safely.

### #7 — Full-screen email preview
1. Any email preview now has a **Full screen** button (editor toolbar, or the *Full screen* chip on read-only previews like the flow **chain** dialog).
2. In full screen: **device widths** (Desktop / Tablet 768 / Email 600 / Mobile 375), **zoom**, **light/dark**, **hide images**, switch **Rendered / HTML / Text**, **Copy HTML**, **Download PDF**. **Esc** closes.

### #8 — Manual doctor selection in all batch campaigns
1. **Batches** → open a batch → in the doctor search box type **any** name.
- ✅ Expect: it searches **every doctor with a WordPress profile** — ignoring the website/specialty filters *and* the eligibility gate — so you can queue anyone, not just the ranked shortlist. The ranked suggestions still show when the box is empty.

---

## C. OPTIONAL — only for REAL email sends (needs deploy)

The UI above is fully testable without this. To actually send/fire on the server:

```bash
# 1. Apply the new DB migrations (attachments bucket, batch send-times,
#    scheduled_profile_sends table, etc.)
supabase db push

# 2. Deploy the senders (attachment merge + per-send template override)
supabase functions deploy send-flow-email send-batch
```

- **Send to a test inbox, not real hospitals:** set `MAIL_TEST_RECIPIENT_OVERRIDE` (comma-separated) on the functions — every outbound email is redirected there.
- **Scheduled rows firing automatically** also needs the `tick-scheduler` function updated to read the new `scheduled_at_time` / `scheduled_profile_sends` — until then, use **Send now**.

### Fabricate sent-history test data (no email risk)
To see **#6** populate without sending: in the Supabase table editor, flip one existing `scheduled_batch_sends` row's `status` to `sent` (and set `sent_at`). It appears in ⌘K + Past Sent on the next refresh — purely cache-driven, no function call.
