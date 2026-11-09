/* ============================================================================
 * Perfexio — Session & application state
 * ----------------------------------------------------------------------------
 * Session   : who is signed in, and which company they are acting inside.
 * App state : the in-memory caches the dashboard renders from.
 * ==========================================================================*/

var Session = {
  uid: null,
  email: null,
  name: null,
  photoUrl: '',
  companyId: null,
  company: null,          // companies/{id} document data
  role: 'Level 1',        // 'Super Admin' | 'Level 2' | 'Level 1'
  isPlatformAdmin: false, // Perfexio staff, may open any company for support
  isCompanyOwner: false,
  settings: null          // companies/{id}/settings/globalConfig data
};

/* ---------------------------------------------------------------------------
 * Legacy-compatible globals.
 * The ported feature code reads these exactly as the single-file build did.
 * -------------------------------------------------------------------------*/
var currentUser = null;          // { email, name }
var userAccessRole = 'Level 1';
var activeCycleId = null;
var cyclesList = [];
var parsedCsvUsers = [];
var currentTeammatesData = [];
var krCounter = 0;
var userMap = {};
var currentTeammateSignedOff = false;
var currentUserSignedOff = false;
var currentUserHasOkrs = false;
var currentUserOkrsList = [];
var allFeedbacksList = [];
var pendingOkrPayload = null;
var rosterIncludeArchived = false;
var companyValuesStatements = DEFAULT_VALUES_STATEMENTS.slice();

/* Chart.js instances — destroyed before every re-render. */
var chartInstanceOverall = null;
var chartInstanceTeam = null;
var chartInstanceManager = null;
var chartInstanceHeadcount = null;
var chartInstanceTargetMet = null;
var chartInstanceMetrics = null;
var chartInstancePie = null;
var chartInstanceFbCategory = null;
var chartInstanceFbDist = null;

/** Reset every cached slice of state. Used on sign-out and company switch. */
function resetApplicationState() {
  currentUser = null;
  userAccessRole = 'Level 1';
  activeCycleId = null;
  cyclesList = [];
  parsedCsvUsers = [];
  currentTeammatesData = [];
  krCounter = 0;
  userMap = {};
  currentTeammateSignedOff = false;
  currentUserSignedOff = false;
  currentUserHasOkrs = false;
  currentUserOkrsList = [];
  allFeedbacksList = [];
  pendingOkrPayload = null;
  rosterIncludeArchived = false;
  companyValuesStatements = DEFAULT_VALUES_STATEMENTS.slice();
}

/** Clear the Session object completely. */
function resetSession() {
  Session.uid = null;
  Session.email = null;
  Session.name = null;
  Session.photoUrl = '';
  Session.companyId = null;
  Session.company = null;
  Session.role = 'Level 1';
  Session.isPlatformAdmin = false;
  Session.isCompanyOwner = false;
  Session.settings = null;
}

/* ---------------------------------------------------------------------------
 * Role helpers
 * -------------------------------------------------------------------------*/

function isSuperAdmin() {
  return userAccessRole === 'Super Admin';
}

function isManagerOrAbove() {
  return userAccessRole === 'Super Admin' || userAccessRole === 'Level 2';
}

/**
 * A protected account cannot be demoted, archived, or locked out.
 * The company owner is always protected; so is the signed-in platform admin.
 */
function isProtectedUser(email) {
  var clean = String(email || '').toLowerCase().trim();
  if (!clean) return false;
  if (Session.company && Session.company.ownerEmail) {
    return clean === String(Session.company.ownerEmail).toLowerCase().trim();
  }
  return false;
}

/** A document is visible unless it has been archived / soft-deleted. */
function isLiveRecord(data) {
  if (!data) return false;
  if (data.isDeleted === true) return false;
  if (data.status === 'archived') return false;
  return true;
}
