/* ============================================================================
 * Perfexio — Authentication, tenant resolution, onboarding, self profile
 * ----------------------------------------------------------------------------
 * Replaces the old demo login (which granted Super Admin to any typed email).
 *
 * Sign-in options : email + password, Google.
 * Getting a tenant: 1) userIndex/{uid} already maps you to a company
 *                   2) an admin invited your email -> invitesByEmail/{email}
 *                   3) you create a new company and become its owner
 *                   4) Perfexio staff (platformAdmins/{uid}) pick any company
 * ==========================================================================*/

var AUTH_BOOTSTRAPPED = false;
var PLATFORM_COMPANY_CACHE = [];

/* ---------------------------------------------------------------------------
 * Screen switching
 * -------------------------------------------------------------------------*/

function showScreen(which) {
  ['setupScreen', 'authScreen', 'onboardingScreen', 'appContainer'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  var target = document.getElementById(which);
  if (target) target.classList.remove('hidden');
}

function switchAuthPanel(panel) {
  /* Create-a-company is only offered when this build allows self-signup, which
     is off in every shipped environment. Fall back to Sign in otherwise, so
     the panel can never be reached even if the tab is forced visible. */
  if (panel === 'createCompany' && !(ENV && ENV.allowCompanySelfSignup)) {
    panel = 'signin';
  }
  var isSignIn = (panel !== 'createCompany');
  var signIn = document.getElementById('authPanelSignIn');
  var create = document.getElementById('authPanelCreate');
  if (signIn) signIn.classList.toggle('hidden', !isSignIn);
  if (create) create.classList.toggle('hidden', isSignIn);

  var tabSignIn = document.getElementById('authTabSignIn');
  var tabCreate = document.getElementById('authTabCreate');
  [[tabSignIn, isSignIn], [tabCreate, !isSignIn]].forEach(function (pair) {
    if (!pair[0]) return;
    if (pair[1]) {
      pair[0].classList.add('bg-white/15', 'text-white');
      pair[0].classList.remove('text-slate-400');
    } else {
      pair[0].classList.remove('bg-white/15', 'text-white');
      pair[0].classList.add('text-slate-400');
    }
  });
  setAuthMessage('', null);
}

function setAuthMessage(message, kind) {
  var box = document.getElementById('authMessage');
  if (!box) return;
  if (!message) {
    box.classList.add('hidden');
    box.textContent = '';
    return;
  }
  var cls = (kind === 'error')
    ? 'border-rose-400/40 bg-rose-500/15 text-rose-200'
    : (kind === 'success')
      ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
      : 'border-indigo-400/40 bg-indigo-500/15 text-indigo-200';
  box.className = 'mb-4 rounded-xl border px-4 py-3 text-xs font-semibold ' + cls;
  box.textContent = message;
  box.classList.remove('hidden');
}

/** Turn Firebase auth error codes into plain, user-facing English. */
function friendlyAuthError(error) {
  var code = (error && error.code) ? error.code : '';
  var map = {
    'auth/invalid-email': 'That email address does not look valid.',
    'auth/user-disabled': 'This account has been disabled. Please contact your administrator.',
    'auth/user-not-found': 'No account exists for that email address.',
    'auth/wrong-password': 'Incorrect email or password. Please try again.',
    'auth/invalid-credential': 'Incorrect email or password. Please try again.',
    'auth/invalid-login-credentials': 'Incorrect email or password. Please try again.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
    'auth/email-already-in-use': 'An account already exists for that email address. Please sign in instead.',
    'auth/weak-password': 'Please choose a password with at least 8 characters.',
    'auth/popup-closed-by-user': 'The Google sign-in window was closed before finishing.',
    'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Please allow pop-ups and try again.',
    'auth/cancelled-popup-request': 'Another sign-in window is already open.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled for this project yet.',
    'auth/network-request-failed': 'Network problem. Please check your connection and try again.',
    'permission-denied': 'You do not have permission to perform that action.'
  };
  if (map[code]) return map[code];
  if (error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

/* ---------------------------------------------------------------------------
 * Sign in / sign up
 * -------------------------------------------------------------------------*/

function handleEmailSignIn(event) {
  if (event) event.preventDefault();
  var email = String(getVal('signInEmail')).toLowerCase().trim();
  var password = getVal('signInPassword');
  if (!email || !password) {
    setAuthMessage('Please enter both your email address and password.', 'error');
    return;
  }
  setAuthMessage('Signing you in...', 'info');
  auth.signInWithEmailAndPassword(email, password)
    .then(function () {
      setAuthMessage('', null);
    })
    .catch(function (error) {
      setAuthMessage(friendlyAuthError(error), 'error');
    });
}

function handleGoogleSignIn() {
  var provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  setAuthMessage('Opening Google sign-in...', 'info');
  auth.signInWithPopup(provider)
    .then(function () {
      setAuthMessage('', null);
    })
    .catch(function (error) {
      setAuthMessage(friendlyAuthError(error), 'error');
    });
}

function handleForgotPassword() {
  var email = String(getVal('signInEmail')).toLowerCase().trim();
  if (!email) {
    setAuthMessage('Enter your email address first, then select "Forgot password".', 'error');
    return;
  }
  auth.sendPasswordResetEmail(email)
    .then(function () {
      setAuthMessage('A password reset link has been sent to ' + email + '. Please check your inbox.', 'success');
    })
    .catch(function (error) {
      setAuthMessage(friendlyAuthError(error), 'error');
    });
}

/** Create a brand new company plus its owner account, from the signed-out form. */
function handleCreateCompanySignUp(event) {
  if (event) event.preventDefault();

  /* Self-service company creation is off in every shipped environment. New
     workspaces are created by a Perfexio platform admin and the owner is
     invited in (enforced in firestore.rules). Refuse here too, so a stray form
     post can never create an orphan sign-in account with no workspace. */
  if (!(ENV && ENV.allowCompanySelfSignup)) {
    setAuthMessage('New workspaces are set up by Perfexio staff. Please sign in, or ask your administrator for an invitation.', 'error');
    return;
  }

  var companyName = String(getVal('signUpCompanyName')).trim();
  var fullName = String(getVal('signUpFullName')).trim();
  var email = String(getVal('signUpEmail')).toLowerCase().trim();
  var password = getVal('signUpPassword');

  if (!companyName || !fullName || !email || !password) {
    setAuthMessage('Please complete every field to create your company workspace.', 'error');
    return;
  }
  if (password.length < 8) {
    setAuthMessage('Please choose a password with at least 8 characters.', 'error');
    return;
  }

  setAuthMessage('Creating your workspace...', 'info');
  auth.createUserWithEmailAndPassword(email, password)
    .then(function (cred) {
      return cred.user.updateProfile({ displayName: fullName }).then(function () {
        return provisionCompany(cred.user, companyName, fullName);
      });
    })
    .then(function () {
      setAuthMessage('', null);
      return bootTenantForUser(auth.currentUser);
    })
    .catch(function (error) {
      setAuthMessage(friendlyAuthError(error), 'error');
    });
}

/** Create a company for a user who is already signed in (onboarding screen). */
function handleCreateCompanyFromOnboarding(event) {
  if (event) event.preventDefault();

  /* Same lock as the signed-out form: company creation is not self-service in
     any shipped environment. The create box is already hidden here, but refuse
     in code too, so the guarantee does not depend on the UI staying hidden. */
  if (!(ENV && ENV.allowCompanySelfSignup)) {
    setOnboardMessage('New workspaces are set up by Perfexio staff. Please ask your administrator for an invitation to this email address.', 'error');
    return;
  }

  var user = auth.currentUser;
  if (!user) {
    showScreen('authScreen');
    return;
  }
  var companyName = String(getVal('onboardCompanyName')).trim();
  var fullName = String(getVal('onboardFullName')).trim() || user.displayName || user.email.split('@')[0];
  if (!companyName) {
    setOnboardMessage('Please enter your company name.', 'error');
    return;
  }
  setOnboardMessage('Creating your workspace...', 'info');
  provisionCompany(user, companyName, fullName)
    .then(function () {
      setOnboardMessage('', null);
      return bootTenantForUser(user);
    })
    .catch(function (error) {
      setOnboardMessage(friendlyAuthError(error), 'error');
    });
}

function setOnboardMessage(message, kind) {
  var box = document.getElementById('onboardMessage');
  if (!box) return;
  if (!message) {
    box.classList.add('hidden');
    box.textContent = '';
    return;
  }
  var cls = (kind === 'error')
    ? 'border-rose-400/40 bg-rose-500/15 text-rose-200'
    : 'border-indigo-400/40 bg-indigo-500/15 text-indigo-200';
  box.className = 'mb-4 rounded-xl border px-4 py-3 text-xs font-semibold ' + cls;
  box.textContent = message;
  box.classList.remove('hidden');
}

/* ---------------------------------------------------------------------------
 * Company provisioning
 * -------------------------------------------------------------------------*/

function slugifyCompanyName(name) {
  var slug = String(name || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
  return slug || 'company';
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 7);
}

/**
 * Writes are sequential on purpose: each security rule check reads the
 * document written by the previous step, and a batch would hide those writes.
 */
function provisionCompany(user, companyName, fullName) {
  var email = String(user.email).toLowerCase().trim();
  var companyId = slugifyCompanyName(companyName) + '-' + randomSuffix();
  var trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + COMPANY_PLANS.trial.trialDays);

  return T.companyDoc(companyId).set({
    name: companyName,
    slug: slugifyCompanyName(companyName),
    ownerEmail: email,
    plan: 'trial',
    seatLimit: COMPANY_PLANS.trial.seatLimit,
    status: 'active',
    trialEndsOn: trialEnds.toISOString().split('T')[0],
    createdAt: SERVER_TS(),
    createdBy: email,
    environment: ENV_NAME
  }).then(function () {
    return T.companyDoc(companyId).collection('users').doc(email).set({
      email: email,
      uid: user.uid,
      name: fullName || email.split('@')[0],
      accessLevel: 'Super Admin',
      designation: 'Administrator',
      departmentName: 'Executive',
      teamName: 'Leadership',
      managerEmail: '',
      status: 'active',
      photoUrl: user.photoURL || '',
      createdAt: SERVER_TS()
    });
  }).then(function () {
    return T.settingsDoc(companyId).set({
      companyName: companyName,
      companyLogoUrl: '',
      valuesStatements: DEFAULT_VALUES_STATEMENTS.slice(),
      updatedAt: SERVER_TS(),
      updatedBy: email
    });
  }).then(function () {
    return T.userIndex(user.uid).set({
      email: email,
      companyId: companyId,
      createdAt: SERVER_TS()
    });
  }).then(function () {
    return companyId;
  });
}

/* ---------------------------------------------------------------------------
 * Tenant resolution
 * -------------------------------------------------------------------------*/

/** Bind an authenticated user to a company, then start the app. */
function bootTenantForUser(user) {
  Session.uid = user.uid;
  Session.email = String(user.email || '').toLowerCase().trim();
  Session.name = user.displayName || Session.email.split('@')[0];
  Session.photoUrl = user.photoURL || '';

  return T.platformAdmin(user.uid).get()
    .catch(function () { return { exists: false }; })
    .then(function (adminSnap) {
      Session.isPlatformAdmin = !!(adminSnap && adminSnap.exists);
      return T.userIndex(user.uid).get();
    })
    .then(function (idxSnap) {
      if (idxSnap.exists && idxSnap.data().companyId) {
        return idxSnap.data().companyId;
      }
      return claimInviteForCurrentUser(user);
    })
    .then(function (companyId) {
      if (!companyId) {
        if (Session.isPlatformAdmin) {
          return renderPlatformCompanyPicker().then(function () { return null; });
        }
        renderOnboardingScreen();
        return null;
      }
      Session.companyId = companyId;
      return loadCompanyContextAndStart();
    })
    .catch(function (error) {
      console.error('Tenant resolution failed:', error);
      setAuthMessage(friendlyAuthError(error), 'error');
      showScreen('authScreen');
    });
}

/** If an administrator invited this email address, join that company. */
function claimInviteForCurrentUser(user) {
  var email = String(user.email || '').toLowerCase().trim();
  if (!email) return Promise.resolve(null);

  return T.invite(email).get()
    .then(function (snap) {
      if (!snap.exists) return null;
      var invite = snap.data() || {};
      if (!invite.companyId) return null;
      if (invite.status === 'revoked') return null;

      var companyId = invite.companyId;
      return T.userIndex(user.uid).set({
        email: email,
        companyId: companyId,
        createdAt: SERVER_TS()
      }).then(function () {
        return T.companyDoc(companyId).collection('users').doc(email).set({
          email: email,
          uid: user.uid,
          name: invite.name || user.displayName || email.split('@')[0],
          accessLevel: invite.role || 'Level 1',
          designation: invite.designation || '',
          departmentName: invite.departmentName || '',
          teamName: invite.teamName || '',
          managerEmail: String(invite.managerEmail || '').toLowerCase().trim(),
          status: 'active',
          joinedAt: SERVER_TS()
        }, { merge: true });
      }).then(function () {
        return T.invite(email).set({
          status: 'accepted',
          acceptedAt: SERVER_TS(),
          acceptedUid: user.uid
        }, { merge: true });
      }).then(function () {
        return companyId;
      });
    })
    .catch(function (error) {
      console.warn('Invite lookup failed:', error);
      return null;
    });
}

/** Load company + settings + my role, then hand over to the dashboard. */
function loadCompanyContextAndStart() {
  return T.companyDoc().get()
    .then(function (companySnap) {
      if (!companySnap.exists) {
        throw new Error('Your company workspace could not be found. Please contact support.');
      }
      Session.company = companySnap.data();
      Session.isCompanyOwner =
        String(Session.company.ownerEmail || '').toLowerCase().trim() === Session.email;
      return T.settingsDoc().get();
    })
    .then(function (settingsSnap) {
      Session.settings = settingsSnap.exists ? settingsSnap.data() : {};
      if (Array.isArray(Session.settings.valuesStatements) && Session.settings.valuesStatements.length) {
        companyValuesStatements = Session.settings.valuesStatements.slice();
      } else {
        companyValuesStatements = DEFAULT_VALUES_STATEMENTS.slice();
      }
      return T.userDoc(Session.email).get();
    })
    .then(function (userSnap) {
      var data = userSnap.exists ? userSnap.data() : null;

      if (data) {
        if (data.status === 'archived') {
          throw new Error('Your access to this workspace has been deactivated. Please contact your administrator.');
        }
        Session.role = data.accessLevel || 'Level 1';
        Session.name = data.name || Session.name;
        Session.photoUrl = data.photoUrl || Session.photoUrl;
      } else if (Session.isPlatformAdmin) {
        Session.role = 'Super Admin';
      } else {
        Session.role = 'Level 1';
      }

      if (Session.isCompanyOwner) Session.role = 'Super Admin';

      currentUser = { email: Session.email, name: Session.name };
      userAccessRole = Session.role;

      if (data) {
        T.userDoc(Session.email).set({
          uid: Session.uid,
          lastLoginAt: SERVER_TS()
        }, { merge: true }).catch(function () { /* non-blocking */ });
      }

      startApplication();
    });
}

/* ---------------------------------------------------------------------------
 * Onboarding (signed in, but not attached to any company)
 * -------------------------------------------------------------------------*/

function renderOnboardingScreen() {
  setText('onboardSignedInAs', Session.email);
  var nameInput = document.getElementById('onboardFullName');
  if (nameInput && !nameInput.value) nameInput.value = Session.name || '';

  /* Company creation is not self-service (enforced in firestore.rules): a
     workspace is provisioned by Perfexio staff and its owner is invited in.
     So unless this build explicitly allows self-signup, show a short
     "no workspace yet" message instead of the create-company form. */
  var canSelfSignup = !!ENV.allowCompanySelfSignup;
  var createBox = document.getElementById('onboardCreateBox');
  if (createBox) createBox.classList.toggle('hidden', !canSelfSignup);
  var noAccessBox = document.getElementById('onboardNoAccessBox');
  if (noAccessBox) noAccessBox.classList.toggle('hidden', canSelfSignup);

  showScreen('onboardingScreen');
}

/* ---------------------------------------------------------------------------
 * Platform admin support access
 * -------------------------------------------------------------------------*/

function renderPlatformCompanyPicker() {
  return T.companies().limit(200).get()
    .then(function (snap) {
      PLATFORM_COMPANY_CACHE = [];
      snap.forEach(function (doc) {
        PLATFORM_COMPANY_CACHE.push({ id: doc.id, data: doc.data() });
      });
      var options = PLATFORM_COMPANY_CACHE.map(function (c) {
        return '<option value="' + esc(c.id) + '">' + esc(c.data.name || c.id) + '  (' + esc(c.id) + ')</option>';
      }).join('');
      setHtml('platformCompanySelect', '<option value="">Select a company workspace...</option>' + options);
      show('platformPickerBox');
      setText('onboardSignedInAs', Session.email);
      showScreen('onboardingScreen');
    })
    .catch(function (error) {
      console.warn('Company list unavailable:', error);
      renderOnboardingScreen();
    });
}

function enterSelectedPlatformCompany() {
  var companyId = getVal('platformCompanySelect');
  if (!companyId) {
    setOnboardMessage('Please select a company workspace to open.', 'error');
    return;
  }
  Session.companyId = companyId;
  setOnboardMessage('Opening workspace...', 'info');
  loadCompanyContextAndStart().catch(function (error) {
    setOnboardMessage(friendlyAuthError(error), 'error');
  });
}

/** Header switcher, available to Perfexio staff only. */
function switchPlatformCompany() {
  var companyId = getVal('headerCompanySwitcher');
  if (!companyId || companyId === Session.companyId) return;
  resetApplicationState();
  Session.companyId = companyId;
  showBusy('Switching workspace...');
  loadCompanyContextAndStart()
    .then(function () { hideBusy(); })
    .catch(function (error) {
      hideBusy();
      showToast(friendlyAuthError(error), 'error');
    });
}

/* ---------------------------------------------------------------------------
 * Platform staff: provision a new client company
 *
 * Company creation is not self-service. A Perfexio staff member (platform
 * admin) creates the workspace here and invites the client as its owner; the
 * client becomes Super Admin when they claim that invite on first sign-in.
 * This mirrors provisionCompany(), except the owner is the client, not the
 * caller, so the caller's own binding is never touched.
 * -------------------------------------------------------------------------*/

/**
 * Turn the free-text "allowed domains" field into a clean list. Accepts
 * commas, spaces, semicolons or newlines; strips a leading "@"; lowercases;
 * keeps only things that look like a domain; de-duplicates.
 */
function parseAllowedDomains(raw) {
  var seen = {};
  var out = [];
  String(raw || '').split(/[\s,;]+/).forEach(function (token) {
    var d = token.toLowerCase().trim().replace(/^@+/, '');
    if (!d || d.indexOf('@') !== -1 || d.indexOf('.') === -1) return;
    if (!seen[d]) { seen[d] = true; out.push(d); }
  });
  return out;
}

/** Open the "new company" modal, reset to a clean state. Staff only. */
function openNewCompanyModal() {
  if (!Session.isPlatformAdmin) {
    showToast('Only Perfexio staff can create a company workspace.', 'error');
    return;
  }
  ['newCompanyName', 'newCompanyOwnerEmail', 'newCompanyOwnerName', 'newCompanyDomains']
    .forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
  var planSel = document.getElementById('newCompanyPlan');
  if (planSel) planSel.value = 'trial';
  setNewCompanyMessage('', null);
  openModal('modal-newCompany');
}

function handleCreateClientCompany(event) {
  if (event) event.preventDefault();

  if (!Session.isPlatformAdmin) {
    setNewCompanyMessage('Only Perfexio staff can create a company workspace.', 'error');
    return;
  }

  var companyName = String(getVal('newCompanyName')).trim();
  var ownerEmail = String(getVal('newCompanyOwnerEmail')).toLowerCase().trim();
  var ownerName = String(getVal('newCompanyOwnerName')).trim();
  var plan = String(getVal('newCompanyPlan')).trim();
  var allowedDomains = parseAllowedDomains(getVal('newCompanyDomains'));

  if (!companyName) {
    setNewCompanyMessage('Please enter the company name.', 'error');
    return;
  }
  if (!ownerEmail || ownerEmail.indexOf('@') === -1) {
    setNewCompanyMessage('Please enter a valid owner email address.', 'error');
    return;
  }
  if (!COMPANY_PLANS[plan]) plan = 'trial';

  /* If a domain allow-list is set, the owner's own address must belong to it,
     otherwise the owner could never sign in to the workspace they own. */
  if (allowedDomains.length) {
    var ownerDomain = ownerEmail.split('@')[1] || '';
    if (allowedDomains.indexOf(ownerDomain) === -1) {
      setNewCompanyMessage('The owner domain "' + ownerDomain + '" is not in the allowed domains list.', 'error');
      return;
    }
  }

  var companyId = slugifyCompanyName(companyName) + '-' + randomSuffix();
  var planDef = COMPANY_PLANS[plan];
  var companyRecord = {
    name: companyName,
    slug: slugifyCompanyName(companyName),
    ownerEmail: ownerEmail,
    plan: plan,
    seatLimit: planDef.seatLimit,
    status: 'active',
    allowedDomains: allowedDomains,
    createdAt: SERVER_TS(),
    createdBy: Session.email,
    createdByPlatformAdmin: true,
    environment: ENV_NAME
  };
  if (planDef.trialDays > 0) {
    var trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + planDef.trialDays);
    companyRecord.trialEndsOn = trialEnds.toISOString().split('T')[0];
  }

  setNewCompanyMessage('Creating workspace...', 'info');

  var batch = newBatch();
  batch.set(T.companyDoc(companyId), companyRecord, { merge: true });
  batch.set(T.settingsDoc(companyId), {
    companyName: companyName,
    companyLogoUrl: '',
    valuesStatements: DEFAULT_VALUES_STATEMENTS.slice(),
    updatedAt: SERVER_TS(),
    updatedBy: Session.email
  }, { merge: true });
  batch.set(T.invite(ownerEmail), {
    email: ownerEmail,
    companyId: companyId,
    companyName: companyName,
    name: ownerName,
    role: 'Super Admin',
    designation: 'Administrator',
    status: 'pending',
    invitedAt: SERVER_TS(),
    invitedBy: Session.email
  }, { merge: true });

  batch.commit().then(function () {
    setNewCompanyMessage('', null);
    closeModal('modal-newCompany');
    ['newCompanyName', 'newCompanyOwnerEmail', 'newCompanyOwnerName', 'newCompanyDomains']
      .forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
      });
    showToast('Workspace "' + companyName + '" created. ' + ownerEmail +
      ' can sign in to claim it as owner.', 'success');

    /* Refresh whichever platform company list is currently on screen. */
    PLATFORM_COMPANY_CACHE = null;
    var pickerBox = document.getElementById('platformPickerBox');
    if (pickerBox && !pickerBox.classList.contains('hidden')) {
      renderPlatformCompanyPicker();
    }
    renderHeaderCompanySwitcher();
  }).catch(function (error) {
    setNewCompanyMessage(friendlyAuthError(error), 'error');
  });
}

