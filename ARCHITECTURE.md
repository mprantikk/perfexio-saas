# ARCHITECTURE.md — Perfexio

The complete technical map of the codebase. Read this before any structural
change. `CLAUDE.md` holds the short must-follow rules; this file explains how
the pieces fit so you can extend them safely.

---

## 1. What the product is, in one paragraph

Perfexio is a multi-tenant performance-management app. A company runs review
*cycles*; each employee owns *goals/OKRs*; managers give a *manager rating* and
score people against *culture & values* statements; a weighted final score rolls
up (Goals 50% + Manager 40% + Values 10%); reports and analytics summarise it.
It is a static site — plain HTML, CSS and classic `<script>` JavaScript — talking
directly to Firebase Authentication and Cloud Firestore from the browser. There
is no server, no build step, no framework, and no Cloud Functions. Security is
enforced entirely by Firestore rules.

---

## 2. Deployment shape

One Firebase project, `perfexio`, hosts three sites off one Firestore database
and one Auth user pool:

| Site (hosting target) | Hostname | Role | Data root |
|---|---|---|---|
| `production` | `perfexio.web.app` | live customer app | `tenants/production` |
| `staging` | `staging-perfexio.web.app` | test before production | `tenants/staging` |
| `demo` | `staging-perfexio-demo.web.app` | sales/pitch demo | `tenants/demo` |

The three sites serve identical code. What differs is the *data root*, chosen at
runtime from the hostname (see §7). Because every path is prefixed with the data
root, staging can never read production data even though they share a database.

Deploy order is always staging → demo → production. Never deploy production
without confirming staging first.

---

## 3. Files and load order

Everything lives under `public/`. Scripts load in this fixed order in
`index.html`; `tools/test.js` mirrors the list in `LOAD_ORDER` and will fail if
they drift apart.

```
public/
  index.html         one page: setup, auth and app screens + every modal
  css/               (Tailwind is loaded from CDN in index.html)
  js/
    env.js       (1) environment + brand config, scoring weights, demo personas
    firebase.js  (2) Firebase init + the T.* tenant path router
    state.js     (3) Session object, in-memory caches, role/record helpers
    ui.js        (4) modals, tabs, toasts, formatting, CSV, image resize
    auth.js      (5) sign-in, tenant resolution, onboarding, own-profile edits
    cycles.js    (6) review cycles, roster load, applyRolePermissions()
    okrs.js      (7) objectives/key results, weighting, personal summary, scoring
    team.js      (8) manager review, values scoring, final sign-off
    admin.js     (9) roster admin, invitations, CSV import, company branding
    reports.js  (10) reports, analytics charts, CSV exports
    feedback.js (11) product-feedback capture + dashboard
    demo.js     (12) sales-demo sign-in panel + sample-company seeder
    app.js      (13) boot + the startApplication() hand-over; loaded LAST
```

Why this order: a file may *reference* a global defined in a later file as long
as the reference only runs after boot (all handlers do). But definitions used at
parse time must come first — so `env.js` (constants) is first, and `app.js`
(which actually *calls* things at boot) is last. When you add a module, insert
its `<script>` tag above `app.js` and add the filename to `LOAD_ORDER` in
`tools/test.js`.

```
firestore.rules      security rules — the ONLY real access control
firebase.json        hosting targets + rules file wiring
.firebaserc          maps target names (production/staging/demo) to sites
package.json         npm scripts: test + deploy:*
tools/test.js        no-dependency test harness (node tools/test.js)
tools/_js_ids_all.json   ids the JS reads; checked against index.html
```

---

## 4. The tenant router: `T.*` (firebase.js)

**Every Firestore access goes through `T`.** Never write
`db.collection('okrs')` directly — that would escape both the environment prefix
and the company scope. `T.root()` is the single place the data root is applied.

```
T.root()                    -> tenants/{DATA_ROOT}
T.companies()               -> .../companies
T.companyDoc(id?)           -> .../companies/{id or Session.companyId}
T.users()                   -> .../users            (doc id = lowercased email)
T.userDoc(email)            -> .../users/{email}
T.okrs()                    -> .../okrs
T.cycles()                  -> .../reviewCycles
T.ratings()                 -> .../performanceRatings
T.valuesEvals()             -> .../valuesEvaluations
T.feedback()                -> .../feedback
T.settingsDoc(id?)          -> .../settings/globalConfig

per-environment lookup collections (not under a company):
T.userIndex(uid)            -> tenants/{root}/userIndex/{uid}      {email, companyId}
T.invite(email)             -> tenants/{root}/invitesByEmail/{email}
T.platformAdmin(uid)        -> tenants/{root}/platformAdmins/{uid} (created by hand)

deterministic ids:
T.ratingId(cycleId, email)          -> "{cycleId}_{email}"
T.valuesId(cycleId, email, index)   -> "{cycleId}_{email}_{index}"
```

