/* ============================================================================
 * Perfexio — Sales demo workspace (demo hosting site only)
 * ----------------------------------------------------------------------------
 * WHY THIS EXISTS
 *   During a pitch you need to show the product from three seats in seconds:
 *   HR Director, Line Manager, Employee. This module renders one-click sign-in
 *   buttons and can build a fully populated sample company on demand.
 *
 * HOW IT STAYS SAFE
 *   - It is rendered only when ENV.showDemoPanel is true, which is only the
 *     demo hosting site. Staging and production never render it.
 *   - Every button runs the real signInWithEmailAndPassword call. There is no
 *     login bypass, no elevated token, and no special security rule.
 *   - All demo data lives under tenants/demo/, so it can never touch a paying
 *     customer's records.
 *
 * HOW THE SEEDER WORKS
 *   1. The HR Director account signs in (it is created on first run).
 *   2. As the owner of "northwind-demo" it provisions the company, exactly the
 *      way a real customer signs up.
 *   3. As a Super Admin it writes the roster, the review cycle, objectives,
 *      manager ratings, values evaluations, and product feedback.
 *   4. The remaining persona accounts are created through a SECOND Firebase app
 *      instance, so the presenter's own session is never signed out. Each one
 *      picks up its invite on first sign-in through the normal join flow.
 *
 * Document IDs are deterministic, so running the seeder again refreshes the
 * workspace in place. Nothing is ever deleted.
 * ==========================================================================*/

var DEMO_SEEDER_APP_NAME = 'perfexio-demo-seeder';

/* ---------------------------------------------------------------------------
 * Panel rendering
 * -------------------------------------------------------------------------*/

/** Called from the auth screen. Does nothing outside the demo site. */
function renderDemoPanel() {
  var box = document.getElementById('demoPanelBox');
  if (!box) return;

  if (!ENV.showDemoPanel) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }

  var buttons = DEMO_PERSONAS.map(function (p) {
    return '' +
      '<button type="button" onclick="demoSignIn(\'' + p.key + '\')" ' +
        'class="group w-full text-left rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 ' +
        'transition-colors px-4 py-3 flex items-center gap-3">' +
        '<span class="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br ' + p.accent + ' ' +
          'flex items-center justify-center text-white text-xs font-extrabold">' +
          esc(initialsFor(p.name)) +
        '</span>' +
        '<span class="min-w-0 flex-1">' +
          '<span class="block text-sm font-bold text-white">' + esc(p.buttonLabel) + '</span>' +
          '<span class="block text-[11px] text-slate-400 truncate">' + esc(p.buttonHint) + '</span>' +
        '</span>' +
        '<span class="text-slate-500 group-hover:text-white transition-colors text-lg leading-none">&rarr;</span>' +
      '</button>';
  }).join('');

  box.innerHTML = '' +
    '<div class="rounded-2xl border border-white/10 bg-white/[0.03] p-5">' +
      '<div class="flex items-center justify-between mb-1">' +
        '<h3 class="text-sm font-extrabold text-white tracking-tight">Explore a live sample company</h3>' +
        '<span class="text-[10px] font-bold uppercase tracking-widest text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded-full px-2 py-0.5">Demo</span>' +
      '</div>' +
      '<p class="text-[11px] text-slate-400 mb-4 leading-relaxed">' +
        'Sign in as any role at ' + esc(DEMO_CONFIG.companyName) + ' to see exactly what that person sees. ' +
        'Sample data only.' +
      '</p>' +
      '<div class="space-y-2">' + buttons + '</div>' +
      '<div id="demoPanelMessage" class="hidden mt-3 rounded-xl border px-3 py-2 text-[11px] font-semibold"></div>' +
      '<button type="button" onclick="openDemoSetupPrompt()" ' +
        'class="mt-4 w-full text-[11px] font-semibold text-slate-500 hover:text-slate-300 transition-colors">' +
        'Workspace not ready? Build the sample data' +
      '</button>' +
    '</div>';

  box.classList.remove('hidden');
}

