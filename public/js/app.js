/* ============================================================================
 * Perfexio — Application boot, shell wiring and hand-over from auth
 * ----------------------------------------------------------------------------
 * WHAT THIS FILE OWNS
 *   1. Page boot  : runs once when index.html has finished parsing.
 *                   Initialises Firebase, decides which screen to show first,
 *                   and starts the auth listener.
 *   2. startApplication() : the single hand-over point. auth.js calls it after
 *                   the signed-in user has been resolved to a company, a role
 *                   and a settings document. Everything the in-app shell needs
 *                   is switched on from here, in one predictable order.
 *   3. Shell chrome : environment badge, footer build label, workspace
 *                   switcher for Perfexio staff, demo ribbon, keyboard
 *                   shortcuts and a development-only error surface.
 *
 * WHY IT IS LAST IN THE SCRIPT ORDER
 *   Every other module only *declares* functions. This file is the only one
 *   that *calls* them, so it must load after all of them. If you add a new
 *   module, add its <script> tag above app.js in index.html.
 *
 * HOW TO ADD SOMETHING TO BOOT
 *   Put it inside startApplication(), after the listeners are attached, and
 *   make it safe to run twice — startApplication() runs again whenever a
 *   Perfexio staff member switches to a different company workspace.
 * ==========================================================================*/

/** Bumped by hand on each release. Shown in the footer for support triage. */
var PERFEXIO_APP_VERSION = '1.0.0';

/** Guards against a double boot if the script is ever included twice. */
var PERFEXIO_BOOTED = false;

/** True once the in-app shell has been shown at least one time. */
var APP_SHELL_STARTED = false;

/* ---------------------------------------------------------------------------
 * 1. Page boot
 * -------------------------------------------------------------------------*/

/**
 * Entry point. Wired to DOMContentLoaded at the bottom of this file.
 * Nothing here touches Firestore — it only prepares the shell and then lets
 * the auth listener decide which screen the visitor belongs on.
 */
function bootPerfexio() {
  if (PERFEXIO_BOOTED) return;
  PERFEXIO_BOOTED = true;

  paintBrandMarks();
  applyEnvironmentChrome();
  registerGlobalShortcuts();
  registerDevelopmentErrorSurface();

  /* No Firebase keys yet -> show the setup instructions and stop. */
  if (isFirebaseConfigMissing()) {
    console.warn('Perfexio: Firebase web config is still using placeholder values.');
    showScreen('setupScreen');
    return;
  }

  var ready = initFirebase();
  if (!ready) {
    showScreen('setupScreen');
    return;
  }

  /* The demo persona buttons live on the sign-in screen. */
  renderDemoPanel();

  /* From here on, auth.js drives the screens. */
  startAuthListener();
}

/* ---------------------------------------------------------------------------
 * 2. Hand-over from auth.js
 * -------------------------------------------------------------------------*/

/**
 * Called by loadCompanyContextAndStart() in auth.js once Session.companyId,
 * Session.role and Session.settings are all populated.
 *
 * Runs again on every workspace switch, so each step must be idempotent.
 */
function startApplication() {
  /* A workspace switch must never leave the previous company's listeners
     running, otherwise two tenants would write into the same UI. */
  detachAllListeners();

  showScreen('appContainer');
  APP_SHELL_STARTED = true;

  /* Static chrome that depends on the resolved session. */
  applyEnvironmentChrome();
  applyCompanyBranding(Session.settings);
  updateHeaderProfileDisplay();
  renderPlanSummary();
  renderDemoSessionBar();
  renderHeaderCompanySwitcher();
  resetUserWeightDisplay();

  /* Live data. watchCompanySettings keeps branding and the values statements
     in sync; fetchCyclesAndUsers loads the roster and the review cycles and
     ends by calling applyRolePermissions() and loadDashboard(). */
  watchCompanySettings();
  fetchCyclesAndUsers();

  /* Permissions are applied here as well so the shell is never briefly shown
     with tabs the signed-in role is not allowed to open. */
  applyRolePermissions();

  /* Land on My Goals on first entry; after a workspace switch, stay where the
     user was unless that tab is no longer permitted. */
  if (!currentVisibleTabId()) {
    switchTab('my-okrs');
  } else {
    ensureVisibleTabIsAllowed();
  }

  window.scrollTo(0, 0);
}

