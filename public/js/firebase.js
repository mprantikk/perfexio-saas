/* ============================================================================
 * Perfexio — Firebase bootstrap + multi-tenant path helpers
 * ----------------------------------------------------------------------------
 * One Firebase project serves three hosting sites, so the environment is part
 * of the data path. Everything a session can touch sits under one root:
 *
 *   tenants/{DATA_ROOT}/companies/{companyId}/users/{email}
 *   tenants/{DATA_ROOT}/companies/{companyId}/okrs/{okrId}
 *   tenants/{DATA_ROOT}/companies/{companyId}/reviewCycles/{cycleId}
 *   tenants/{DATA_ROOT}/companies/{companyId}/performanceRatings/{cycleId}_{email}
 *   tenants/{DATA_ROOT}/companies/{companyId}/valuesEvaluations/{cycleId}_{email}_{index}
 *   tenants/{DATA_ROOT}/companies/{companyId}/settings/globalConfig
 *   tenants/{DATA_ROOT}/companies/{companyId}/feedback/{autoId}
 *
 * DATA_ROOT is 'production', 'staging', or 'demo' and comes from env.js, which
 * derives it from the hostname. Staging can therefore never see production
 * data even though both share one database.
 *
 * Three small per-environment collections make login and security rules work
 * without any Cloud Functions, so the product runs on the free Spark plan:
 *
 *   tenants/{DATA_ROOT}/userIndex/{uid}          -> { email, companyId }
 *   tenants/{DATA_ROOT}/invitesByEmail/{email}   -> { companyId, role, name, ... }
 *   tenants/{DATA_ROOT}/platformAdmins/{uid}     -> { email }  (created by hand)
 *
 * Nothing in the app may reach into a raw collection name directly. Always go
 * through T.* so a request can never escape the environment or the company.
 * ==========================================================================*/

var fbApp = null;
var db = null;
var auth = null;

function initFirebase() {
  if (fbApp) return fbApp;
  fbApp = firebase.initializeApp(FIREBASE_CONFIG);
  db = firebase.firestore();
  auth = firebase.auth();
  try {
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  } catch (e) {
    console.warn('Auth persistence could not be set:', e);
  }
  return fbApp;
}

/** firebase.firestore.FieldValue shortcut. */
function FV() {
  return firebase.firestore.FieldValue;
}

/** Server timestamp shortcut. */
function SERVER_TS() {
  return firebase.firestore.FieldValue.serverTimestamp();
}

/* ---------------------------------------------------------------------------
 * Tenant path helpers
 * -------------------------------------------------------------------------*/

var T = {
  /** The environment root document. Every other path hangs off this. */
  root: function () {
    return db.collection('tenants').doc(DATA_ROOT);
  },

  /** Guard so a missing companyId fails loudly instead of writing to the root. */
  _cid: function () {
    if (!Session.companyId) {
      throw new Error('No active company on this session.');
    }
    return Session.companyId;
  },

  companies: function () {
    return this.root().collection('companies');
  },
  companyDoc: function (companyId) {
    return this.companies().doc(companyId || this._cid());
  },
  users: function () {
    return this.companyDoc().collection('users');
  },
  userDoc: function (email) {
    return this.users().doc(String(email || '').toLowerCase().trim());
  },
  okrs: function () {
    return this.companyDoc().collection('okrs');
  },
  cycles: function () {
    return this.companyDoc().collection('reviewCycles');
  },
  ratings: function () {
    return this.companyDoc().collection('performanceRatings');
  },
  valuesEvals: function () {
    return this.companyDoc().collection('valuesEvaluations');
  },
  feedback: function () {
    return this.companyDoc().collection('feedback');
  },
  settingsDoc: function (companyId) {
    return this.companyDoc(companyId).collection('settings').doc('globalConfig');
  },

  /* per-environment lookup collections */
  userIndex: function (uid) {
    return this.root().collection('userIndex').doc(uid);
  },
  invite: function (email) {
    return this.root().collection('invitesByEmail').doc(String(email || '').toLowerCase().trim());
  },
  platformAdmin: function (uid) {
    return this.root().collection('platformAdmins').doc(uid);
  },

  /* deterministic document ids — keeps writes idempotent, never needs a delete */
  ratingId: function (cycleId, email) {
    return cycleId + '_' + String(email || '').toLowerCase().trim();
  },
  valuesId: function (cycleId, email, index) {
    return cycleId + '_' + String(email || '').toLowerCase().trim() + '_' + index;
  }
};

/** Batch helper so callers do not touch the firebase namespace. */
function newBatch() {
  return db.batch();
}
