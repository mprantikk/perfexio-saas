/* ============================================================================
 * Perfexio — Review cycles, company roster loading, role permissions
 * ----------------------------------------------------------------------------
 * Ported from the single-file build. Every Firestore path now goes through the
 * tenant helpers in firebase.js, so a request can never read another company.
 * ==========================================================================*/

var unsubscribeUsers = null;
var unsubscribeCycles = null;
var unsubscribeSettings = null;
var unsubscribeOkrs = null;
var unsubscribeTeamOkrs = null;
var unsubscribeFeedback = null;

/** Detach every live listener. Called on sign-out and company switch. */
function detachAllListeners() {
  [unsubscribeUsers, unsubscribeCycles, unsubscribeSettings,
    unsubscribeOkrs, unsubscribeTeamOkrs, unsubscribeFeedback].forEach(function (fn) {
    if (typeof fn === 'function') {
      try { fn(); } catch (e) { /* already detached */ }
    }
  });
  unsubscribeUsers = null;
  unsubscribeCycles = null;
  unsubscribeSettings = null;
  unsubscribeOkrs = null;
  unsubscribeTeamOkrs = null;
  unsubscribeFeedback = null;
}

function resetUserWeightDisplay() {
  var badge = document.getElementById('totalWeightBadge');
  if (badge) {
    badge.innerText = '0 / 100%';
    badge.className = 'text-xs sm:text-base font-extrabold font-mono text-slate-900';
  }
}

/* ---------------------------------------------------------------------------
 * Header display
 * -------------------------------------------------------------------------*/

function updateHeaderProfileDisplay() {
  if (!currentUser) return;
  var u = userMap[currentUser.email] || {};
  var displayName = u.name || currentUser.name || currentUser.email.split('@')[0];
  var displayDesignation = u.designation ||
    (userAccessRole === 'Super Admin' ? 'Super Admin'
      : (userAccessRole === 'Level 2' ? 'Manager' : 'Team Member'));

  setText('headerUserNameDisplay', displayName);
  setText('currentUserEmailDisplay', currentUser.email);
  setText('userDesignationBadge', displayDesignation);
  setText('menuUserName', displayName);
  setText('menuUserEmail', currentUser.email);
  setText('menuDesignationBadge', displayDesignation);

  var photo = u.photoUrl || Session.photoUrl;
  if (photo) {
    setHtml('userAvatarContainer', '<img src="' + esc(photo) + '" alt="" class="w-full h-full object-cover rounded-xl">');
  } else {
    setHtml('userAvatarContainer',
      '<span id="userAvatarText">' + esc(displayName.substring(0, 2).toUpperCase()) + '</span>');
  }
}

/** Company name + logo across the shell, driven by company settings. */
function applyCompanyBranding(settings) {
  var data = settings || Session.settings || {};
  var name = data.companyName || (Session.company ? Session.company.name : '') || 'Your Company';

  setText('headerCompanyNameText', name);
  var nameInput = document.getElementById('companyNameInput');
  if (nameInput) nameInput.value = name;

  /* companyLogoUrl is the current key; logoUrl is accepted for migrated data. */
  var logo = data.companyLogoUrl || data.logoUrl || '';
  if (logo) {
    setHtml('headerLogoContainer',
      '<img src="' + esc(logo) + '" alt="" class="w-full h-full object-cover rounded-xl">');
    setHtml('companyLogoPreview',
      '<img src="' + esc(logo) + '" alt="" class="w-16 h-16 object-cover rounded-xl border border-slate-200">');
  } else {
    // No client logo uploaded — fall back to the Perfexio mark. iconSvg is a
    // trusted constant from env.js (not user input), so it is set directly.
    // currentColor makes the glyph white inside the dark header/preview boxes.
    setHtml('headerLogoContainer', PERFEXIO_BRAND.iconSvg);
    setHtml('companyLogoPreview',
      '<div class="w-16 h-16 rounded-xl bg-slate-900 text-white flex items-center justify-center overflow-hidden">' +
      PERFEXIO_BRAND.iconSvg + '</div>');
  }

  var statementsBox = document.getElementById('valuesStatementsInput');
  if (statementsBox) statementsBox.value = companyValuesStatements.join('\n');
}

