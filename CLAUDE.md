# CLAUDE.md — how to work in the Perfexio codebase

This file is read first by any AI assistant editing this project. Follow it exactly.
Deeper detail lives in `ARCHITECTURE.md`; read that before a structural change.
To continue this project with a different AI assistant (ChatGPT, Gemini, etc.),
see `MAINTENANCE.md` — it has a copy-paste primer that front-loads these rules.

## What Perfexio is

A multi-tenant performance-management web app: goals/OKRs, manager reviews,
culture-and-values scoring, reporting and analytics. One Firebase project
(`perfexio`) serves three hosting sites (production, staging, demo) off one
Firestore database, separated by a data-path prefix. No build step, no
framework, no Cloud Functions — it runs on the Firebase free (Spark) plan.

## The six rules that must never be broken

1. **Never lose data.** Migrations are additive only. Records are *archived*
   (`status:'archived'`) or *soft-deleted* (`isDeleted:true`), never removed.
   `firestore.rules` denies `delete` on every collection — do not relax that.
   When changing a document shape, copy fields forward; never rename in place
   in a way that strands existing data.

2. **Keep every existing feature.** Before and after any change, run the tests
   (`npm test`). If you remove or rename a function that an inline handler
   calls, the handler check fails. Prove parity, don't assume it. In
   particular, the two existing reports on the Reports tab — the **User
   performance summary** (`userReportTableBody`) and the **detailed goal
   matrix** (`okrReportTableBody`) — are load-bearing; add new reports
   *alongside* them, never in place of them.

3. **All shipped UI text is clean English.** Every alert, toast, confirm,
   button label, placeholder, empty state and hint. No Bengali, no Banglish.
   The language check in `npm test` enforces this. Code comments may explain
   intent in English only.

4. **No secrets in the repo.** The web Firebase config in `js/env.js` is public
   by design and is fine to commit. A service-account private key must never be
   committed — `.gitignore` blocks `serviceAccountKey.json` and `*.pem`. Access
   is controlled by `firestore.rules`, not by hiding keys.

5. **Every data path goes through `T.*` in `js/firebase.js`.** Never write a raw
   `db.collection('...')`. `T.root()` is the *only* place the environment
   prefix is applied, so a stray raw path would break tenant isolation.

6. **Company creation is platform-admin-only; onboarding is invite-only.**
   Self-service sign-up is off in every environment (`allowCompanySelfSignup:
   false` in `env.js`) and `firestore.rules` only lets a `platformAdmins/{uid}`
   create a `companies/{id}` (the demo root is the one self-provisioning
   exception). Only invited users can join a company, and an optional per-company
   `allowedDomains` list restricts which email domains may be invited. Do not add
   a self-signup path or relax these rules. Each client company has its own
   Super Admin, scoped to that company only; the only cross-company role is the
   Perfexio platform admin.

## Ground rules for editing

- **Plain globals, no modules.** Functions are declared at top level with
  `function name() {}` and called from inline `onclick="name()"` in
  `index.html`. There is no `import`/`export`. A new function that a button
  calls must be a top-level global in one of the `js/*.js` files.
- **Load order matters.** `index.html` loads the scripts in a fixed order and
  `app.js` last (it is the only file that *calls* the others at boot). Add a new
  `<script>` tag *above* `app.js`.
- **Element ids are a contract.** JS finds elements by `id`. Section ids are
  `sec-<tab>` and nav buttons are `tab-<tab>`; `switchTab()` depends on that.
  If you add an id in JS, add the element in `index.html` (the test checks this).
- **Run `npm test` before every commit and every deploy.** It checks syntax,
  handler resolution, id presence, duplicate ids, UI language, and the scoring
  maths. All six sections must pass.

## Common tasks

- **Add a tab:** see ARCHITECTURE.md § "Add a tab". Nav button `tab-x`, section
  `sec-x`, add `'x'` to `ALL_TAB_IDS` in `ui.js`, gate it in
  `applyRolePermissions()` in `cycles.js`.
- **Add a modal:** a `<div id="modal-x" class="hidden ...">`; open with
  `openModal('modal-x')`, close with `closeModal('modal-x')`. Escape closes the
  top-most modal (wired in `app.js`).
- **Add a collection:** add a helper on `T` in `firebase.js`, then a `match`
  block in `firestore.rules` (default-deny is already in place), then deploy
  rules. Never read/write it outside `T`.
- **Change scoring:** weights live in `SCORE_WEIGHTS` in `env.js`
  (goals 0.50, manager 0.40, values 0.10). Update the unit tests in
  `tools/test.js` if you change the maths.
- **Onboard a client company:** platform admin only, from inside the app —
  **Create client company** (`modal-newCompany`) collects company name, owner
  email/name, plan and optional allowed domains, then invites the owner as Super
  Admin. See ARCHITECTURE.md § "Onboard a client company" and DEPLOY.md for the
  operator walkthrough. Never build a public self-signup instead.

## Deploying

`DEPLOY.md` has the full step-by-step. Short version, always staging first:

```
npm test
firebase deploy --only firestore:rules
firebase deploy --only hosting:staging      # verify at staging-perfexio.web.app
firebase deploy --only hosting:demo         # verify at staging-perfexio-demo.web.app
firebase deploy --only hosting:production    # only after staging is confirmed
```
