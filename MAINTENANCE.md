# MAINTENANCE.md — continuing Perfexio with any AI assistant

This guide lets you keep improving Perfexio with **any** capable AI assistant
(ChatGPT, Gemini, Claude, or a human developer) — not just the tool that built
it. It explains the shape of the project, the rules that must never be broken,
how to test and deploy, and it ends with a **copy-paste primer** you can hand to
a fresh assistant so it gets up to speed in one message.

Read order for a newcomer: this file → `CLAUDE.md` (the short rules) →
`ARCHITECTURE.md` (the full technical map) → `DEPLOY.md` (how to ship).

---

## 1. The project in 60 seconds

Perfexio is a multi-tenant performance-management web app (goals/OKRs, manager
reviews, culture-and-values scoring, reports and analytics). It is a **static
site**: plain HTML, CSS, and classic `<script>` JavaScript talking straight to
Firebase Authentication and Cloud Firestore from the browser.

- **No build step, no framework, no bundler, no Cloud Functions.** What is in
  `public/` is exactly what ships. You edit a `.js` file and deploy it as-is.
- **One Firebase project (`perfexio`), three hosting sites:** production,
  staging, demo. They share one database and are kept apart by a data-path
  prefix (`tenants/production|staging|demo/...`), chosen at runtime from the
  hostname in `public/js/env.js`.
- **Security is entirely in `firestore.rules`.** The browser is untrusted; the
  rules are the real access control.
- **Everything is plain top-level functions** called from inline
  `onclick="fn()"` handlers. There is no `import`/`export`.

The code lives in 13 files under `public/js/`, loaded in a fixed order with
`app.js` last. `ARCHITECTURE.md §3` lists each file and its job.

---

## 2. Rules that must never be broken

These are non-negotiable. They are spelled out in `CLAUDE.md`; the short version:

1. **Never lose data.** All migrations are additive. Records are *archived*
   (`status:'archived'`) or *soft-deleted* (`isDeleted:true`), never hard
   deleted. `firestore.rules` denies `delete` everywhere — do not relax it.
2. **Keep every existing feature.** Prove it with `npm test` before and after.
   The two existing Reports-tab reports (User performance summary and the
   detailed goal matrix) are load-bearing — add new reports *alongside* them.
3. **All shipped UI text is clean English.** Every label, toast, placeholder and
   empty state. No Bengali or Banglish in `public/`. The test enforces this.
4. **No secrets in the repo.** The Firebase *web* config in `js/env.js` is
   public by design and is fine to commit. A service-account *private key* must
   never be committed (`.gitignore` blocks it). Access is controlled by rules.
5. **Every Firestore path goes through `T.*` in `js/firebase.js`.** Never write a
   raw `db.collection('...')` — that would break tenant isolation.
6. **Company creation is platform-admin-only; onboarding is invite-only.**
   Self-signup is off in every environment. Do not add a public sign-up path or
   relax the rules that enforce this. Each client company has its own Super
   Admin, scoped to that company; the only cross-company role is the platform
   admin.

---

## 3. How to make a change safely

The same loop works for any assistant:

1. **Understand first.** Read `CLAUDE.md` and the relevant part of
   `ARCHITECTURE.md`. Search the code for the function or id you are about to
   touch before changing it.
2. **Edit the real files** under `public/`. Keep new functions as top-level
   globals; if a button calls a new function, that function must be a global in
   one of the `js/*.js` files. Add a new `<script>` tag *above* `app.js` and add
   the filename to `LOAD_ORDER` in `tools/test.js`.
3. **Keep the id contract.** If JS reads an element by id, that element must
   exist in `index.html`, and the id should be listed in
   `tools/_js_ids_all.json`.
4. **Run the tests** (see §4). Fix anything red.
5. **Deploy** staging → demo → production (see §5). Never deploy a failing
   build, and never deploy production before staging is confirmed.

When adding a whole tab, modal, collection, or field, follow the exact recipes
in `ARCHITECTURE.md §12` — they list every file you must touch.

---

## 4. The test harness (your safety net)

There is no build step, so this harness takes the place of a compiler. Run it
from the project folder:

```bash
npm test          # same as: node tools/test.js  — needs only Node, no install
```

It runs six checks and exits non-zero if any fail:

1. **syntax** — every `public/js/*.js` parses.
2. **handlers** — every inline `on*` handler resolves to a defined global. (If
   you rename a function but not its `onclick`, this fails.)
3. **ids** — every id in `tools/_js_ids_all.json` exists in `index.html`.
4. **duplicate-ids** — no id appears twice in `index.html`.
5. **language** — no Bengali script and no Banglish tokens in shipped UI.
6. **unit** — the scoring/weighting/CSV maths behave (loaded into a sandbox with
   Firebase/DOM stubs, so no network is touched).