/* ---------------------------------------------------------------------------
 * 3. Shell chrome
 * -------------------------------------------------------------------------*/

/**
 * Environment badge, footer label and page title.
 * Safe to call before sign-in, because it only reads ENV.
 */
function applyEnvironmentChrome() {
  var env = ENV || {};

  toggleHidden('envBadge', !env.showEnvironmentBadge);
  setText('envBadgeText', env.label || '');

  // Footer shows only the vendor product name + version. The environment is
  // already visible in the header badge on staging/demo, and in a client's paid
  // portal their own company name should dominate — so "Perfexio" appears just
  // once here rather than being repeated across the chrome.
  setText('footerBuildLabel',
    PERFEXIO_BRAND.productName + ' v' + PERFEXIO_APP_VERSION);

  var titleSuffix = env.showEnvironmentBadge ? ' [' + (env.label || '') + ']' : '';
  document.title = PERFEXIO_BRAND.productName + ' — ' +
    PERFEXIO_BRAND.productSuffix + titleSuffix;

  /* Self-service company sign-up is off in every shipped environment (see
     allowCompanySelfSignup in env.js): a workspace is provisioned by Perfexio
     staff and its owner is invited in. When it is off, the pre-sign-in
     "Create a company" tab and the whole panel switcher are hidden, so a
     visitor only ever sees the Sign in form. switchAuthPanel(),
     handleCreateCompanySignUp() and firestore.rules enforce the same lock, so
     the gate holds even if this chrome never ran. */
  var allowSelfSignup = !!env.allowCompanySelfSignup;
  toggleHidden('authPanelSwitcher', !allowSelfSignup);
  toggleHidden('authTabCreate', !allowSelfSignup);
  if (!allowSelfSignup) {
    var signInPanel = document.getElementById('authPanelSignIn');
    var createPanel = document.getElementById('authPanelCreate');
    if (signInPanel) signInPanel.classList.remove('hidden');
    if (createPanel) createPanel.classList.add('hidden');
  }
}

/**
 * Paint the Perfexio logo mark into every logo tile.
 *
 * Any element carrying a data-perfexio-mark attribute (the sign-in tiles, the
 * setup screen and the header logo box) is filled with PERFEXIO_BRAND.iconSvg.
 * The markup is a trusted constant from env.js — never user input — so it is
 * assigned directly. Each tile keeps its own "PX" text inside as a graceful
 * fallback if this never runs. Runs once at boot, before any screen is shown,
 * so a visitor never sees the bare "PX" text flash first.
 */
function paintBrandMarks() {
  var mark = (PERFEXIO_BRAND && PERFEXIO_BRAND.iconSvg) || '';
  if (!mark) return;

  var tiles = document.querySelectorAll('[data-perfexio-mark]');
  for (var i = 0; i < tiles.length; i++) {
    tiles[i].innerHTML = mark;
  }
}

/**
 * Fill the header workspace switcher. Perfexio staff only.
 *
 * renderPlatformCompanyPicker() in auth.js already caches the company list in
 * PLATFORM_COMPANY_CACHE when a staff member signs in without a company of
 * their own. If the cache is empty (staff member who also belongs to a
 * company), the list is fetched once here.
 */
function renderHeaderCompanySwitcher() {
  var box = document.getElementById('headerCompanySwitcherBox');
  var select = document.getElementById('headerCompanySwitcher');
  if (!box || !select) return;

  if (!Session.isPlatformAdmin) {
    box.classList.add('hidden');
    select.innerHTML = '<option value="">Not available</option>';
    return;
  }

  box.classList.remove('hidden');

  if (PLATFORM_COMPANY_CACHE && PLATFORM_COMPANY_CACHE.length) {
    paintHeaderCompanyOptions(PLATFORM_COMPANY_CACHE);
    return;
  }

  select.innerHTML = '<option value="">Loading workspaces...</option>';
  T.companies().limit(200).get()
    .then(function (snap) {
      PLATFORM_COMPANY_CACHE = [];
      snap.forEach(function (doc) {
        PLATFORM_COMPANY_CACHE.push({ id: doc.id, data: doc.data() || {} });
      });
      paintHeaderCompanyOptions(PLATFORM_COMPANY_CACHE);
    })
    .catch(function (error) {
      console.warn('Workspace list unavailable:', error);
      paintHeaderCompanyOptions([]);
    });
}