/** Inline status line inside the new-company modal. */
function setNewCompanyMessage(message, kind) {
  var box = document.getElementById('newCompanyMessage');
  if (!box) return;
  if (!message) {
    box.classList.add('hidden');
    box.textContent = '';
    return;
  }
  var cls = (kind === 'error')
    ? 'border-rose-300 bg-rose-50 text-rose-700'
    : 'border-indigo-300 bg-indigo-50 text-indigo-700';
  box.className = 'rounded-xl border px-4 py-3 text-xs font-semibold ' + cls;
  box.textContent = message;
  box.classList.remove('hidden');
}

/* ---------------------------------------------------------------------------
 * Sign out
 * -------------------------------------------------------------------------*/

function logoutUser() {
  auth.signOut().then(function () {
    resetApplicationState();
    resetSession();
    var menu = document.getElementById('headerProfileMenu');
    if (menu) menu.classList.add('hidden');
    showScreen('authScreen');
    switchAuthPanel('signin');
  }).catch(function (error) {
    showToast(friendlyAuthError(error), 'error');
  });
}

/* ---------------------------------------------------------------------------
 * Self profile (My Profile Settings)
 * -------------------------------------------------------------------------*/

var pendingSelfPhotoDataUrl = null;

function openSelfProfileModal() {
  var menu = document.getElementById('headerProfileMenu');
  if (menu) menu.classList.add('hidden');
  pendingSelfPhotoDataUrl = null;
  populateUserProfileTab();
  openModal('modal-my-profile');
}