/** Keep branding and values statements live for every signed-in user. */
function watchCompanySettings() {
  unsubscribeSettings = T.settingsDoc().onSnapshot(function (doc) {
    Session.settings = doc.exists ? doc.data() : {};
    if (Array.isArray(Session.settings.valuesStatements) && Session.settings.valuesStatements.length) {
      companyValuesStatements = Session.settings.valuesStatements.slice();
    } else {
      companyValuesStatements = DEFAULT_VALUES_STATEMENTS.slice();
    }
    applyCompanyBranding(Session.settings);
  }, function (error) {
    console.warn('Company settings listener stopped:', error);
  });
}

/* ---------------------------------------------------------------------------
 * Role permissions
 * -------------------------------------------------------------------------*/

function applyRolePermissions() {
  if (Session.isCompanyOwner || Session.isPlatformAdmin) {
    userAccessRole = 'Super Admin';
  }

  var isLevel2OrHigher = ['Level 2', 'Admin', 'Super Admin'].indexOf(userAccessRole) !== -1;
  var isAdminOrHigher = ['Admin', 'Super Admin'].indexOf(userAccessRole) !== -1;
  var superAdmin = (userAccessRole === 'Super Admin');

  var activeCycle = cyclesList.filter(function (c) { return c.id === activeCycleId; })[0];
  var isPublished = activeCycle ? !!activeCycle.isPublished : false;
  var hasActiveCycle = !!(activeCycle && activeCycle.isActive);

  var btnAddObj = document.getElementById('btnAddObjective');
  var btnAssignTeammate = document.getElementById('btnAssignTeamOkr');
  var warningBanner = document.getElementById('cyclePublishedWarningBanner');
  var publishBox = document.getElementById('hrCyclePublishControlBox');
  var publishTitle = document.getElementById('publishBoxTitle');
  var publishSub = document.getElementById('publishBoxSubtitle');
  var btnTogglePublish = document.getElementById('btnTogglePublishCycle');

  if (!hasActiveCycle || isPublished || currentUserSignedOff) {
    if (btnAddObj) btnAddObj.classList.add('hidden');
    if (btnAssignTeammate) btnAssignTeammate.classList.add('hidden');
    if (warningBanner) warningBanner.classList.remove('hidden');
  } else {
    if (btnAddObj) btnAddObj.classList.remove('hidden');
    if (btnAssignTeammate) btnAssignTeammate.classList.remove('hidden');
    if (warningBanner) warningBanner.classList.add('hidden');
  }

  if (publishBox && publishTitle && publishSub && btnTogglePublish) {
    if (isPublished) {
      publishBox.className = 'p-5 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border transition-all bg-amber-50/80 border-amber-200';
      publishTitle.innerText = 'Active review cycle is published and locked';
      publishTitle.className = 'text-sm font-extrabold text-amber-900';
      publishSub.innerText = 'Results are visible to employees in their My Final Summary tab. Unpublish to reopen employee actions.';
      publishSub.className = 'text-xs text-amber-800 mt-0.5';
      btnTogglePublish.innerText = 'Unpublish & Reopen Cycle';
      btnTogglePublish.className = 'bg-amber-600 hover:bg-amber-700 text-white font-extrabold px-5 py-2.5 rounded-xl text-xs shadow-md transition-all active:scale-95';
    } else {
      publishBox.className = 'p-5 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border transition-all bg-emerald-50/70 border-emerald-200/80';
      publishTitle.innerText = 'Finalize, close and publish the active review cycle';
      publishTitle.className = 'text-sm font-extrabold text-emerald-900';
      publishSub.innerText = 'Once published, employees gain access to their My Final Summary tab and all cycle edits are locked.';
      publishSub.className = 'text-xs text-emerald-700 mt-0.5';
      btnTogglePublish.innerText = 'Publish Cycle Results';
      btnTogglePublish.className = 'bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-5 py-2.5 rounded-xl text-xs shadow-md transition-all active:scale-95';
    }
  }

  toggleHidden('tab-final-summary', !(isPublished && currentUserHasOkrs));
  toggleHidden('tab-team-view', !isLevel2OrHigher);
  toggleHidden('tab-reports', !isAdminOrHigher);
  toggleHidden('tab-analytics', !isAdminOrHigher);
  toggleHidden('tab-admin-panel', !isAdminOrHigher);
  toggleHidden('btnEditDeadlines', !isAdminOrHigher);
  toggleHidden('companyLogoSettingsBox', !superAdmin);
  toggleHidden('teamAccessSettingsBox', !superAdmin);

  var showFeedbackTools = !!ENV.showFeedbackTools;
  toggleHidden('btnOpenFeedbackForm', !showFeedbackTools);
  toggleHidden('btnOpenFeedbackDash', !(showFeedbackTools && isAdminOrHigher));

  toggleHidden('headerCompanySwitcherBox', !Session.isPlatformAdmin);
  toggleHidden('envBadge', !ENV.showEnvironmentBadge);
  setText('envBadgeText', ENV.label);
}