function setDemoMessage(message, kind) {
  var box = document.getElementById('demoPanelMessage');
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
  box.className = 'mt-3 rounded-xl border px-3 py-2 text-[11px] font-semibold ' + cls;
  box.textContent = message;
  box.classList.remove('hidden');
}

function demoPersonaByKey(key) {
  for (var i = 0; i < DEMO_PERSONAS.length; i++) {
    if (DEMO_PERSONAS[i].key === key) return DEMO_PERSONAS[i];
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * One-click sign-in
 * -------------------------------------------------------------------------*/

function demoSignIn(personaKey) {
  var persona = demoPersonaByKey(personaKey);
  if (!persona) return;

  setDemoMessage('Signing in as ' + persona.name + '...', 'info');
  auth.signInWithEmailAndPassword(persona.email, DEMO_CONFIG.password)
    .then(function () {
      setDemoMessage('', null);
    })
    .catch(function (error) {
      var code = (error && error.code) ? error.code : '';
      if (code === 'auth/user-not-found' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
        setDemoMessage('The sample workspace has not been built on this site yet. Select "Build the sample data" below.', 'error');
        return;
      }
      setDemoMessage(friendlyAuthError(error), 'error');
    });
}

/* ---------------------------------------------------------------------------
 * Seeder
 * -------------------------------------------------------------------------*/

function openDemoSetupPrompt() {
  if (!ENV.showDemoPanel) return;
  if (!confirm('Build the sample company "' + DEMO_CONFIG.companyName + '" on this demo site?\n\n' +
    'This creates the demo accounts and refreshes the sample data. It takes about a minute and affects demo data only.')) {
    return;
  }
  runDemoSeeder();
}

function runDemoSeeder() {
  showBusy('Building the sample workspace...');
  setDemoMessage('Building the sample workspace. Please wait...', 'info');

  ensureDemoOwnerSignedIn()
    .then(function (ownerUser) {
      Session.uid = ownerUser.uid;
      Session.email = String(ownerUser.email).toLowerCase().trim();
      Session.companyId = DEMO_CONFIG.companyId;
      return seedDemoCompanyRecord(ownerUser);
    })
    .then(function () { return seedDemoRosterAndInvites(); })
    .then(function () { return seedDemoCycle(); })
    .then(function () { return seedDemoObjectives(); })
    .then(function () { return seedDemoRatingsAndValues(); })
    .then(function () { return seedDemoFeedback(); })
    .then(function () { return createDemoAuthAccounts(); })
    .then(function () {
      hideBusy();
      setDemoMessage('The sample workspace is ready. Select any role above to sign in.', 'success');
      return bootTenantForUser(auth.currentUser);
    })
    .catch(function (error) {
      hideBusy();
      console.error('Demo seeding failed:', error);
      setDemoMessage('Setup could not finish: ' + friendlyAuthError(error), 'error');
    });
}

/** Sign in the HR Director account, creating it on the very first run. */
function ensureDemoOwnerSignedIn() {
  var owner = demoPersonaByKey('admin');
  return auth.signInWithEmailAndPassword(owner.email, DEMO_CONFIG.password)
    .then(function (cred) { return cred.user; })
    .catch(function (error) {
      var code = (error && error.code) ? error.code : '';
      if (code !== 'auth/user-not-found' && code !== 'auth/invalid-credential' && code !== 'auth/invalid-login-credentials') {
        throw error;
      }
      return auth.createUserWithEmailAndPassword(owner.email, DEMO_CONFIG.password)
        .then(function (cred) {
          return cred.user.updateProfile({ displayName: owner.name }).then(function () { return cred.user; });
        });
    });
}

function seedDemoCompanyRecord(ownerUser) {
  var owner = demoPersonaByKey('admin');
  var email = String(ownerUser.email).toLowerCase().trim();

  return T.companyDoc(DEMO_CONFIG.companyId).set({
    name: DEMO_CONFIG.companyName,
    slug: DEMO_CONFIG.companyId,
    ownerEmail: email,
    plan: 'growth',
    seatLimit: COMPANY_PLANS.growth.seatLimit,
    status: 'active',
    isDemoWorkspace: true,
    createdAt: SERVER_TS(),
    createdBy: email,
    environment: ENV_NAME
  }, { merge: true }).then(function () {
    return T.companyDoc(DEMO_CONFIG.companyId).collection('users').doc(email).set({
      email: email,
      uid: ownerUser.uid,
      name: owner.name,
      accessLevel: 'Super Admin',
      designation: owner.designation,
      departmentName: owner.departmentName,
      teamName: owner.teamName,
      managerEmail: '',
      status: 'active',
      createdAt: SERVER_TS()
    }, { merge: true });
  }).then(function () {
    return T.settingsDoc(DEMO_CONFIG.companyId).set({
      companyName: DEMO_CONFIG.companyName,
      companyLogoUrl: '',
      valuesStatements: DEFAULT_VALUES_STATEMENTS.slice(),
      updatedAt: SERVER_TS(),
      updatedBy: email
    }, { merge: true });
  }).then(function () {
    return T.userIndex(ownerUser.uid).set({
      email: email,
      companyId: DEMO_CONFIG.companyId,
      createdAt: SERVER_TS()
    }, { merge: true });
  });
}

/** Everyone except the owner, who already exists. */
function demoRosterWithoutOwner() {
  var list = [];
  DEMO_PERSONAS.forEach(function (p) {
    if (p.key === 'admin') return;
    list.push(p);
  });
  DEMO_EXTRA_PEOPLE.forEach(function (p) { list.push(p); });
  return list;
}

function seedDemoRosterAndInvites() {
  var batch = newBatch();

  demoRosterWithoutOwner().forEach(function (p) {
    var email = p.email.toLowerCase().trim();

    batch.set(T.companyDoc(DEMO_CONFIG.companyId).collection('users').doc(email), {
      email: email,
      name: p.name,
      accessLevel: p.role,
      designation: p.designation,
      departmentName: p.departmentName,
      teamName: p.teamName,
      managerEmail: String(p.managerEmail || '').toLowerCase().trim(),
      status: 'active',
      createdAt: SERVER_TS()
    }, { merge: true });

    batch.set(T.invite(email), {
      email: email,
      companyId: DEMO_CONFIG.companyId,
      name: p.name,
      role: p.role,
      designation: p.designation,
      departmentName: p.departmentName,
      teamName: p.teamName,
      managerEmail: String(p.managerEmail || '').toLowerCase().trim(),
      status: 'pending',
      invitedAt: SERVER_TS(),
      invitedBy: Session.email
    }, { merge: true });
  });

  return batch.commit();
}

/**
 * The cycle is active but NOT published on purpose. That lets a pitch run the
 * full story live: the employee adds a goal, the manager rates and signs off,
 * then the HR Director publishes and the final score appears.
 */
function seedDemoCycle() {
  var today = new Date();
  var start = new Date(today.getFullYear(), 6, 1);
  var end = new Date(today.getFullYear(), 11, 31);
  var iso = function (d) { return d.toISOString().split('T')[0]; };
  var offset = function (days) {
    var d = new Date(today.getTime());
    d.setDate(d.getDate() + days);
    return iso(d);
  };

  return T.cycles().doc(DEMO_CONFIG.cycleId).set({
    name: DEMO_CONFIG.cycleName,
    type: 'Half Yearly',
    startDate: iso(start),
    endDate: iso(end),
    okrCreationDeadline: offset(14),
    mgrApprovalDeadline: offset(21),
    mgrReviewDeadline: offset(35),
    mgrSignoffDeadline: offset(42),
    requireApproval: true,
    isActive: true,
    isPublished: false,
    isDeleted: false,
    createdAt: SERVER_TS(),
    createdBy: Session.email
  }, { merge: true });
}

/* Objective templates. Weights inside each set add up to 100. */
var DEMO_OBJECTIVE_LIBRARY = {
  'hr.director@demo.perfexio.com': [
    { title: 'Lift company-wide engagement score', unit: 'Score', direction: 'INCREASE', target: 4.5, current: 4.2, weight: 40, period: 'Yearly', status: 'Approved' },
    { title: 'Reduce voluntary attrition', unit: 'Percentage', direction: 'DECREASE', target: 8, current: 9.5, weight: 35, period: 'Yearly', status: 'Approved' },
    { title: 'Complete the leadership development programme', unit: 'Percentage', direction: 'INCREASE', target: 100, current: 70, weight: 25, period: 'Q4', status: 'Approved' }
  ],
  'ops.manager@demo.perfexio.com': [
    { title: 'Improve on-time dispatch rate', unit: 'Percentage', direction: 'INCREASE', target: 98, current: 95.4, weight: 45, period: 'Q3', status: 'Approved' },
    { title: 'Cut average order processing time', unit: 'Number', direction: 'DECREASE', target: 20, current: 24, weight: 30, period: 'Q3', status: 'Approved' },
    { title: 'Certify the team on the new WMS release', unit: 'Percentage', direction: 'INCREASE', target: 100, current: 85, weight: 25, period: 'Q4', status: 'Approved' }
  ],
  'analyst@demo.perfexio.com': [
    { title: 'Publish the weekly fulfilment performance pack', unit: 'Number', direction: 'INCREASE', target: 26, current: 24, weight: 40, period: 'Q3', status: 'Approved' },
    { title: 'Reduce inventory variance', unit: 'Percentage', direction: 'DECREASE', target: 1.5, current: 1.9, weight: 35, period: 'Q3', status: 'Approved' },
    { title: 'Automate the carrier cost reconciliation', unit: 'Percentage', direction: 'INCREASE', target: 100, current: 60, weight: 25, period: 'Q4', status: 'Pending Approval' }
  ],
  'warehouse.lead@demo.perfexio.com': [
    { title: 'Raise picking accuracy', unit: 'Percentage', direction: 'INCREASE', target: 99.5, current: 99.1, weight: 50, period: 'Q3', status: 'Approved' },
    { title: 'Close all outstanding safety actions', unit: 'Number', direction: 'INCREASE', target: 12, current: 12, weight: 50, period: 'Q3', status: 'Approved' }
  ],
  'dispatch.coord@demo.perfexio.com': [
    { title: 'Reduce failed delivery attempts', unit: 'Percentage', direction: 'DECREASE', target: 2, current: 2.6, weight: 55, period: 'Q3', status: 'Approved' },
    { title: 'Onboard two additional regional carriers', unit: 'Number', direction: 'INCREASE', target: 2, current: 1, weight: 45, period: 'Q4', status: 'Approved' }
  ],
  'finance.manager@demo.perfexio.com': [
    { title: 'Shorten the month-end close', unit: 'Number', direction: 'DECREASE', target: 4, current: 5, weight: 45, period: 'Q3', status: 'Approved' },
    { title: 'Deliver the annual budget on schedule', unit: 'Percentage', direction: 'INCREASE', target: 100, current: 90, weight: 30, period: 'Q4', status: 'Approved' },
    { title: 'Reduce unbilled revenue', unit: 'Percentage', direction: 'DECREASE', target: 3, current: 3.4, weight: 25, period: 'Q3', status: 'Approved' }
  ],
  'accountant@demo.perfexio.com': [
    { title: 'Clear the aged receivables backlog', unit: 'Percentage', direction: 'INCREASE', target: 100, current: 82, weight: 60, period: 'Q3', status: 'Approved' },
    { title: 'Pass the internal controls audit', unit: 'Percentage', direction: 'INCREASE', target: 100, current: 100, weight: 40, period: 'Q3', status: 'Approved' }
  ],
  'sales.manager@demo.perfexio.com': [
    { title: 'Grow key account revenue', unit: 'Currency', direction: 'INCREASE', target: 4200000, current: 3960000, weight: 50, period: 'Yearly', status: 'Approved' },
    { title: 'Win five new enterprise logos', unit: 'Number', direction: 'INCREASE', target: 5, current: 4, weight: 30, period: 'Yearly', status: 'Approved' },
    { title: 'Improve proposal win rate', unit: 'Percentage', direction: 'INCREASE', target: 35, current: 31, weight: 20, period: 'Q4', status: 'Approved' }
  ],
  'account.exec@demo.perfexio.com': [
    { title: 'Achieve the personal revenue quota', unit: 'Currency', direction: 'INCREASE', target: 950000, current: 1010000, weight: 60, period: 'Yearly', status: 'Approved' },
    { title: 'Maintain a healthy qualified pipeline', unit: 'Currency', direction: 'INCREASE', target: 2000000, current: 1750000, weight: 40, period: 'Q4', status: 'Approved' }
  ]
};

function demoSlug(email) {
  return String(email).split('@')[0].replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

function seedDemoObjectives() {
  var batch = newBatch();

  Object.keys(DEMO_OBJECTIVE_LIBRARY).forEach(function (email) {
    DEMO_OBJECTIVE_LIBRARY[email].forEach(function (o, i) {
      var docId = 'DEMO-OKR-' + demoSlug(email) + '-' + (i + 1);
      batch.set(T.okrs().doc(docId), {
        cycleId: DEMO_CONFIG.cycleId,
        ownerEmail: email,
        title: o.title,
        description: 'Sample objective used for the product demonstration.',
        targetPeriod: o.period,
        direction: o.direction,
        dataType: o.unit,
        targetValue: o.target,
        currentValue: o.current,
        weight: o.weight,
        isExcludedFromScoring: false,
        isDeleted: false,
        updateCount: 3,
        lastProgressUpdateAt: SERVER_TS(),
        status: o.status,
        keyResults: [],
        createdAt: SERVER_TS(),
        createdBy: Session.email,
        updatedBy: Session.email
      }, { merge: true });
    });
  });

  return batch.commit();
}

/*
 * Ratings and values are filled in for everyone so the reports and charts look
 * real, but the employee persona is deliberately left NOT signed off so the
 * manager persona can demonstrate the sign-off step live.
 */
var DEMO_RATINGS = {
  'ops.manager@demo.perfexio.com': { rating: 4.5, rec: 'Increment + Promotion', signed: true, note: 'Consistently strong delivery and a visible lift in team capability this cycle.' },
  'analyst@demo.perfexio.com': { rating: 4.0, rec: 'Increment', signed: false, note: 'Excellent analytical work. Reporting cadence has become something the whole team relies on.' },
  'warehouse.lead@demo.perfexio.com': { rating: 4.0, rec: 'Increment', signed: true, note: 'Accuracy targets met and every safety action closed ahead of schedule.' },
  'dispatch.coord@demo.perfexio.com': { rating: 3.0, rec: 'No Increment', signed: true, note: 'Solid cycle overall. Carrier onboarding needs to move faster next quarter.' },
  'finance.manager@demo.perfexio.com': { rating: 4.5, rec: 'Increment + Promotion', signed: true, note: 'Close timeline improved materially and the budget process ran without escalation.' },
  'accountant@demo.perfexio.com': { rating: 3.5, rec: 'Increment', signed: true, note: 'Reliable and accurate. Receivables backlog is trending in the right direction.' },
  'sales.manager@demo.perfexio.com': { rating: 4.0, rec: 'Increment', signed: true, note: 'Revenue growth on track with a stronger and better qualified pipeline.' },
  'account.exec@demo.perfexio.com': { rating: 5.0, rec: 'Increment + Promotion', signed: true, note: 'Exceeded quota and set the benchmark for account planning across the team.' }
  /* The HR Director owns the company and sits at the top of the reporting
     line, so nobody rates them. A self-rating would also be refused by the
     security rule that stops a manager from rating their own record. */
};

function seedDemoRatingsAndValues() {
  var batch = newBatch();

  Object.keys(DEMO_RATINGS).forEach(function (email) {
    var r = DEMO_RATINGS[email];

    batch.set(T.ratings().doc(T.ratingId(DEMO_CONFIG.cycleId, email)), {
      cycleId: DEMO_CONFIG.cycleId,
      ownerEmail: email,
      overallRating: r.rating,
      recommendation: r.rec,
      feedbackComment: r.note,
      managerSignedOff: r.signed,
      signedOffAt: r.signed ? SERVER_TS() : null,
      signedOffBy: r.signed ? Session.email : '',
      updatedAt: SERVER_TS(),
      updatedBy: Session.email
    }, { merge: true });

    /* Values ratings cluster around the manager rating so the story is coherent. */
    DEFAULT_VALUES_STATEMENTS.forEach(function (stmt, index) {
      var offsets = [0, 0.5, -0.5, 0, 0.5];
      var value = Math.max(1, Math.min(5, Math.round(r.rating + offsets[index % offsets.length])));
      batch.set(T.valuesEvals().doc(T.valuesId(DEMO_CONFIG.cycleId, email, index)), {
        cycleId: DEMO_CONFIG.cycleId,
        ownerEmail: email,
        statementIndex: index,
        statementTitle: stmt,
        appraiserRating: value,
        appraiserComment: '',
        appraiserEmail: Session.email,
        isDeleted: false,
        updatedAt: SERVER_TS()
      }, { merge: true });
    });
  });

  return batch.commit();
}

var DEMO_FEEDBACK_ENTRIES = [
  { testerName: 'Amelia Hart', testerEmail: 'hr.director@demo.perfexio.com', bugRating: 5, bugComment: '', featureRating: 5, featureComment: 'The weight rebalancing across objectives saves a great deal of manual work.', uiRating: 5, uiComment: 'Clean and easy to present to the leadership team.', generalRating: 5, generalComment: 'Replaced three separate spreadsheets for us.' },
  { testerName: 'Daniel Reyes', testerEmail: 'ops.manager@demo.perfexio.com', bugRating: 4, bugComment: 'Nothing blocking so far.', featureRating: 5, featureComment: 'Batch approval for the whole team is the feature I use most.', uiRating: 4, uiComment: 'The team view is clear at a glance.', generalRating: 5, generalComment: 'Review season went from two weeks to two days.' },
  { testerName: 'Priya Nair', testerEmail: 'analyst@demo.perfexio.com', bugRating: 5, bugComment: '', featureRating: 4, featureComment: 'Would like a reminder before the check-in deadline.', uiRating: 5, uiComment: 'Progress bars make it obvious where I stand.', generalRating: 4, generalComment: 'I finally understand how my score is calculated.' },
  { testerName: 'Ethan Cole', testerEmail: 'finance.manager@demo.perfexio.com', bugRating: 4, bugComment: '', featureRating: 4, featureComment: 'CSV export lands in a shape our finance model can read directly.', uiRating: 4, uiComment: '', generalRating: 4, generalComment: 'Straightforward to roll out across the department.' }
];

function seedDemoFeedback() {
  var batch = newBatch();
  DEMO_FEEDBACK_ENTRIES.forEach(function (f, i) {
    var entry = Object.assign({}, f, {
      environment: ENV_NAME,
      // The feedback create rule authorises on submittedByUid == request.auth.uid,
      // so this MUST be the writer's own uid. The seeder runs as the HR Director
      // (Session.uid is set at the top of runDemoSeeder), so stamp that here.
      // testerName / testerEmail remain free-text display fields, exactly as the
      // real feedback form treats them — they are not used for authorisation.
      submittedByUid: Session.uid,
      submittedAt: SERVER_TS()
    });
    batch.set(T.feedback().doc('DEMO-FEEDBACK-' + (i + 1)), entry, { merge: true });
  });
  return batch.commit();
}

/**
 * Create the remaining sign-in accounts on a second Firebase app instance, so
 * the presenter's own session is never replaced part-way through setup.
 * Accounts that already exist are left exactly as they are.
 */
function createDemoAuthAccounts() {
  var people = demoRosterWithoutOwner();
  var secondary;

  try {
    secondary = firebase.app(DEMO_SEEDER_APP_NAME);
  } catch (e) {
    secondary = firebase.initializeApp(FIREBASE_CONFIG, DEMO_SEEDER_APP_NAME);
  }

  var secondaryAuth = secondary.auth();

  var chain = Promise.resolve();
  people.forEach(function (p) {
    chain = chain.then(function () {
      return secondaryAuth.createUserWithEmailAndPassword(p.email, DEMO_CONFIG.password)
        .then(function (cred) {
          return cred.user.updateProfile({ displayName: p.name });
        })
        .catch(function (error) {
          var code = (error && error.code) ? error.code : '';
          if (code === 'auth/email-already-in-use') return null; /* already created */
          console.warn('Demo account skipped for ' + p.email + ':', code || error);
          return null;
        });
    });
  });

  return chain
    .then(function () { return secondaryAuth.signOut(); })
    .then(function () { return secondary.delete(); })
    .catch(function (error) {
      console.warn('Demo account cleanup issue:', error);
      return null;
    });
}

/* ---------------------------------------------------------------------------
 * In-app demo controls
 * -------------------------------------------------------------------------*/

/** Header chip shown inside the app while a demo workspace is open. */
function renderDemoSessionBar() {
  var bar = document.getElementById('demoSessionBar');
  if (!bar) return;
  var isDemo = ENV.showDemoPanel && Session.companyId === DEMO_CONFIG.companyId;
  bar.classList.toggle('hidden', !isDemo);
  if (!isDemo) return;

  setHtml('demoSessionBarText',
    'Sample workspace &mdash; signed in as <strong>' + esc(Session.name || Session.email) +
    '</strong> (' + esc(Session.role) + '). Nothing here is real customer data.');
}

/** Sign out and return to the persona buttons, ready for the next role. */
function switchDemoRole() {
  auth.signOut().then(function () {
    resetApplicationState();
    resetSession();
    showScreen('authScreen');
    switchAuthPanel('signin');
    renderDemoPanel();
    setDemoMessage('Select the next role to continue the walkthrough.', 'info');
  }).catch(function (error) {
    showToast(friendlyAuthError(error), 'error');
  });
}

/** Restore the sample data to its starting state after a pitch. */
function resetDemoWorkspace() {
  if (!ENV.showDemoPanel || Session.companyId !== DEMO_CONFIG.companyId) return;
  if (!isSuperAdmin()) {
    showToast('Only the HR Director role can reset the sample workspace.', 'error');
    return;
  }
  if (!confirm('Reset the sample workspace back to its starting state?\n\n' +
    'Objectives, ratings, and the review cycle are restored to the values they had before the walkthrough. ' +
    'Nothing is deleted.')) {
    return;
  }

  showBusy('Resetting the sample workspace...');
  seedDemoCycle()
    .then(function () { return seedDemoObjectives(); })
    .then(function () { return seedDemoRatingsAndValues(); })
    .then(function () { return seedDemoFeedback(); })
    .then(function () {
      hideBusy();
      showToast('The sample workspace has been reset.', 'success');
      loadDashboard();
    })
    .catch(function (error) {
      hideBusy();
      showToast(friendlyAuthError(error), 'error');
    });
}
