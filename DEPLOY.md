# DEPLOY.md — Perfexio setup & deployment

A precise, do-this-then-that guide for taking Perfexio from this folder to three
live Firebase Hosting sites. Follow the parts in order. The first time through,
do every part. For routine redeploys later, jump to Part 7.

Project: **perfexio** · Sites: **perfexio** (production), **staging-perfexio**
(staging), **staging-perfexio-demo** (demo).

---

## Part 0 — One-time local setup

You need Node.js (v18 or newer) and the Firebase CLI.

```bash
node --version                 # expect v18+  ; if missing, install from nodejs.org
npm install -g firebase-tools  # installs the `firebase` command
firebase --version             # confirm it installed
firebase login                 # opens a browser; sign in with the Google account
                               #   that owns the perfexio Firebase project
```

Then, from inside this project folder:

```bash
cd perfexio-saas
firebase use perfexio          # selects the project (already in .firebaserc)
firebase projects:list         # sanity check: perfexio should be listed
```

`.firebaserc` already maps the three hosting targets, so you do not normally need
to re-apply them. If a fresh machine ever reports "target not found", run:

```bash
firebase target:apply hosting production perfexio
firebase target:apply hosting staging   staging-perfexio
firebase target:apply hosting demo      staging-perfexio-demo
```

---

## Part 1 — Keep secrets out of the repository

Perfexio runs entirely in the browser against Firestore security rules, so it
needs **no** service-account private key. The Firebase *web* configuration in
`public/js/env.js` is public by design and is safe to commit; access is controlled
by `firestore.rules`, not by hiding those values.

- Never commit a service-account private key, a `.env` file, or any credential.
- `.gitignore` already blocks `serviceAccountKey.json`, `*serviceAccount*.json`,
  `*-firebase-adminsdk-*.json` and `.env*`. Never remove those lines.
- If a private key is ever exposed, revoke it immediately: Firebase Console →
  Project settings → **Service accounts** → **Manage service account permissions**
  → select the account → **Keys** → delete the exposed key.

---

## Part 2 — Configure the perfexio project (Console)

All in the Firebase Console, project **perfexio**.

**2a. Enable sign-in methods.** Build → **Authentication** → **Get started**
(if first time) → **Sign-in method** tab. Enable:

- **Email/Password** → toggle on → Save.
- **Google** → toggle on → pick a support email → Save.

**2b. Authorise the hosting domains.** Authentication → **Settings** →
**Authorized domains**. Confirm these are present (add any that are missing):

```
perfexio.web.app
staging-perfexio.web.app
staging-perfexio-demo.web.app
localhost
```

Google sign-in only works on listed domains, so this step matters for all three
sites and for local testing.

**2c. Create the Firestore database.** Build → **Firestore Database** →
**Create database**. Choose **Production mode** (the rules in this repo will lock
it down properly in Part 3). Pick the region closest to your users; you cannot
change it later. Wait until the empty database is ready.

You do **not** need to create any collections by hand — the app and the demo
seeder create documents on first use under `tenants/{production|staging|demo}/…`.

---

## Part 3 — Deploy the security rules

The client is untrusted; `firestore.rules` is the real access control. Deploy it
before opening the app to anyone.

```bash
cd perfexio-saas
npm test                                   # must pass all six sections first
firebase deploy --only firestore:rules     # or: npm run deploy:rules
```

Then verify in the Console: Firestore → **Rules** tab shows the new rules and a
recent "Last published" time.

---

## Part 4 — Deploy the three sites (staging → demo → production)

Always prove it on staging first, then demo, then production. Run the tests once
up front; never deploy a failing build.

```bash
npm test

# 1) staging
firebase deploy --only hosting:staging     # or: npm run deploy:staging
#    open https://staging-perfexio.web.app and smoke-test (Part 6)

# 2) demo  — only after staging looks right
firebase deploy --only hosting:demo        # or: npm run deploy:demo
#    open https://staging-perfexio-demo.web.app ; the one-click role panel appears

# 3) production — only after staging (and demo, if relevant) are confirmed
firebase deploy --only hosting:production  # or: npm run deploy:production
#    open https://perfexio.web.app
```

Each site serves the same code; the app picks its data root from the hostname, so
staging/demo/production data never mix.

---

## Part 5 — Seed the demo workspace & make yourself a platform admin

**5a. Create the sample company on the demo site.** Open
`https://staging-perfexio-demo.web.app`. On the demo, the seeder builds a fully
populated sample company (HR Director, a line manager, employees, cycles, goals,
ratings) using real password logins, so the one-click panel works during a pitch.
Run the seeder from the demo panel/controls on that page. It is safe to re-run —
writes use deterministic ids and merge rather than duplicate.

**5b. Grant yourself platform-admin (owner access to every panel).**
Platform admins can open any company in an environment and reach every panel,
including the **Create client company** tool. There is no UI for granting this by
design — you add the document by hand, per environment.

1. Sign in once on each site whose environment you want (production and staging),
   so your account exists in Firebase Authentication for that environment's use.
2. Console → Authentication → **Users**, copy your account's **User UID**.
3. Console → Firestore → create a document at
   `tenants/{env}/platformAdmins/{yourUID}` with a field `email` = your email.