function toggleHidden(id, shouldHide) {
  var el = document.getElementById(id);
  if (!el) return;
  if (shouldHide) el.classList.add('hidden');
  else el.classList.remove('hidden');
}

/* ---------------------------------------------------------------------------
 * Reporting-line helpers
 * -------------------------------------------------------------------------*/

function getDirectReporteeEmails(managerEmail) {
  var mgr = String(managerEmail || '').toLowerCase().trim();
  return Object.keys(userMap).map(function (k) { return userMap[k]; })
    .filter(function (u) { return String(u.managerEmail || '').toLowerCase().trim() === mgr; })
    .map(function (u) { return String(u.email).toLowerCase().trim(); });
}

function getDeepSubordinateEmails(directEmails) {
  var subordinates = {};
  var queue = directEmails.slice();

  while (queue.length > 0) {
    var currentMgr = queue.shift();
    Object.keys(userMap).forEach(function (key) {
      var u = userMap[key];
      if (String(u.managerEmail || '').toLowerCase().trim() === currentMgr) {
        var subEmail = String(u.email).toLowerCase().trim();
        if (!subordinates[subEmail] && directEmails.indexOf(subEmail) === -1) {
          subordinates[subEmail] = true;
          queue.push(subEmail);
        }
      }
    });
  }
  return Object.keys(subordinates);
}

/**
 * Anyone listed as somebody's manager is promoted to Level 2 automatically.
 * Super Admins, the company owner, and archived accounts are never touched.
 */
function recalculateUserRoles(usersList) {
  var managerEmails = {};
  usersList.forEach(function (u) {
    var m = String(u.managerEmail || '').toLowerCase().trim();
    if (m) managerEmails[m] = true;
  });

  usersList.forEach(function (u) {
    var em = String(u.email).toLowerCase().trim();
    if (isProtectedUser(em)) {
      u.accessLevel = 'Super Admin';
      return;
    }
    if (u.accessLevel === 'Super Admin') return;

    var newRole = managerEmails[em] ? 'Level 2' : 'Level 1';
    if (u.accessLevel !== newRole) {
      u.accessLevel = newRole;
      if (isSuperAdmin()) {
        T.userDoc(em).set({ accessLevel: newRole }, { merge: true })
          .catch(function (error) { console.warn('Role sync skipped for ' + em + ':', error.message); });
      }
    }
  });
}

/* ---------------------------------------------------------------------------
 * Roster + cycle listeners
 * -------------------------------------------------------------------------*/

function fetchCyclesAndUsers() {
  unsubscribeUsers = T.users().onSnapshot(function (snapshot) {
    var select = document.getElementById('teamMemberSelect');
    if (select) select.innerHTML = '<option value="">Select teammate profile...</option>';
    userMap = {};
    var usersList = [];

    snapshot.forEach(function (doc) {
      var u = doc.data() || {};
      var em = String(u.email || doc.id).toLowerCase().trim();
      if (!em) return;
      if (!rosterIncludeArchived && u.status === 'archived') return;
      userMap[em] = Object.assign({}, u, { email: em });
      if (isProtectedUser(em)) userMap[em].accessLevel = 'Super Admin';
      usersList.push(userMap[em]);
    });

    recalculateUserRoles(usersList);

    if (Session.isCompanyOwner || Session.isPlatformAdmin) {
      userAccessRole = 'Super Admin';
    } else if (userMap[Session.email] && userMap[Session.email].accessLevel) {
      userAccessRole = userMap[Session.email].accessLevel;
    }
    Session.role = userAccessRole;

    updateHeaderProfileDisplay();
    populateTeammateSelect(usersList, select);
    renderUserRosterTable(usersList);
    populateManagerDatalist(usersList);
  }, function (error) {
    console.error('Roster listener failed:', error);
    showToast(friendlyAuthError(error), 'error');
  });

  unsubscribeCycles = T.cycles().onSnapshot(function (snapshot) {
    cyclesList = [];
    var select = document.getElementById('cycleSelector');
    if (select) select.innerHTML = '<option value="">No review cycle selected...</option>';

    var foundActive = false;
    snapshot.forEach(function (doc) {
      var c = Object.assign({ id: doc.id }, doc.data());
      if (c.isDeleted === true) return;
      cyclesList.push(c);
      if (c.isActive) { activeCycleId = c.id; foundActive = true; }
      if (select) {
        select.innerHTML += '<option value="' + esc(c.id) + '"' + (c.isActive ? ' selected' : '') + '>' +
          esc(c.name) + ' ' + (c.isActive ? '(Active)' : '(Archived)') +
          (c.isPublished ? ' — Published' : '') + '</option>';
      }
    });

    if (!foundActive) activeCycleId = '';

    renderCycleManagementTable();
    populateWizardLaunchDropdown();
    updateCycleBanner();
    applyRolePermissions();
    loadDashboard();
  }, function (error) {
    console.error('Cycle listener failed:', error);
    showToast(friendlyAuthError(error), 'error');
  });
}