/** Write the <option> list, always including the workspace currently open. */
function paintHeaderCompanyOptions(companies) {
  var select = document.getElementById('headerCompanySwitcher');
  if (!select) return;

  var list = (companies || []).slice();
  var openId = Session.companyId;
  var openIsListed = list.some(function (c) { return c.id === openId; });

  if (openId && !openIsListed) {
    list.unshift({
      id: openId,
      data: { name: (Session.company && Session.company.name) || openId }
    });
  }

  if (!list.length) {
    select.innerHTML = '<option value="">No workspaces found</option>';
    return;
  }

  select.innerHTML = list.map(function (c) {
    var label = (c.data && c.data.name) ? c.data.name : c.id;
    return '<option value="' + esc(c.id) + '"' +
      (c.id === openId ? ' selected' : '') + '>' + esc(label) + '</option>';
  }).join('');
}

/* ---------------------------------------------------------------------------
 * Tab guard
 * -------------------------------------------------------------------------*/

/** Id of the tab whose section is currently visible, or '' if none. */
function currentVisibleTabId() {
  for (var i = 0; i < ALL_TAB_IDS.length; i++) {
    var section = document.getElementById('sec-' + ALL_TAB_IDS[i]);
    if (section && !section.classList.contains('hidden')) return ALL_TAB_IDS[i];
  }
  return '';
}

/**
 * After a role change or a workspace switch, the open tab may no longer be
 * permitted. applyRolePermissions() hides the nav button, so a hidden button
 * is the signal to fall back to My Goals.
 */
function ensureVisibleTabIsAllowed() {
  var openTab = currentVisibleTabId();
  if (!openTab || openTab === 'my-okrs') return;

  var navBtn = document.getElementById('tab-' + openTab);
  if (navBtn && navBtn.classList.contains('hidden')) {
    switchTab('my-okrs');
  }
}

/* ---------------------------------------------------------------------------
 * Keyboard shortcuts
 * -------------------------------------------------------------------------*/

/**
 * Escape closes the top-most open modal. Nothing else is bound, so typing in
 * any field stays completely unaffected.
 */
function registerGlobalShortcuts() {
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' && event.keyCode !== 27) return;

    /* Never let Escape interrupt a save that is still in flight. */
    var busy = document.getElementById('busyOverlay');
    if (busy && !busy.classList.contains('hidden')) return;

    var openModals = Array.prototype.filter.call(
      document.querySelectorAll('[id^="modal-"]'),
      function (el) { return !el.classList.contains('hidden'); }
    );
    if (!openModals.length) return;

    /* The last one in document order is the one stacked on top. */
    closeModal(openModals[openModals.length - 1].id);
  });
}

/* ---------------------------------------------------------------------------
 * Development error surface
 * -------------------------------------------------------------------------*/

/**
 * On staging and demo, surface unexpected errors as a toast so a tester never
 * has to open the browser console. Production stays silent and only logs,
 * because a customer should never see a raw stack trace.
 */
function registerDevelopmentErrorSurface() {
  var verbose = !!(ENV && ENV.showEnvironmentBadge);

  window.addEventListener('error', function (event) {
    console.error('Unhandled error:', event.error || event.message);
    if (verbose && APP_SHELL_STARTED) {
      showToast('Unexpected error: ' + (event.message || 'see the browser console'), 'error');
    }
  });

  window.addEventListener('unhandledrejection', function (event) {
    console.error('Unhandled promise rejection:', event.reason);
    if (verbose && APP_SHELL_STARTED) {
      var reason = event.reason;
      var text = (reason && reason.message) ? reason.message : 'see the browser console';
      showToast('Unexpected error: ' + text, 'error');
    }
  });
}

/* ---------------------------------------------------------------------------
 * Kick off
 * -------------------------------------------------------------------------*/

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootPerfexio);
} else {
  bootPerfexio();
}