function populateUserProfileTab() {
  T.userDoc(Session.email).get().then(function (snap) {
    var data = snap.exists ? snap.data() : {};
    var el;
    el = document.getElementById('profileFullName'); if (el) el.value = data.name || Session.name || '';
    el = document.getElementById('profilePhone'); if (el) el.value = data.phone || '';
    el = document.getElementById('profileLinkedin'); if (el) el.value = data.linkedinUrl || '';
    el = document.getElementById('profileSkills'); if (el) el.value = data.skills || '';
    el = document.getElementById('profileBio'); if (el) el.value = data.bio || '';

    setText('profileEmailReadonly', Session.email);
    setText('profileRoleReadonly', Session.role);
    setText('profileDesignationReadonly', data.designation || 'Not set');
    setText('profileDepartmentReadonly', data.departmentName || 'Not set');
    setText('profileManagerReadonly', data.managerEmail || 'Not assigned');
    setHtml('profilePhotoPreview', avatarMarkup(data.photoUrl || Session.photoUrl, data.name || Session.email, 'h-20 w-20'));
  }).catch(function (error) {
    showToast(friendlyAuthError(error), 'error');
  });
}

function processProfileImageUpload(input) {
  var file = input && input.files ? input.files[0] : null;
  readImageAsResizedDataUrl(file, 300, function (dataUrl, error) {
    if (error) {
      showToast(error, 'error');
      return;
    }
    pendingSelfPhotoDataUrl = dataUrl;
    setHtml('profilePhotoPreview', avatarMarkup(dataUrl, Session.email, 'h-20 w-20'));
    showToast('Photo ready. Select "Save Profile" to apply it.', 'info');
  });
}

