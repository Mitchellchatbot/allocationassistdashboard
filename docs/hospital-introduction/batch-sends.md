# Batch Sends

The recurring "blasts" that introduce a handful of doctors to *all* the hospital
recruiters at once, on a schedule. Where **Profile Sent** (in Automations) is a
careful one-doctor-to-one-hospital introduction, Batch Sends is the high-volume
top-of-funnel: a few strong profiles pushed out to the whole hospital list on a
regular cadence so AA stays in front of every recruiter.

> **At a glance**
> - **Who uses it:** the HI team.
> - **What it's for:** assemble and send the recurring multi-doctor blasts.
> - **The cadence (Saif's spec):** Daily Duo, Tuesday Top 15, Specialty of the Day.
> - **How it sends:** one email per hospital recruiter, BCC'd so recruiters can't
>   see each other; the doctors render as the same profile cards used elsewhere.
> - **Where it lives:** `scheduled_batch_sends` table; sent by the `send-batch`
>   edge function; fired on schedule by `tick-scheduler`.

## The three batch kinds

| Kind | When | What goes out |
|---|---|---|
| **Daily Duo** | Mon–Fri, ~10:30 AM Dubai | 2 profiles to all hospital recruiters |
| **Tuesday Top 15** | Tuesdays | 15 mixed-specialty profiles |
| **Specialty of the Day** | Wed–Fri | profiles for one specialty, rotating through ~60 specialties |

You pick the doctors; the system assembles the email, BCCs the recruiters, sends,
and tracks the result. For Specialty of the Day, the **rotation auto-advances** to
the next specialty after each send so you cycle through the full list over time.

## How to use it

1. **Open or create a batch** — each kind has its card; you can edit the upcoming
   one or create a new batch.
2. **Pick the doctors** — choose which profiles go in. The picker can rank
   candidates by the same match-score used on Vacancies, and (for Specialty of the
   Day) defaults to the current specialty in the rotation. Batches can be scoped to
   a **country** and/or **specialty**.
3. **Preview** — see exactly what the recruiters will receive (the assembled email
   with the doctor cards).
4. **Send now or let it schedule** — send immediately, or leave it queued for its
   slot and `tick-scheduler` will fire it at the scheduled time.
5. **Track** — each batch records sent/draft/failed status; results also surface in
   Reports → Operations.

> **Specialty groups, not raw Zoho strings:** when choosing which specialties a
> batch covers, you pick from the canonical website specialty *groups* (e.g.
> "Cardiology" covers its sub-specialties). The editor shows how many doctors fall
> in each group and flags any that don't map to a known group.

## How it works

### Assembling the email (`send-batch`)

`send-batch` renders one email containing a **profile card per doctor** — the same
teal card used in the single profile email (photo sidebar, bio, the icon fact
grid) plus a compact data row, each with **View full profile** / **View CV**
buttons. It's sent through Resend to the hospital recruiters as a BCC list, so:

- every recruiter gets the same blast,
- no recruiter sees the others on the email,
- the doctors are presented identically to how they look in a one-to-one send.

### Picking and ranking doctors

The doctor pool is assembled from the richest source per doctor (WordPress →
Zoho) and ranked with `scoreCandidate` — the same scoring engine documented on the
[Vacancies](vacancies.md) page — so the strongest profiles surface first. Batches
can be **country-scoped** so, e.g., a UAE batch only includes UAE-relevant doctors.

### Specialty rotation

For Specialty of the Day, a `specialty_rotation_state` cursor tracks where you are
in the ~60-specialty list. After each send it advances to the next specialty, so
over a few weeks every specialty gets its turn without anyone tracking it manually.

### Scheduling

`tick-scheduler` (every ~5 min) checks whether a batch is due for *today's* slot
(Daily Duo on weekday mornings, Tuesday Top 15 on Tuesdays, Specialty of the Day
Wed–Fri) and, if the batch is drafted and scheduled, fires it once. Results and
any failures are recorded and posted for the team.

## Why it's built this way

- **Blasts vs introductions are different jobs** — Batch Sends is deliberately
  separate from the Automations flows: it's volume/awareness, not a tracked
  one-to-one conversation, so it doesn't spin up flow runs per recruiter.
- **Manual doctor pick, automated everything-else** — the judgment call (which
  doctors are worth blasting) stays human; the tedious part (assembling, BCC-ing,
  scheduling, rotating specialties, tracking) is automated.
- **Same cards everywhere** — reusing the profile-card builder means a doctor looks
  consistent whether they're in a blast or a personal introduction.
