# Settings

The account + admin hub: set your own notification preferences, and (for admins)
manage who's on the team and what each person can see. This is where the
**role + page-access** model that gates the whole dashboard is configured.

> **At a glance**
> - **Who uses it:** everyone for the Notifications tab; **admins** for the Users
>   tab.
> - **What it's for:** your Slack handle + Slack webhook test; creating users and
>   setting their role and per-page access.
> - **Where the data lives:** `user_profiles` (role, `allowed_pages`,
>   `slack_handle`) joined to Supabase Auth; changes go through admin-checked edge
>   functions.

## The tabs

- **General** — basic org info (mostly read-only for now).
- **Notifications** —
  - *Slack integration* (admin): instructions + a **Send test message** button to
    verify the webhook.
  - *Your Slack handle* (any user): set your Slack username so notifications
    assigned to you **@-mention** you instead of just emailing.
- **Users** (admin only) — the team list with each person's role, allowed pages,
  and Add / Edit / Delete.

## How to use it

**Set your Slack handle (anyone)**
1. Open Settings → Notifications.
2. Type your Slack username (e.g. `rodaina`) and Save. Now any action assigned to
   you pings you by name in Slack.

**Create a user (admin)**
1. Users tab → **Add User**.
2. Enter name, email, a temporary password.
3. Pick a **role** — it auto-fills the **page access** from that role's preset; or
   pick "custom" and tick pages by hand.
4. **Create User** — they can sign in immediately (no email confirmation step).

**Edit access (admin)**
1. Click the ✎ on a user → change their role and/or toggle individual pages → Save.
2. (You can't remove your *own* admin role — see guards below.)

**Delete a user (admin)** — the 🗑 removes their auth account and profile.

**Test Slack (admin)** — **Send test message** posts to the configured webhook and
reports success/failure.

## How it works

- **`user_profiles`** holds each person's `role`, `allowed_pages` (an array of route
  paths), and `slack_handle`. It's joined 1:1 to Supabase Auth (`auth.users`).
- **Role presets** map a role to a default page set:
  - *admin* → every page,
  - *sales* → the sales-relevant pages,
  - *finance* → finance + settings,
  - *worker* → just the worker view,
  - *hi_member* → the Hospital Introduction pages + settings,
  - *custom* → whatever you tick.
- **All user changes go through edge functions** (`create-user`, `update-user`,
  `delete-user`, `get-users`), each of which **verifies the caller is an admin** —
  `user_profiles` can't be written from the browser. Two safety guards: you can't
  strip your **own** admin role (`update-user`) and you can't delete **yourself**
  (`delete-user`).
- **How access is enforced everywhere else:**
  - `ProtectedRoute` checks, per page, whether your `allowed_pages` includes it
    (admins pass everything; Documentation is always allowed);
  - the **sidebar** only shows nav items you can access;
  - if a profile row is missing, the app falls back to sensible **email-based
    defaults** so nobody is locked out.
- **Slack handle** is saved via a security-definer RPC (`set_my_slack_handle`) so a
  user can only set *their own* handle (their session proves identity). The
  notifier (`_shared/notify.ts`) uses it to @-mention the assignee; the webhook URL
  itself lives in Supabase secrets, never the browser — which is why the page only
  offers a "test" button, not the URL.

## The access model in practice

A worked example: give a finance contractor access to only Finance and Settings.

1. Add the user, pick role **custom**, tick **/finance** and **/settings**, Create.
2. On their next login, `ProtectedRoute` lets them open those two routes and
   redirects any other URL to the first page they're allowed on.
3. The **sidebar** shows only Finance + Settings — everything else is hidden, so
   they never see links they can't use.
4. Change your mind later? Edit the user, switch to a preset or tick more pages —
   it takes effect on their next request.

Two things are always available regardless of role: **Documentation** (everyone
can read the guides) and the **Notifications** tab (so everyone can set their own
Slack handle). And the email-based fallback means a brand-new or seeded account
still gets a sensible default rather than an empty dashboard.

## Why it's built this way

- **Presets + custom** — most people fit a role, so presets keep setup quick and
  consistent; "custom" covers the exceptions without a separate system.
- **Edge functions, not client writes** — centralising every user mutation behind
  an admin check (with self-lockout/self-deletion guards) keeps access control
  secure and prevents an admin accidentally locking themselves out.
- **Page-level access drives the whole UI** — the same `allowed_pages` list powers
  both the route guard and the sidebar, so "what a role can do" is defined in one
  place. (This is also *why* the features are grouped the way they are — see the
  [Overview](../00-overview-and-architecture.md).)
- **Per-user Slack handle** — turns a generic "someone should do this" into a
  personal @-mention, which is what actually gets things actioned.