function populateTeammateSelect(usersList, select) {
  if (!select || !currentUser) return;
  var myEmail = currentUser.email;

  if (userAccessRole === 'Super Admin') {
    var optGroup = document.createElement('optgroup');
    optGroup.label = 'All organization profiles';
    usersList.filter(function (u) { return u.email !== myEmail; }).forEach(function (u) {
      optGroup.innerHTML += '<option value="' + esc(u.email) + '">' +
        esc(u.name || u.email) + ' (' + esc(u.email) + ') - ' + esc(u.designation || 'Team Member') + '</option>';
    });
    select.appendChild(optGroup);
    return;
  }

  var directEmails = getDirectReporteeEmails(myEmail);
  var deepEmails = getDeepSubordinateEmails(directEmails);

  if (directEmails.length > 0) {
    var grpDirect = document.createElement('optgroup');
    grpDirect.label = 'Direct reportees (1st layer)';
    directEmails.forEach(function (e) {
      var u = userMap[e];
      if (u) {
        grpDirect.innerHTML += '<option value="' + esc(u.email) + '">' +
          esc(u.name || u.email) + ' (' + esc(u.email) + ') - ' + esc(u.designation || 'Direct Report') + '</option>';
      }
    });
    select.appendChild(grpDirect);
  }

  if (deepEmails.length > 0) {
    var grpDeep = document.createElement('optgroup');
    grpDeep.label = 'Sub-team members (2nd and 3rd layers)';
    deepEmails.forEach(function (e) {
      var u = userMap[e];
      if (u) {
        grpDeep.innerHTML += '<option value="' + esc(u.email) + '">' +
          esc(u.name || u.email) + ' (' + esc(u.email) + ') - ' + esc(u.designation || 'Sub-Team') + '</option>';
      }
    });
    select.appendChild(grpDeep);
  }
}

/** Feeds the manager-email autocomplete used by the add/edit user forms. */
function populateManagerDatalist(usersList) {
  var list = document.getElementById('managerEmailOptions');
  if (!list) return;
  list.innerHTML = usersList.map(function (u) {
    return '<option value="' + esc(u.email) + '">' + esc(u.name || u.email) + '</option>';
  }).join('');
}

function filterTeamMemberDropdown() {
  var query = String(getVal('teamMemberSearchInput')).toLowerCase().trim();
  var select = document.getElementById('teamMemberSelect');
  if (!select) return;
  var options = select.querySelectorAll('option');
  Array.prototype.forEach.call(options, function (opt) {
    if (!opt.value) return;
    opt.style.display = (opt.text.toLowerCase().indexOf(query) !== -1) ? '' : 'none';
  });
}

/* ---------------------------------------------------------------------------
 * Publish / unpublish
 * -------------------------------------------------------------------------*/