`T._cid()` throws if `Session.companyId` is unset, so a bug fails loudly instead
of silently writing to the wrong place. Helpers: `FV()` (FieldValue),
`SERVER_TS()` (server timestamp), `newBatch()` (write batch).

The three lookup collections exist so login and security rules work without
Cloud Functions: `userIndex` maps a signed-in uid to its company;
`invitesByEmail` lets an admin pre-authorise someone by email; `platformAdmins`
marks Perfexio staff who may open any company for support.

---

## 5. Session and state (state.js)

`Session` is the source of truth for *who is acting and where*:

```
Session.uid / email / name / photoUrl
Session.companyId          active company
Session.company            companies/{id} document data
Session.role               'Super Admin' | 'Level 2' | 'Level 1'
Session.isPlatformAdmin    Perfexio staff — may switch companies
Session.isCompanyOwner
Session.settings           settings/globalConfig data
```

Alongside it are legacy-compatible globals the ported feature code reads
directly (`currentUser`, `userAccessRole`, `activeCycleId`, `cyclesList`,
`userMap`, the `chartInstance*` handles, etc.). `resetApplicationState()` and
`resetSession()` clear these on sign-out and company switch.

Role helpers: `isSuperAdmin()`, `isManagerOrAbove()`. Record helpers:
`isProtectedUser(email)` (owner can't be demoted/archived) and
`isLiveRecord(data)` (false if `isDeleted === true` or `status === 'archived'`).
Use `isLiveRecord()` whenever you list records so archived rows stay hidden
without being deleted.

The three access levels map to product roles: **Super Admin** = HR Director /
full company admin; **Level 2** = Line Manager (sees self + everyone below);
**Level 1** = Employee (sees only self).

---

## 6. Conventions that hold the app together

**Globals + inline handlers.** No modules, no bundler. Functions are top-level
`function name() {}` and buttons call them with `onclick="name()"`. Any function
a handler calls must be a global in one of the `js/*.js` files.
`tools/test.js` extracts every `on*` attribute and fails if a referenced name is
not defined.

**Element ids are a contract.** JS locates elements by `id`. The harness reads
`tools/_js_ids_all.json` (every id the JS touches) and fails if one is missing
from `index.html`. Structural id patterns:

- `tab-<name>` — a nav button; `sec-<name>` — its content section.
  `switchTab()` shows one section and styles its button.
- `modal-<name>` — a modal overlay; open/close with `openModal`/`closeModal`.

**Screens.** `showScreen(id)` swaps the top-level screen (`setupScreen`,
`authScreen`, `appContainer`). `showBusy`/`hideBusy` toggle the working overlay;
`showToast(msg, 'success'|'error'|'info')` is the standard notice. Always
`esc()` user text before putting it in `innerHTML`.

**Tabs.** `ALL_TAB_IDS` in `ui.js` is the registry:
`['my-okrs','final-summary','team-view','reports','analytics','admin-panel','feedback-dash']`.
`switchTab()` lazy-loads on entry: `final-summary → loadDashboard()`,
`reports`/`analytics` → `loadReports()`, `feedback-dash → loadFeedbackDashboard()`.

---

## 7. Environment detection (env.js)

`detectPerfexioEnvironment()` picks the environment from `location.hostname`:

- contains `staging-perfexio-demo` → **demo** (checked *before* the staging
  prefix, because the demo host also starts with `staging-perfexio`)
- contains `staging-perfexio` → **staging**
- `localhost` / `127.0.0.1` → **staging**, with a `?env=production|demo`
  override for local testing
- otherwise → **production**

The chosen entry sets `DATA_ROOT`, the hosting site name, and feature flags:
`showEnvironmentBadge`, `allowCompanySelfSignup`, `showFeedbackTools`,
`showDemoPanel`. `env.js` is the single place these differ; nothing else should
branch on hostname.

Also in `env.js`: `FIREBASE_CONFIG` (the public web config — safe to commit),
`PERFEXIO_BRAND` (product name "Perfexio", tagline "Goals, Reviews & Growth", support
email, `iconSvg` — the logo mark drawn with `fill="currentColor"` so one glyph
serves the light-on-dark header and the indigo sign-in tiles — and `initials`
"PX" as its text fallback), `SCORE_WEIGHTS`, `DEFAULT_VALUES_STATEMENTS`,
`ACCESS_ROLES`, `COMPANY_PLANS`, and the demo `DEMO_CONFIG` / `DEMO_PERSONAS` /
`DEMO_EXTRA_PEOPLE`.

---

## 8. Boot and the single hand-over (app.js)

```
bootPerfexio()               runs once when index.html finishes parsing
  ├─ paintBrandMarks()          fills every [data-perfexio-mark] tile with the logo
  ├─ applyEnvironmentChrome()   badge, footer build label, document.title
  ├─ registerGlobalShortcuts()  Escape closes the top-most open modal
  ├─ registerDevelopmentErrorSurface()  (staging/demo) window errors -> toast
  ├─ if config missing -> showScreen('setupScreen')  and stop
  └─ else initFirebase(); renderDemoPanel(); startAuthListener()

startAuthListener() (auth.js)  resolves the signed-in user to a company/role,
                               then calls:

startApplication()            the ONE hand-over into the in-app shell:
  detachAllListeners() → showScreen('appContainer') → applyEnvironmentChrome()
  → applyCompanyBranding() → updateHeaderProfileDisplay() → renderPlanSummary()
  → renderDemoSessionBar() → renderHeaderCompanySwitcher() →
  resetUserWeightDisplay() → watchCompanySettings() → fetchCyclesAndUsers() →
  applyRolePermissions() → land on 'my-okrs' (or a still-allowed tab)
```

If you add something that must be live as soon as a user is in the app, wire it
into `startApplication()` in a sensible spot — that is the deliberate single
choke point, so state is always initialised in one predictable order.

---

## 9. Data model (Firestore)

Everything a session touches is under one root document:

```
tenants/{production|staging|demo}/
  userIndex/{uid}                 { email, companyId }
  invitesByEmail/{email}          { companyId, role, name, ... }
  platformAdmins/{uid}            { email }
  companies/{companyId}
    (doc)                         { name, ownerEmail, plan, seatLimit, status, allowedDomains[], branding... }
    users/{email}                 roster: { name, email, accessLevel, managerEmail, status... }
    okrs/{okrId}                  objectives + key results, weight, direction, values
    reviewCycles/{cycleId}        { name, dates, isLocked, isDeleted }
    performanceRatings/{cycleId}_{email}   manager rating (deterministic id)
    valuesEvaluations/{cycleId}_{email}_{i} one row per values statement
    settings/globalConfig         company settings + values statements
    feedback/{autoId}             product feedback
```

Deterministic ids on ratings and values evaluations make every write an
idempotent `set(..., {merge:true})` — re-saving updates in place and never needs
a delete. Preserve that property when you touch those collections.

---

## 10. Scoring model (okrs.js + ui.js)

- `calculateOkrAchievementPercentage(okr)` — per-goal achievement.
  `INCREASE` goals reward hitting/exceeding target; `DECREASE` goals reward
  coming in under it; a `targetValue` of 0 yields 0 (never divides by zero).
- Goals excluded via `isExcludedFromScoring` drop out of the goal score.
- `computeScoreBundle({okrs, values, managerRating})` returns
  `{goal, manager, values, final}` as fixed-2 strings. Final =
  `goal*0.50 + manager*0.40 + values*0.10` using `SCORE_WEIGHTS` (which must sum
  to 1.0 — the test asserts this).
- `formatScoreFive(pct)` maps a 0–100 score onto a clamped 0.00–5.00 string for
  display.

If you change weights, edit `SCORE_WEIGHTS` in `env.js` and update the unit
assertions in `tools/test.js` so the harness matches the new maths.

---

## 11. Security rules (firestore.rules)

The rules are the real access control — the client is untrusted. Structure:
everything lives under `match /tenants/{root}` with helper functions
(`isSignedIn`, `myEmail`, `isPlatformAdmin`, `myCompanyId`, `inCompany`,
`isCompanyOwner`, `myAccessLevel`, `isActiveMember`, `isSuperAdminOf`,
`isAdminOrAbove`, `isManagerOrAbove`, plus the invite/onboarding helpers
`hasLiveInvite`, `boundByInvite`, `claimingMyInvite`, and the domain helpers
`companyAllowedDomains`, `emailDomainAllowed`). Key intentions:

- **Company isolation:** a member only reads/writes within their own
  `companyId` (from their `userIndex` doc); platform admins may cross companies.
- **Company creation is platform-admin-only:** a `companies/{id}` `create` is
  allowed only for a `platformAdmins/{uid}` (the demo root self-provisions its
  one sample company as the sole exception). Self-service sign-up can never mint
  a tenant, even if the client JS is bypassed — this is what backs the
  `allowCompanySelfSignup: false` flag set for every environment in `env.js`.
- **Only invited users can join:** binding a uid to a company (`userIndex`
  create) and creating the roster record both require a live invite naming that
  exact company (`boundByInvite` / `claimingMyInvite`), so nobody reaches a
  workspace by guessing its id. The invite also pins `accessLevel` to the
  invited `role`, so a user cannot hand themselves Super Admin on the way in.
- **Domain allow-list (optional, per company):** if a company sets
  `allowedDomains`, an admin may only invite addresses whose domain is on that
  list (`emailDomainAllowed` gates `invitesByEmail` create). An empty or absent
  list means no restriction, so companies created before the feature are
  unaffected.
- **Per-company Super Admin:** `isSuperAdminOf(companyId)` is scoped to one
  company, so a client's Super Admin has full control of *their* workspace only
  and never sees another tenant. Platform admins (Perfexio staff) are the only
  cross-company role.
- **Customers can't self-promote:** company `update` is allowed for super admins
  but `plan`, `seatLimit`, `ownerEmail`, `status` and `trialEndsOn` are locked
  from customer writes (only platform tooling changes them).
- **Managers rate others, not themselves:** writing a `performanceRating` /
  `valuesEvaluation` requires manager-or-above and `ownerEmail != myEmail()`.
- **Own-profile edits are allow-listed:** a user may update only a fixed set of
  their own fields (`editsOnlyOwnProfileFields`).
- **Delete is denied everywhere.** Cycles and users are retired with
  `isDeleted` / `status:'archived'`, never removed.

After editing rules, deploy them (`npm run deploy:rules`) and re-check in the
Firebase Console Rules Playground.

---

## 12. Recipes

**Add a tab.**
1. In `index.html`: a nav button `id="tab-x"` and a section `id="sec-x"`
   (start it with `class="hidden"`).
2. In `ui.js`: add `'x'` to `ALL_TAB_IDS`; if it needs data on entry, add a
   branch in `switchTab()` (e.g. `else if (tabId === 'x') loadX();`).
3. In `cycles.js` `applyRolePermissions()`: show/hide `tab-x` for the roles that
   may see it.
4. Add any new element ids to `tools/_js_ids_all.json`, then `npm test`.

**Add a modal.**
`<div id="modal-x" class="hidden ...">` in `index.html`; open with
`openModal('modal-x')`, close with `closeModal('modal-x')`. Escape already closes
the top-most modal (wired in `app.js`). If it has a form, add a
`resetXModalFields()` and call it from `openModal` like the OKR/feedback modals.

**Add a collection.**
1. Add a helper to `T` in `firebase.js` (`T.things = function () { return this.companyDoc().collection('things'); }`).
2. Add a `match /things/{id}` block in `firestore.rules` (default-deny already
   covers unlisted paths, so be explicit about who may read/write).
3. Deploy rules. Only ever access it through `T.things()`.

**Add a field to an existing document.**
Write it additively (new key with a sensible default on read); never rename an
existing key in place, or old documents lose that data. If a rule restricts
which fields a role may write, add the new field there too.

**Change brand, logo or tagline.**
Edit `PERFEXIO_BRAND` in `env.js` only — including `iconSvg` for the logo mark.
UI reads from it; don't hard-code the name or inline the glyph elsewhere. The
in-app tiles are painted from `iconSvg` at boot by `paintBrandMarks()`; the
favicon files in `public/` (`favicon.svg`, `favicon-32.png`,
`apple-touch-icon.png`) are separate static assets — regenerate them if the
glyph changes.

**Onboard a client company (platform admin only).**
There is no self-service sign-up. A new customer workspace is created from
inside the running app by a signed-in platform admin:
1. Sign in as a platform admin, then on the company picker / header switcher use
   **Create client company** (`openNewCompanyModal()` → `modal-newCompany`).
2. Collect and enter: company name, the owner's email (the person who will be
   the client's Super Admin), the owner's name, a plan (`trial`/`growth`/
   `enterprise` from `COMPANY_PLANS`), and — optionally — one or more allowed
   email domains for sign-in restriction.
3. `handleCreateClientCompany()` writes three docs in one batch: the
   `companies/{id}` doc (with `allowedDomains`), its `settings/globalConfig`, and
   an `invitesByEmail/{ownerEmail}` invite with `role: 'Super Admin'`. It never
   touches the caller's own `userIndex`, so the platform admin stays unbound.
4. The client signs in with the invited email; `claimInviteForCurrentUser()`
   binds them, creates their roster record as Super Admin, and marks the invite
   accepted. From there the client's Super Admin invites their own staff (subject
   to the domain allow-list). Full operator walkthrough lives in `DEPLOY.md`.

