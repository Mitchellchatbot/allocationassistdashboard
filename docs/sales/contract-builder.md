# Contract Builder

Where the team creates and sends **Allocation Assist's own service agreement** to a
doctor for e-signature (via **BoldSign**), then tracks it through to signed. This is
AA's commercial contract *with the doctor* — and signing it kicks off the rest of
the placement (it creates the doctor's Zoho record and starts the relocation pack).

> **Don't confuse this with the hospital's offer.** Contract Builder = **AA's
> service agreement with the doctor** (BoldSign e-sign, this page). The Automations
> *Contract Check-in* flow tracks the separate **hospital↔doctor offer letter**
> (which AA only logs, doesn't send). Two different contracts.

> **At a glance**
> - **Who uses it:** the team (admin-gated page).
> - **What it's for:** build the service agreement, customise the fee terms, send
>   it for signature, and track status.
> - **Where the data lives:** `contract_sends` (one row per send); BoldSign handles
>   the signing; `boldsign-send` / `boldsign-webhook` are the edge functions.
> - **On signed:** records the signature, creates the Zoho "Doctor on Board"
>   contact, and auto-starts the **Relocation** flow.

## What you see

- **A live contract preview** — the full AA service agreement (letterhead, terms,
  Schedule 1 services, Schedule 2 fees, signature block) that updates as you edit.
- **Editable fee fields** — agreement date, total fee, the two payment stages
  (default AED 42k, 50/50, 45-day second payment), and the change-of-mind fee.
- **A doctor search** — type a name to pull the lead from Zoho and pre-fill the
  contract.
- **Suggested next contracts** — doctors who just cleared a pipeline stage
  (interview → shortlist → profile sent) but don't have a contract yet; one click
  pre-fills them.
- **Send controls** — the recipient email, an optional "placement at" hospital, and
  **Print / Save PDF** + **Send for Signature**.
- **A Sent Contracts table** — every send with live status (Sent → Viewed → Signed,
  or Declined/Expired), the signed date, and View/PDF actions. It updates in real
  time when a doctor signs.

## How to use it

1. **Pick the doctor** — search by name, or click one from *Suggested next
   contracts*.
2. **Set the terms** — adjust the fee fields; the preview reflects changes live.
3. **(Optional) choose the hospital** — set "placement at" so the relocation pack
   can fire for the right city automatically on signing.
4. **Check the recipient email** — pre-filled from Zoho; override if it's stale.
5. **Send for Signature** — generates the PDF and sends it via BoldSign. The doctor
   gets an email and signs without needing a login. (You'll be warned if this
   doctor already has a contract on file — a resend is allowed, just confirmed.)
6. **Track it** — watch the Sent Contracts table flip from Sent → Viewed → Signed;
   download the signed PDF from the PDF action.

> **Test mode:** when opened embedded (from Automations), a `testRecipient` routes
> the contract to a test inbox while keeping the doctor's name on it — so you can
> rehearse the full sign → relocation flow without emailing a real doctor.

## How it works

- **Sending** (`boldsign-send`): the page renders the agreement to a PDF, sends it
  to BoldSign with the signature field placed on the last page, CC's the admins,
  records a row in `contract_sends` (status `sent`), and opens a `contract_signing`
  flow run.
- **Tracking** (`boldsign-webhook`): BoldSign posts signed/viewed/declined events
  (verified by HMAC). The webhook updates the `contract_sends` status and advances
  the flow run.
- **On signed**, three things happen automatically:
  1. `contract_sends` is marked `signed` and the run completes;
  2. a Zoho **Contact** ("Doctor on Board") is created from the lead;
  3. the **Relocation** flow starts — if a hospital was chosen, it jumps straight
     to sending the city guide; if not, it waits at "pick city" for the team.
- **The Sent Contracts table** subscribes to realtime updates, so a signature shows
  up without a refresh.

## Why it's built this way

- **One page from draft to signed** — editing terms, previewing the exact PDF,
  sending, and tracking all live together so there's no copy-paste into a separate
  e-sign tool.
- **Signing is the trigger** — making the BoldSign signature auto-create the Zoho
  contact and start relocation removes manual handoffs at the most important
  moment (the doctor committing to AA).
- **Suggested next contracts** — surfaces exactly who's ready for a contract based
  on pipeline stage, so the team isn't hunting for names.
- **Admin-gated** — it sends a legal commercial agreement, so the page sits behind
  the admin gate. (Configured via the route's access mapping.)