function handleSaveSelfProfile(event) {
  if (event) event.preventDefault();
  var payload = {
    name: String(getVal('profileFullName')).trim(),
    phone: String(getVal('profilePhone')).trim(),
    linkedinUrl: String(getVal('profileLinkedin')).trim(),
    skills: String(getVal('profileSkills')).trim(),
    bio: String(getVal('profileBio')).trim(),
    updatedAt: SERVER_TS()
  };
  if (!payload.name) {
    showToast('Please enter your full name.', 'error');
    return;
  }
  if (pendingSelfPhotoDataUrl) payload.photoUrl = pendingSelfPhotoDataUrl;

  showBusy('Saving your profile...');
  T.userDoc(Session.email).set(payload, { merge: true })
    .then(function () {
      Session.name = payload.name;
      if (payload.photoUrl) Session.photoUrl = payload.photoUrl;
      currentUser = { email: Session.email, name: Session.name };
      if (userMap[Session.email]) {
        userMap[Session.email].name = payload.name;
        if (payload.photoUrl) userMap[Session.email].photoUrl = payload.photoUrl;
      }
      pendingSelfPhotoDataUrl = null;
      updateHeaderProfileDisplay();
      hideBusy();
      closeModal('modal-my-profile');
      showToast('Your profile has been updated.', 'success');
    })
    .catch(function (error) {
      hideBusy();
      showToast(friendlyAuthError(error), 'error');
    });
}

/** Send the signed-in user a password reset email for their own account. */
function requestOwnPasswordReset() {
  auth.sendPasswordResetEmail(Session.email)
    .then(function () {
      showToast('A password reset link has been sent to ' + Session.email + '.', 'success');
    })
    .catch(function (error) {
      showToast(friendlyAuthError(error), 'error');
    });
}

/* ---------------------------------------------------------------------------
 * Auth listener
 * -------------------------------------------------------------------------*/

function startAuthListener() {
  auth.onAuthStateChanged(function (user) {
    if (!user) {
      resetApplicationState();
      resetSession();
      showScreen('authScreen');
      switchAuthPanel('signin');
      AUTH_BOOTSTRAPPED = true;
      return;
    }
    if (AUTH_BOOTSTRAPPED && Session.companyId && Session.uid === user.uid) {
      return; // already running for this user
    }
    AUTH_BOOTSTRAPPED = true;
    showBusy('Loading your workspace...');
    bootTenantForUser(user).then(function () {
      hideBusy();
    }).catch(function () {
      hideBusy();
    });
  });
}