---

## 13. Testing

```
npm test        # == node tools/test.js ; no npm install needed
```

Six sections, all must pass (exit 0):

1. **syntax** — `node --check` on every `public/js/*.js`.
2. **handlers** — every inline `on*` handler in `index.html` resolves to a
   defined global.
3. **ids** — every id in `tools/_js_ids_all.json` exists in `index.html`
   (run-time ids are whitelisted by the `sec-`/`tab-`/`weight_input_` prefixes
   and a short exact list).
4. **duplicate-ids** — no id appears twice in `index.html`.
5. **language** — no Bengali script and no Banglish tokens in shipped UI
   (comments are stripped first, so English code comments are fine).
6. **unit** — pure-logic assertions for achievement %, `formatScoreFive`,
   `SCORE_WEIGHTS` summing to 1, `computeScoreBundle` (perfect/blended/excluded/
   empty), `splitCsvLine` (quoted commas, escaped quotes), and
   `detectPerfexioEnvironment` host mapping. Source is loaded into a `vm`
   sandbox with browser/Firebase stubs, so no network or DOM is touched.

Run it before every commit and every deploy. When you add a global that a
handler calls, a new id, or a new module, the harness tells you what to update.

---

## 14. Reports and analytics (reports.js)

The **Reports** tab and the **Visual dashboard** tab (`sec-reports` and
`sec-analytics`) are both rendered by `loadReports()` — `switchTab()` calls it
for either tab, so they never fall out of sync. `loadReports()` reads the active
cycle's goals and manager ratings once, aggregates per person, then feeds three
renderers.