Repeat for each environment you want platform powers on (production, staging,
and optionally demo). The document only needs `{ email: "<your email>" }`. A UID is
stable per Firebase project, so the same UID works in every environment; if it is
ever wrong, re-copy it from Authentication → Users. Do not write real UIDs or
personal emails into this repository.

Rules let you *read* your own platformAdmins doc but never write it from the
client, so this must be done in the Console. Once the doc exists, sign out and
back in — you will land on the company picker with the **Create client company**
button, and the header workspace switcher lets you jump between any company.

---

## Part 6 — Verify

**6a. Rules Playground (Console).** Firestore → Rules → **Rules Playground**.
Try a few simulated operations to confirm the intent holds, e.g.:

- an authenticated user reading a `users` doc in **another** company → **denied**;
- a `Level 1` user writing a `performanceRatings` doc → **denied**;
- a signed-in user `get`ting their own `userIndex/{uid}` → **allowed**.

**6b. Live smoke test (do on staging first, then production).**

- Sign up / sign in with email+password, then sign out and sign in with Google.
- Create a review cycle; add a goal; check the personal summary score renders.
- As a manager, submit a manager rating and values scores for a report (not
  yourself — self-rating is blocked by design).
- Open Reports/Analytics; confirm charts draw.
- Invite a teammate by email in the Admin panel; sign in as that email on another
  browser and confirm the invite is claimed on first login.
- Archive a roster member and confirm they disappear from active lists but the
  record still exists (no data is deleted).
- Confirm the environment badge shows on staging/demo and is absent on production.

---

## Part 7 — Everyday redeploy cheatsheet

```bash
cd perfexio-saas
npm test                                   # gate: all six sections pass
firebase deploy --only hosting:staging     # verify at staging-perfexio.web.app
firebase deploy --only hosting:production  # only after staging is confirmed

# rules changed?  deploy them (rules apply to all three environments at once):
firebase deploy --only firestore:rules
```

Rule of thumb: code changes are per-site (deploy staging, verify, then
production); rules and the Firestore database are shared across all three, so a
rules deploy affects every environment immediately — test on staging first.

---

## Part 8 — Onboard a new client company (platform admin)

New customer workspaces are **not** self-service. You (a platform admin) create
them from inside the running app; the client is then invited in as their own
Super Admin. Do this on **production** for a real client (use **staging** to
rehearse — the same feature is enabled there on purpose).

**8a. What to collect from the client first.**

- Company name (as it should appear in the app header).
- The owner's work email — the one person who will be the client's Super Admin.
- The owner's full name.
- Which plan (`trial`, `growth`, or `enterprise` — sets the seat limit).
- Optional: the email domain(s) their staff sign in with, e.g. `client.com`. Set
  this if you want to restrict the workspace so only addresses on those domains
  can be invited. The owner's own email domain must be on the list, or they
  could never sign in to the workspace they own.

**8b. Create the workspace.**

1. Sign in as a platform admin (Part 5b). You land on the company picker; the
   header workspace switcher is also available once inside any workspace.
2. Select **Create client company** to open the new-company form.
3. Fill in company name, owner email, owner name, plan, and (optionally) the
   allowed domains. Submit.
4. The app writes the company, its default settings/values, and a pending
   **Super Admin invite** for the owner email — all in one batch. Your own
   account is not attached to the new company, so you stay a neutral admin.

**8c. Hand off to the client.**

1. Tell the client to open the app URL and sign in with the exact email you
   invited (Email/Password sign-up with that address, or Google if it is a Google
   account). On first sign-in the invite is claimed automatically and they become
   Super Admin of their workspace.
2. From there the client's Super Admin runs everything for their company: they
   add their own staff in the Admin panel (invitations go out by email), build
   the roster, launch review cycles, and so on. If you set a domain allow-list,
   the app blocks inviting any address outside it.

**8d. Notes on access and safety.**

- Only invited addresses can ever join a company; a stranger cannot reach a
  workspace by guessing its id (enforced in `firestore.rules`).
- Each company's Super Admin is scoped to that company only. The sole
  cross-company role is the Perfexio platform admin (you).
- Nothing here deletes data. Removing a person archives them; the workspace and
  its history always persist.
- To raise a client's plan or seat limit later, change it in the Console (or
  platform tooling) — customers cannot raise their own limits by design.

---

## Troubleshooting

- **`firebase: command not found`** — re-run `npm install -g firebase-tools`, or
  open a new terminal so the PATH updates.
- **"HTTP Error: 403" / permission denied on deploy** — you are logged into the
  wrong Google account. `firebase logout` then `firebase login` with the account
  that owns `perfexio`.
- **"target not found"** — run the three `firebase target:apply hosting …`
  commands in Part 0.
- **Google sign-in popup closes with an error** — the domain is not in
  Authentication → Settings → Authorized domains (Part 2b).
- **Everything is "permission denied" in the app** — rules were not deployed
  (Part 3), or your `userIndex/{uid}` doc doesn't exist yet (it is created on
  first successful sign-in / invite claim).
- **App shows the setup screen instead of sign-in** — the Firebase web config in
  `public/js/env.js` is missing or wrong. It should already contain the real
  `perfexio` config; this web config is public and safe to commit.
- **`npm test` fails on the ids or handlers check** — you added an element id or
  an inline `onclick` without its counterpart. See ARCHITECTURE.md §12–13.
