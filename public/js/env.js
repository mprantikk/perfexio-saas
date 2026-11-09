/* ============================================================================
 * Perfexio — Environment & Brand Configuration
 * ----------------------------------------------------------------------------
 * This file is the ONLY place where per-environment values live.
 *
 * DEPLOYMENT SHAPE
 *   One Firebase project ....... perfexio
 *   Three Hosting sites ........ perfexio                (production)
 *                                staging-perfexio        (staging)
 *                                staging-perfexio-demo   (sales demo)
 *
 * All three sites share one Firestore database and one Auth user pool, so the
 * three environments are kept apart by DATA PATH instead of by project:
 *
 *   tenants/production/companies/{companyId}/...
 *   tenants/staging/companies/{companyId}/...
 *   tenants/demo/companies/{companyId}/...
 *
 * A staging session can never read or write a production document, because the
 * environment segment is baked into every path by firebase.js and enforced
 * again by firestore.rules.
 *
 * The values below (apiKey, authDomain, projectId, ...) are Firebase *web*
 * config values. They are designed to be public and are safe to ship to the
 * browser — access is controlled by Firestore Security Rules, not by hiding
 * these keys. Never put a service-account private key in this file.
 *
 * HOW TO FILL THIS IN
 *   1. Firebase Console -> project "perfexio" -> Project settings -> General
 *   2. Under "Your apps", add a Web App (or open the existing one)
 *   3. Copy the firebaseConfig object
 *   4. Paste the values into PERFEXIO_FIREBASE_CONFIG below — once only
 * ==========================================================================*/

var PERFEXIO_BRAND = {
  productName: 'Perfexio',
  // Product tagline shown under the company name, in the page title and footer.
  // Kept short and industry-neutral so it reads well for every client company.
  productSuffix: 'Goals, Reviews & Growth',
  // Text fallback for the logo mark, used only if iconSvg fails to render.
  initials: 'PX',
  // The Perfexio logo mark (the loop-and-arrow glyph), as an inline SVG.
  // It is drawn with fill="currentColor", so it takes the colour of whatever
  // box it sits in: white on the dark header and the indigo sign-in tiles, and
  // it would go dark automatically on a light box. The viewBox is padded a
  // little beyond the artwork's 455x454 canvas so the glyph never touches the
  // box edges. This is the single source of truth for the in-app mark — every
  // logo tile is filled from here (see paintBrandMarks() in app.js and the
  // branding fallback in cycles.js), so there is one place to change it.
  iconSvg: '<svg viewBox="-38 -38 531 530" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="w-full h-full" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path fill-rule="evenodd" d="M 352,165 324,193 324,228 320,244 311,263 304,273 289,288 267,301 245,307 65,307 48,311 27,323 10,343 3,358 0,373 2,399 5,408 16,427 33,443 56,452 78,453 102,447 118,436 131,419 137,407 141,389 142,343 249,342 279,334 310,316 329,298 344,276 354,253 359,230 360,202 358,186 Z M 105,344 106,385 104,393 98,404 90,412 78,417 64,417 50,411 40,400 35,385 36,371 42,358 50,350 62,344 Z M 454,1 336,3 337,38 390,39 319,112 296,95 280,87 257,80 243,78 222,78 194,84 172,94 157,104 138,122 129,134 118,154 112,171 106,205 106,285 137,285 168,281 196,272 226,255 242,242 415,64 417,65 417,118 451,118 Z M 293,138 242,192 208,224 194,233 174,242 150,248 141,247 141,206 143,191 149,172 161,151 184,129 200,120 216,115 245,114 267,120 284,130 Z"/></svg>',
  supportEmail: 'support@perfexio.com',
  websiteUrl: 'https://perfexio.web.app'
};

/**
 * One web app config, shared by all three hosting sites.
 * Paste the values from Firebase Console -> Project settings -> Your apps.
 */
var PERFEXIO_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyC3iSGHD_NjI8_M1s82vjS9Px5iYCIOP60',
  authDomain: 'perfexio.firebaseapp.com',
  projectId: 'perfexio',
  storageBucket: 'perfexio.firebasestorage.app',
  messagingSenderId: '330713077730',
  appId: '1:330713077730:web:73dfe9ec6c1dabcb654bbb'
};