**Comparability is the core design rule.** Raw goal values are not comparable
across people (dollars vs tickets vs percentages), so every cross-person view is
built on figures that *are* comparable: per-goal achievement as a 0–100(+)%
(`calculateOkrAchievementPercentage`), manager ratings on the 1–5 scale, and
plain head-counts/status. Never chart summed raw target/achieved values across
mixed goals — that was the old dashboard's flaw and it is deliberately gone.

What renders, and the functions behind it:

- **Existing reports (must not be removed).** `userReportTableBody` — the User
  performance summary (one row per person: goals, average progress, score /5,
  recommendation, manager feedback). `okrReportTableBody` — the detailed goal
  matrix (one row per goal). Both are load-bearing customer features; keep them.
- **Leadership summary** (`renderLeadershipSummary`) — a KPI strip
  (`kpiAvgRating`, `kpiTopBox`, `kpiReviewCompletion`, `kpiAtRisk`), a
  department/team performance table (`deptSummaryTableBody`), and an at-risk
  goals table (`atRiskTableBody`, goals below `AT_RISK_THRESHOLD` = 50%).
- **Visual dashboard** (`renderAnalyticsCharts`) — seven Chart.js charts on the
  comparable figures above: achievement distribution, average achievement by
  department and by team, manager-rating calibration, goal health, review
  completion, and goal-plan approval. Canvas ids are unchanged from the original
  build, so no HTML wiring moved.
- **CSV exports** — `exportUserSummaryCSV`, `exportDetailedMatrixCSV`,
  `exportRosterCSV` (existing) plus `exportDeptSummaryCSV`, `exportAtRiskCSV`
  (leadership). Each guards on an active cycle and reuses the last rendered rows.

If you add a report, add it *alongside* these — never replace the two existing
tables — and drive any new cross-person chart from comparable figures.