Common fixes: a failing **handlers** check means a function name is misspelled or
missing; a failing **ids** check means you referenced an element id that isn't in
`index.html` (add the element, or the id to the JSON); a failing **language**
check means non-English text slipped into a shipped string.

---

## 5. Deploying

Full walkthrough is in `DEPLOY.md`. The command sequence (always staging first):

```bash
cd /Users/masudparvejprantik/Perfexio
npm test
firebase deploy --only firestore:rules       # rules are shared by all 3 envs
firebase deploy --only hosting:staging        # verify at staging-perfexio.web.app
firebase deploy --only hosting:demo           # verify at staging-perfexio-demo.web.app
firebase deploy --only hosting:production      # only after staging is confirmed
```

The Firebase CLI runs on your own machine (`firebase login` with the Google
account that owns the `perfexio` project). Rules and the database are shared
across all three environments, so a rules deploy takes effect everywhere at once
— test rule changes on staging first.

---

## 6. Onboarding a client and platform-admin access

- **You (the owner) get full access** by having a `platformAdmins/{yourUID}` doc
  in each environment — see `DEPLOY.md §5b`, which lists the exact documents for
  both owner emails on production and staging.
- **To onboard a client company**, sign in as a platform admin and use **Create
  client company** — see `DEPLOY.md §8` for what to collect and the step-by-step,
  and `ARCHITECTURE.md §12` for the code path.

---

## 7. A copy-paste primer for a fresh assistant

Paste the block below into a new ChatGPT/Gemini/Claude chat, then attach or paste
the file you want changed. It front-loads the constraints so the assistant does
not suggest something that would break the app.

```
You are helping me maintain "Perfexio", a multi-tenant performance-management
web app. Before proposing changes, follow these facts and rules exactly.

WHAT IT IS
- A STATIC site: plain HTML + CSS + classic <script> JavaScript, talking directly
  to Firebase Auth and Cloud Firestore from the browser.
- NO build step, NO framework, NO bundler, NO Cloud Functions. What is in the
  public/ folder is exactly what ships. It runs on Firebase's free (Spark) plan.
- One Firebase project, three hosting sites (production, staging, demo) sharing
  one database, separated by a data-path prefix chosen from the hostname.
- Code is ~13 files in public/js/, loaded in a fixed order with app.js LAST.

HARD RULES (do not break any of these)
1. Never lose data. All changes are additive. Records are archived
   (status:'archived') or soft-deleted (isDeleted:true), never hard-deleted.
   The security rules deny delete everywhere — do not relax that.
2. Keep every existing feature working. There is a test harness (`npm test`);
   it must pass before and after. Do not remove the two existing Reports.
3. All user-facing text must be clean English (no Bengali/Banglish). A test
   enforces this.
4. Never commit secrets. The Firebase web config is public and fine to commit;
   a service-account private key must never be committed.
5. Every Firestore access must go through the `T.*` helpers in js/firebase.js —
   never a raw db.collection('...') — or tenant isolation breaks.
6. No public self-signup. Company creation is platform-admin only and onboarding
   is invite-only; do not add a sign-up path or weaken those rules.

CONVENTIONS
- Functions are top-level `function name(){}` globals, called from inline
  onclick="name()" in index.html. No import/export. A new function a button
  calls must be a global in a js/*.js file, and a new <script> goes ABOVE app.js.
- Elements are found by id; an id read by JS must exist in index.html and be
  listed in tools/_js_ids_all.json.
- After any change I will run `npm test` (six checks: syntax, handlers, ids,
  duplicate-ids, language, unit). Give me changes that keep all six green.

HOW TO RESPOND
- Ask to see the specific file(s) before editing. Make the smallest change that
  works. Show me the exact edited code and tell me which files to run `npm test`
  on and how to deploy (staging first, then production).
- If a request would break a hard rule, say so and propose a safe alternative.

There are three docs in the repo that explain everything: CLAUDE.md (the rules),
ARCHITECTURE.md (the full map, including step-by-step recipes in section 12), and
DEPLOY.md (how to ship). Ask me to paste any of them if you need detail.
```

---

## 8. What not to do

- Do not introduce a build step, framework, package bundler, or Cloud Functions.
  The whole design assumes a static site on the free plan.
- Do not add `import`/`export` or convert files to modules.
- Do not write a raw `db.collection(...)` path anywhere outside `T.*`.
- Do not add a public company sign-up, or loosen the delete/creation rules.
- Do not ship non-English UI text, and do not remove existing features to make
  room for new ones — always add alongside.
- Do not commit a service-account key or any private credential.

If in doubt, run `npm test` and read `ARCHITECTURE.md`. The tests and the rules
are designed to catch exactly the mistakes that matter.