var PERFEXIO_ENVIRONMENTS = {
  production: {
    key: 'production',
    label: 'LIVE',
    dataRoot: 'production',
    hostingSite: 'perfexio',
    showEnvironmentBadge: false,
    // Company creation is platform-admin only — no self-service signup. A stray
    // sign-up can never provision a tenant; new companies are added by Perfexio
    // staff from the platform panel. Enforced for real in firestore.rules.
    allowCompanySelfSignup: false,
    showFeedbackTools: false,
    showDemoPanel: false,
    firebase: PERFEXIO_FIREBASE_CONFIG
  },
  staging: {
    key: 'staging',
    label: 'STAGING',
    dataRoot: 'staging',
    hostingSite: 'staging-perfexio',
    showEnvironmentBadge: true,
    // Kept in lock-step with production so the onboarding lock can be tested.
    allowCompanySelfSignup: false,
    showFeedbackTools: true,
    showDemoPanel: false,
    firebase: PERFEXIO_FIREBASE_CONFIG
  },
  demo: {
    key: 'demo',
    label: 'DEMO',
    dataRoot: 'demo',
    hostingSite: 'staging-perfexio-demo',
    showEnvironmentBadge: true,
    allowCompanySelfSignup: false,
    showFeedbackTools: true,
    showDemoPanel: true,
    firebase: PERFEXIO_FIREBASE_CONFIG
  }
};

/**
 * Decide which environment this browser session belongs to.
 * The demo host is checked first, because "staging-perfexio-demo" also
 * contains the staging host name as a prefix.
 */
function detectPerfexioEnvironment() {
  var host = (window.location.hostname || '').toLowerCase();

  if (host.indexOf('staging-perfexio-demo') === 0 || host.indexOf('demo.perfexio') === 0) {
    return 'demo';
  }
  if (host.indexOf('staging-perfexio') === 0 || host.indexOf('staging.perfexio') === 0) {
    return 'staging';
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '') {
    /* Local development. Append ?env=demo or ?env=production to override. */
    var override = (window.location.search || '').match(/[?&]env=(production|staging|demo)/);
    return override ? override[1] : 'staging';
  }
  return 'production';
}

var ENV_NAME = detectPerfexioEnvironment();
var ENV = PERFEXIO_ENVIRONMENTS[ENV_NAME];
var FIREBASE_CONFIG = ENV.firebase;

/** Root path segment that keeps the three environments apart in one database. */
var DATA_ROOT = ENV.dataRoot;

/** True while env.js still contains the placeholder values. */
function isFirebaseConfigMissing() {
  var cfg = FIREBASE_CONFIG || {};
  var required = ['apiKey', 'authDomain', 'projectId', 'appId'];
  for (var i = 0; i < required.length; i++) {
    var val = cfg[required[i]];
    if (!val || String(val).indexOf('PASTE_') === 0) return true;
  }
  return false;
}

/* ---------------------------------------------------------------------------
 * Product defaults
 * -------------------------------------------------------------------------*/

/** Dimension weights used to build the final score. */
var SCORE_WEIGHTS = {
  goals: 0.50,
  manager: 0.40,
  values: 0.10
};

/**
 * Fallback Culture & Values statements for a brand new company.
 * Each company can replace these in Admin Panel -> Company Branding.
 */
var DEFAULT_VALUES_STATEMENTS = [
  'Takes full ownership of outcomes, not just tasks.',
  'Raises the bar on quality and holds a high standard for the team.',
  'Communicates openly, early, and with respect for others.',
  'Puts the customer at the centre of day-to-day decisions.',
  'Moves with urgency and adapts quickly when priorities change.'
];

/** Access roles. Order matters: index = seniority. */
var ACCESS_ROLES = ['Level 1', 'Level 2', 'Super Admin'];

/** Company plan definitions used by the trial / billing surface. */
var COMPANY_PLANS = {
  trial: { label: 'Trial', seatLimit: 25, trialDays: 30 },
  growth: { label: 'Growth', seatLimit: 250, trialDays: 0 },
  enterprise: { label: 'Enterprise', seatLimit: 100000, trialDays: 0 }
};