function togglePublishActiveCycle(explicitCycleId) {
  var targetId = explicitCycleId || activeCycleId;
  if (!targetId) {
    showToast('No review cycle is selected to publish or unpublish.', 'error');
    return;
  }
  var activeCycle = cyclesList.filter(function (c) { return c.id === targetId; })[0];
  if (!activeCycle) return;

  if (!activeCycle.isPublished) {
    if (!confirm('Finalize, close and publish "' + activeCycle.name + '"? All employee edits will be locked.')) return;
    T.cycles().doc(targetId).set({
      isPublished: true,
      publishedAt: SERVER_TS(),
      publishedBy: Session.email
    }, { merge: true }).then(function () {
      showToast('Review cycle published. Employee summaries are now visible and edits are locked.', 'success');
      applyRolePermissions();
    }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
  } else {
    if (!confirm('Unpublish and reopen "' + activeCycle.name + '"? Employees will be able to edit OKRs and managers can submit ratings again.')) return;
    T.cycles().doc(targetId).set({
      isPublished: false,
      unpublishedAt: SERVER_TS(),
      unpublishedBy: Session.email
    }, { merge: true }).then(function () {
      showToast('Review cycle unpublished and reopened for edits.', 'success');
      applyRolePermissions();
    }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
  }
}

/* ---------------------------------------------------------------------------
 * Cycle management table + wizard
 * -------------------------------------------------------------------------*/

function renderCycleManagementTable() {
  var tbody = document.getElementById('cycleManagementTableBody');
  if (!tbody) return;
  if (cyclesList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">No review cycles have been configured yet.</td></tr>';
    return;
  }
  tbody.innerHTML = cyclesList.map(function (c) {
    return '<tr class="border-b border-slate-100 hover:bg-slate-50/80">' +
      '<td class="p-3 font-bold">' + esc(c.name) + '</td>' +
      '<td class="p-3">' + esc(c.type || 'Yearly') + '</td>' +
      '<td class="p-3"><span class="px-2.5 py-1 rounded-full text-[10px] font-bold ' +
        (c.isActive ? 'bg-emerald-100/80 text-emerald-800' : 'bg-slate-100 text-slate-600') + '">' +
        (c.isActive ? 'Active' : 'Configured / Archived') + (c.isPublished ? ' | Published' : '') +
      '</span></td>' +
      '<td class="p-3 text-right space-x-2 whitespace-nowrap">' +
        '<button onclick="togglePublishActiveCycle(\'' + esc(c.id) + '\')" class="text-[11px] font-bold px-3 py-1 rounded-lg ' +
          (c.isPublished ? 'bg-amber-100/80 text-amber-900 hover:bg-amber-200' : 'bg-emerald-100/80 text-emerald-900 hover:bg-emerald-200') +
          ' active:scale-95">' + (c.isPublished ? 'Unpublish' : 'Publish') + '</button>' +
        (c.isActive
          ? '<button onclick="setCycleActiveStatus(\'' + esc(c.id) + '\', false)" class="bg-amber-100/80 text-amber-900 text-[11px] font-bold px-3 py-1 rounded-lg active:scale-95">Archive</button>'
          : '<button onclick="setCycleActiveStatus(\'' + esc(c.id) + '\', true)" class="bg-emerald-600 text-white text-[11px] font-bold px-3 py-1 rounded-lg active:scale-95">Set Active</button>') +
        '<button onclick="deleteCycleRecord(\'' + esc(c.id) + '\')" class="bg-slate-100 text-slate-600 text-[11px] font-bold px-2.5 py-1 rounded-lg active:scale-95">Remove</button>' +
      '</td></tr>';
  }).join('');
}

function populateWizardLaunchDropdown() {
  var select = document.getElementById('wizardCycleLaunchSelect');
  if (!select) return;
  if (cyclesList.length === 0) {
    select.innerHTML = '<option value="">No review cycle parameters have been created yet...</option>';
    return;
  }
  var sorted = cyclesList.slice().sort(function (a, b) {
    var tA = (a.createdAt && a.createdAt.seconds) ? a.createdAt.seconds : 0;
    var tB = (b.createdAt && b.createdAt.seconds) ? b.createdAt.seconds : 0;
    return tB - tA;
  });
  select.innerHTML = sorted.map(function (c) {
    return '<option value="' + esc(c.id) + '"' + (c.isActive ? ' selected' : '') + '>' +
      esc(c.name) + (c.isActive ? ' [Currently Active]' : '') + (c.isPublished ? ' [Published]' : '') +
      '</option>';
  }).join('');
}

function executeLaunchSelectedCycle() {
  var selectedId = getVal('wizardCycleLaunchSelect');
  if (!selectedId) {
    showToast('Please select a review cycle to launch.', 'error');
    return;
  }
  var selectedCycle = cyclesList.filter(function (c) { return c.id === selectedId; })[0];
  if (!selectedCycle) return;
  if (confirm('Launch review cycle "' + selectedCycle.name + '"? It will become the active cycle across the workspace.')) {
    setCycleActiveStatus(selectedId, true);
  }
}

function setCycleActiveStatus(cycleId, makeActive) {
  if (makeActive) {
    T.cycles().where('isActive', '==', true).get().then(function (snapshot) {
      var batch = newBatch();
      snapshot.forEach(function (doc) { batch.update(doc.ref, { isActive: false }); });
      batch.update(T.cycles().doc(cycleId), { isActive: true, launchedAt: SERVER_TS(), launchedBy: Session.email });
      return batch.commit();
    }).then(function () {
      showToast('Review cycle launched and set as active.', 'success');
    }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
  } else {
    T.cycles().doc(cycleId).set({ isActive: false, archivedAt: SERVER_TS() }, { merge: true })
      .then(function () { showToast('Review cycle archived.', 'success'); })
      .catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
  }
}

/**
 * Removing a cycle hides it from the workspace but keeps every document.
 * Performance history is never destroyed.
 */
function deleteCycleRecord(cycleId) {
  if (!confirm('Remove this review cycle from the workspace? The cycle and all of its performance records are kept in the database and can be restored by support.')) return;
  T.cycles().doc(cycleId).set({
    isDeleted: true,
    isActive: false,
    removedAt: SERVER_TS(),
    removedBy: Session.email
  }, { merge: true }).then(function () {
    showToast('Review cycle removed from the workspace. Its data has been retained.', 'success');
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

function updateCycleBanner() {
  var activeObj = cyclesList.filter(function (c) { return c.id === activeCycleId; })[0];
  var banner = document.getElementById('cycleDeadlineBanner');
  if (!banner) return;

  if (activeObj && activeObj.isActive) {
    banner.classList.remove('hidden');
    setText('bannerOkrDeadline', activeObj.okrCreationDeadline || 'Active');
    setText('bannerApprovalDeadline', activeObj.mgrApprovalDeadline || 'Active');
    setText('bannerReviewDeadline', activeObj.mgrReviewDeadline || 'Active');
    setText('bannerSignoffDeadline', activeObj.mgrSignoffDeadline || 'Active');
    var dot = document.getElementById('bannerPulseDot');
    if (dot) {
      dot.className = activeObj.isPublished
        ? 'w-3 h-3 rounded-full bg-amber-500'
        : 'w-3 h-3 rounded-full bg-emerald-500 animate-pulse';
    }
  } else {
    banner.classList.add('hidden');
  }
}

function openDeadlineModal() {
  var activeObj = cyclesList.filter(function (c) { return c.id === activeCycleId; })[0];
  if (!activeObj) {
    showToast('There is no active review cycle to modify.', 'error');
    return;
  }
  var el;
  el = document.getElementById('editOkrCreationDeadline'); if (el) el.value = activeObj.okrCreationDeadline || '';
  el = document.getElementById('editMgrApprovalDeadline'); if (el) el.value = activeObj.mgrApprovalDeadline || '';
  el = document.getElementById('editMgrReviewDeadline'); if (el) el.value = activeObj.mgrReviewDeadline || '';
  el = document.getElementById('editMgrSignoffDeadline'); if (el) el.value = activeObj.mgrSignoffDeadline || '';
  openModal('modal-deadlines');
}

function saveDeadlineExtension() {
  if (!activeCycleId) {
    showToast('There is no active review cycle to update.', 'error');
    return;
  }
  var deadlines = {
    okrCreationDeadline: getVal('editOkrCreationDeadline'),
    mgrApprovalDeadline: getVal('editMgrApprovalDeadline'),
    mgrReviewDeadline: getVal('editMgrReviewDeadline'),
    mgrSignoffDeadline: getVal('editMgrSignoffDeadline'),
    deadlinesUpdatedAt: SERVER_TS(),
    deadlinesUpdatedBy: Session.email
  };
  T.cycles().doc(activeCycleId).set(deadlines, { merge: true }).then(function () {
    showToast('Cycle deadlines updated.', 'success');
    closeModal('modal-deadlines');
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

function saveConfiguredCycleParameters() {
  var name = String(getVal('wizardCycleName')).trim();
  var type = getVal('wizardCycleType');
  var startDate = getVal('wizardStartDate');
  var endDate = getVal('wizardEndDate');

  if (!name || !startDate || !endDate) {
    showToast('Please enter a cycle name, start date, and end date.', 'error');
    return;
  }

  var config = {
    name: name,
    type: type,
    startDate: startDate,
    endDate: endDate,
    okrCreationDeadline: getVal('wizardOkrCreationDeadline'),
    mgrApprovalDeadline: getVal('wizardMgrApprovalDeadline'),
    mgrReviewDeadline: getVal('wizardMgrReviewDeadline'),
    mgrSignoffDeadline: getVal('wizardMgrSignoffDeadline'),
    requireApproval: !!(document.getElementById('wizardRequireApproval') || {}).checked,
    isActive: false,
    isPublished: false,
    isDeleted: false,
    createdAt: SERVER_TS(),
    createdBy: Session.email
  };

  T.cycles().doc('CYCLE-' + Date.now()).set(config).then(function () {
    showToast('Review cycle "' + name + '" saved. Add eligible users in Step 2, then launch it in Step 3.', 'success');
    var el = document.getElementById('wizardCycleName');
    if (el) el.value = '';
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

/* ---------------------------------------------------------------------------
 * HR unlock of a signed-off manager review
 * -------------------------------------------------------------------------*/

function showHrUnlockSuggestions() {
  var box = document.getElementById('hrUnlockSuggestionsBox');
  if (!box) return;
  var query = String(getVal('hrUnlockSearchInput')).toLowerCase().trim();

  if (!query) {
    box.innerHTML = '';
    box.classList.add('hidden');
    return;
  }

  var matches = Object.keys(userMap).map(function (k) { return userMap[k]; }).filter(function (u) {
    return String(u.name || '').toLowerCase().indexOf(query) !== -1 ||
      String(u.email || '').toLowerCase().indexOf(query) !== -1;
  });

  if (matches.length === 0) {
    box.innerHTML = '<div class="p-3 text-slate-400 italic">No matching users found.</div>';
    box.classList.remove('hidden');
    return;
  }

  box.innerHTML = matches.map(function (u) {
    return '<div onclick="selectHrUnlockUser(\'' + esc(u.email) + '\')" class="p-2.5 hover:bg-amber-50 cursor-pointer flex justify-between items-center transition-all">' +
      '<div><span class="font-bold text-slate-900 block">' + esc(u.name || u.email.split('@')[0]) + '</span>' +
      '<span class="text-[10px] text-slate-500 font-mono">' + esc(u.email) + '</span></div>' +
      '<span class="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">' +
      esc(u.designation || 'Employee') + '</span></div>';
  }).join('');
  box.classList.remove('hidden');
}

function selectHrUnlockUser(email) {
  var el = document.getElementById('hrUnlockSearchInput');
  if (el) el.value = email;
  var box = document.getElementById('hrUnlockSuggestionsBox');
  if (box) box.classList.add('hidden');
  hrUnlockEmployeeReviewSearch();
}

function hrUnlockEmployeeReviewSearch() {
  var query = String(getVal('hrUnlockSearchInput')).toLowerCase().trim();
  if (!query) {
    showToast('Please enter the employee name or email address to unlock a review.', 'error');
    return;
  }
  if (!activeCycleId) {
    showToast('There is no active review cycle.', 'error');
    return;
  }

  var all = Object.keys(userMap).map(function (k) { return userMap[k]; });
  var matchUser = all.filter(function (u) {
    return String(u.email || '').toLowerCase().trim() === query ||
      String(u.name || '').toLowerCase().trim() === query ||
      String(u.name || '').toLowerCase().indexOf(query) !== -1;
  })[0];

  if (!matchUser) {
    showToast('No employee found matching "' + query + '".', 'error');
    return;
  }

  var targetEmail = String(matchUser.email).toLowerCase().trim();
  if (!confirm('Unlock the manager review for ' + (matchUser.name || targetEmail) + ' (' + targetEmail + ')?')) return;

  T.ratings().doc(T.ratingId(activeCycleId, targetEmail)).set({
    cycleId: activeCycleId,
    ownerEmail: targetEmail,
    managerSignedOff: false,
    unlockedByHRAt: SERVER_TS(),
    unlockedByHREmail: Session.email
  }, { merge: true }).then(function () {
    showToast('Manager review unlocked for ' + (matchUser.name || targetEmail) + '.', 'success');
    var el = document.getElementById('hrUnlockSearchInput');
    if (el) el.value = '';
    if (String(getVal('teamMemberSelect')).toLowerCase().trim() === targetEmail) {
      loadTeamMemberData();
    }
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}