/* ---------------------------------------------------------------------------
 * Sales demo workspace
 * ---------------------------------------------------------------------------
 * ENV.showDemoPanel is true only on the demo hosting site, so these buttons
 * never appear on staging or on the live product.
 *
 * These are ordinary Firebase accounts inside one ordinary company workspace
 * that lives under tenants/demo/. The one-click buttons run the real
 * signInWithEmailAndPassword call, so there is no login bypass and no extra
 * security rule is required. The password below is meant to be public — it
 * only unlocks sample data inside the demo data root.
 * -------------------------------------------------------------------------*/

var DEMO_CONFIG = {
  companyId: 'northwind-demo',
  companyName: 'Northwind Logistics',
  password: 'PerfexioDemo2026!',
  cycleId: 'CYCLE-DEMO-H2',
  cycleName: 'H2 Performance Review'
};

/**
 * Personas shown as one-click sign-in buttons on the demo sign-in screen.
 * Order is the order of the buttons, so a pitch runs top to bottom.
 */
var DEMO_PERSONAS = [
  {
    key: 'admin',
    email: 'hr.director@demo.perfexio.com',
    name: 'Amelia Hart',
    role: 'Super Admin',
    designation: 'HR Director',
    departmentName: 'People',
    teamName: 'Leadership',
    managerEmail: '',
    buttonLabel: 'HR Director',
    buttonHint: 'Full administration: cycles, roster, reports and branding',
    accent: 'from-indigo-500 to-indigo-700'
  },
  {
    key: 'manager',
    email: 'ops.manager@demo.perfexio.com',
    name: 'Daniel Reyes',
    role: 'Level 2',
    designation: 'Operations Manager',
    departmentName: 'Operations',
    teamName: 'Fulfilment',
    managerEmail: 'hr.director@demo.perfexio.com',
    buttonLabel: 'Line Manager',
    buttonHint: 'Reviews the team, rates performance and signs off',
    accent: 'from-blue-500 to-blue-700'
  },
  {
    key: 'employee',
    email: 'analyst@demo.perfexio.com',
    name: 'Priya Nair',
    role: 'Level 1',
    designation: 'Operations Analyst',
    departmentName: 'Operations',
    teamName: 'Fulfilment',
    managerEmail: 'ops.manager@demo.perfexio.com',
    buttonLabel: 'Employee',
    buttonHint: 'Own goals, check-ins and the published final summary',
    accent: 'from-emerald-500 to-emerald-700'
  }
];

/** Extra sample teammates, so the reports and charts look realistic. */
var DEMO_EXTRA_PEOPLE = [
  { email: 'warehouse.lead@demo.perfexio.com', name: 'Marcus Bell', role: 'Level 1', designation: 'Warehouse Lead', departmentName: 'Operations', teamName: 'Fulfilment', managerEmail: 'ops.manager@demo.perfexio.com' },
  { email: 'dispatch.coord@demo.perfexio.com', name: 'Sofia Lindqvist', role: 'Level 1', designation: 'Dispatch Coordinator', departmentName: 'Operations', teamName: 'Fulfilment', managerEmail: 'ops.manager@demo.perfexio.com' },
  { email: 'finance.manager@demo.perfexio.com', name: 'Ethan Cole', role: 'Level 2', designation: 'Finance Manager', departmentName: 'Finance', teamName: 'Controlling', managerEmail: 'hr.director@demo.perfexio.com' },
  { email: 'accountant@demo.perfexio.com', name: 'Hana Sato', role: 'Level 1', designation: 'Senior Accountant', departmentName: 'Finance', teamName: 'Controlling', managerEmail: 'finance.manager@demo.perfexio.com' },
  { email: 'sales.manager@demo.perfexio.com', name: 'Olivia Grant', role: 'Level 2', designation: 'Sales Manager', departmentName: 'Commercial', teamName: 'Key Accounts', managerEmail: 'hr.director@demo.perfexio.com' },
  { email: 'account.exec@demo.perfexio.com', name: 'Tomas Novak', role: 'Level 1', designation: 'Account Executive', departmentName: 'Commercial', teamName: 'Key Accounts', managerEmail: 'sales.manager@demo.perfexio.com' }
];
