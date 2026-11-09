/* ============================================================================
 * Perfexio — Admin panel: roster, invitations, CSV import, company branding
 * ----------------------------------------------------------------------------
 * Passwords are never stored in Firestore. People are invited by email address
 * and become active the first time they sign in with that address.
 * Removing a person archives their record; performance history is retained.
 * ==========================================================================*/

/* ---------------------------------------------------------------------------
 * Roster table
 * -------------------------------------------------------------------------*/

function renderUserRosterTable(usersList) {
  var tbody = document.getElementById('userRosterTableBody');
  if (!tbody) return;

  var list = usersList || Object.keys(userMap).map(function (k) { return userMap[k]; });
  var query = String(getVal('rosterSearchInput')).toLowerCase().trim();

  var allManagerEmails = {};
  list.forEach(function (u) {
    var m = String(u.managerEmail || '').toLowerCase().trim();
    if (m) allManagerEmails[m] = true;
  });

  var filtered = list.filter(function (u) {
    if (!query) return true;
    return String(u.name || '').toLowerCase().indexOf(query) !== -1 ||
      String(u.email || '').toLowerCase().indexOf(query) !== -1 ||
      String(u.designation || '').toLowerCase().indexOf(query) !== -1 ||
      String(u.departmentName || '').toLowerCase().indexOf(query) !== -1;
  });

  setText('rosterCountBadge', filtered.length + ' of ' + list.length + ' people');

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-400">No people match this search.</td></tr>';
    return;
  }

  var canManage = isSuperAdmin();

  tbody.innerHTML = filtered.map(function (u) {
    var isManager = !!allManagerEmails[u.email];
    var decidedRole = u.accessLevel === 'Super Admin' ? 'Super Admin' : (isManager ? 'Level 2' : 'Level 1');
    var protectedRow = isProtectedUser(u.email);
    var archived = u.status === 'archived';

    var statusBadge = archived
      ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">Archived</span>'
      : (u.uid
        ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100/80 text-emerald-800 border border-emerald-200">Active</span>'
        : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100/80 text-amber-900 border border-amber-200">Invited</span>');

    var roleCell = protectedRow || !canManage
      ? '<span class="text-xs font-bold text-slate-700">' + esc(decidedRole) + '</span>'
      : '<select onchange="updateUserRoleManual(\'' + esc(u.email) + '\', this.value)" class="bg-slate-50 border border-slate-200 p-1 rounded-lg font-bold text-xs focus:outline-none">' +
        ['Level 1', 'Level 2', 'Super Admin'].map(function (r) {
          var label = r === 'Level 1' ? 'Level 1 (Employee)' : (r === 'Level 2' ? 'Level 2 (Manager)' : 'Super Admin (HR)');
          return '<option value="' + r + '"' + (decidedRole === r ? ' selected' : '') + '>' + label + '</option>';
        }).join('') + '</select>';

    var actions = '<button onclick="openEditUserModal(\'' + esc(u.email) + '\')" class="text-slate-900 font-bold hover:underline">Edit</button>' +
      ' <button onclick="sendPasswordResetForUser(\'' + esc(u.email) + '\')" class="text-blue-600 font-bold hover:underline">Send reset link</button>';
    if (canManage) {
      if (protectedRow) {
        actions += ' <span class="text-slate-400 font-mono text-[10px] uppercase font-bold">Protected</span>';
      } else if (archived) {
        actions += ' <button onclick="restoreUserRecord(\'' + esc(u.email) + '\')" class="text-emerald-600 font-bold hover:underline">Restore</button>';
      } else {
        actions += ' <button onclick="archiveUserRecord(\'' + esc(u.email) + '\')" class="text-red-500 font-bold hover:underline">Archive</button>';
      }
    }

    return '<tr class="border-b border-slate-100 hover:bg-slate-50/80' + (archived ? ' opacity-60' : '') + '">' +
      '<td class="p-3 font-bold text-slate-900">' + esc(u.name || 'Not set') + '<div class="mt-1">' + statusBadge + '</div></td>' +
      '<td class="p-3 text-slate-600">' + esc(u.email) + '</td>' +
      '<td class="p-3 text-slate-600">' + esc(u.designation || 'Not set') + '</td>' +
      '<td class="p-3 text-slate-600">' + esc(u.departmentName || 'Not set') + '</td>' +
      '<td class="p-3 text-slate-600">' + esc(u.teamName || 'General') + '</td>' +
      '<td class="p-3 text-slate-400">' + esc(u.managerEmail || 'None') + '</td>' +
      '<td class="p-3 font-bold">' + roleCell + '</td>' +
      '<td class="p-3 text-right space-x-1 whitespace-nowrap">' + actions + '</td>' +
      '</tr>';
  }).join('');
}

function filterUserRosterTable() {
  renderUserRosterTable(Object.keys(userMap).map(function (k) { return userMap[k]; }));
}

function toggleRosterIncludeArchived() {
  var box = document.getElementById('rosterIncludeArchivedToggle');
  rosterIncludeArchived = box ? !!box.checked : false;
  showToast(rosterIncludeArchived
    ? 'Archived people are now shown in the roster.'
    : 'Archived people are hidden from the roster.', 'info');
  detachRosterAndReload();
}

/** Restart the roster listener so the archived filter takes effect. */
function detachRosterAndReload() {
  if (typeof unsubscribeUsers === 'function') {
    try { unsubscribeUsers(); } catch (e) { /* already detached */ }
  }
  unsubscribeUsers = null;
  T.users().get().then(function (snapshot) {
    userMap = {};
    var usersList = [];
    snapshot.forEach(function (doc) {
      var u = doc.data() || {};
      var em = String(u.email || doc.id).toLowerCase().trim();
      if (!em) return;
      if (!rosterIncludeArchived && u.status === 'archived') return;
      userMap[em] = Object.assign({}, u, { email: em });
      usersList.push(userMap[em]);
    });
    renderUserRosterTable(usersList);
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

/* ---------------------------------------------------------------------------
 * Edit / role / archive
 * -------------------------------------------------------------------------*/

function openEditUserModal(email) {
  var u = userMap[String(email).toLowerCase().trim()];
  if (!u) {
    showToast('That person could not be found in the roster.', 'error');
    return;
  }
  var set = function (id, value) {
    var el = document.getElementById(id);
    if (el) el.value = value;
  };
  set('editUserEmailHidden', u.email);
  set('editUserEmailDisplay', u.email);
  set('editUserName', u.name || '');
  set('editUserDesignation', u.designation || '');
  set('editUserDepartment', u.departmentName || '');
  set('editUserTeamName', u.teamName || '');
  set('editUserManagerEmail', u.managerEmail || '');
  openModal('modal-edit-user');
}

function handleSaveEditedUser(event) {
  if (event) event.preventDefault();
  var email = String(getVal('editUserEmailHidden')).toLowerCase().trim();
  if (!email) return;

  var managerEmail = String(getVal('editUserManagerEmail')).toLowerCase().trim();
  if (managerEmail && managerEmail === email) {
    showToast('A person cannot be their own manager.', 'error');
    return;
  }

  T.userDoc(email).set({
    name: String(getVal('editUserName')).trim(),
    designation: String(getVal('editUserDesignation')).trim(),
    departmentName: String(getVal('editUserDepartment')).trim(),
    teamName: String(getVal('editUserTeamName')).trim(),
    managerEmail: managerEmail,
    updatedAt: SERVER_TS(),
    updatedBy: Session.email
  }, { merge: true }).then(function () {
    showToast('Profile details updated.', 'success');
    closeModal('modal-edit-user');
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

/** Sends a real Firebase password reset email. No password is ever stored. */
function sendPasswordResetForUser(email) {
  var clean = String(email).toLowerCase().trim();
  if (!confirm('Send a password reset link to ' + clean + '?')) return;
  auth.sendPasswordResetEmail(clean).then(function () {
    showToast('A password reset link has been emailed to ' + clean + '.', 'success');
  }).catch(function (error) {
    showToast(friendlyAuthError(error), 'error');
  });
}

function updateUserRoleManual(email, newRole) {
  var clean = String(email).toLowerCase().trim();
  if (!isSuperAdmin()) {
    showToast('Only a Super Admin can change access levels.', 'error');
    return;
  }
  if (isProtectedUser(clean)) {
    showToast('The workspace owner always keeps Super Admin access.', 'error');
    return;
  }
  if (ACCESS_ROLES.indexOf(newRole) === -1) return;

  T.userDoc(clean).set({
    accessLevel: newRole,
    accessLevelUpdatedAt: SERVER_TS(),
    accessLevelUpdatedBy: Session.email
  }, { merge: true }).then(function () {
    showToast('Access level for ' + clean + ' set to ' + newRole + '.', 'success');
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

/**
 * Archiving hides the person from the roster and blocks their access, while
 * keeping every objective, rating and review they were part of.
 */
function archiveUserRecord(email) {
  var clean = String(email).toLowerCase().trim();
  if (!isSuperAdmin()) {
    showToast('Only a Super Admin can archive a person.', 'error');
    return;
  }
  if (isProtectedUser(clean)) {
    showToast('The workspace owner cannot be archived.', 'error');
    return;
  }
  if (clean === Session.email) {
    showToast('You cannot archive your own account.', 'error');
    return;
  }
  var reportees = getDirectReporteeEmails(clean);
  var warning = reportees.length > 0
    ? '\n\nNote: ' + reportees.length + ' people report to this person. Reassign their manager afterwards.'
    : '';
  if (!confirm('Archive ' + clean + '? They lose access immediately, and all of their performance history is kept.' + warning)) return;

  var batch = newBatch();
  batch.set(T.userDoc(clean), {
    status: 'archived',
    archivedAt: SERVER_TS(),
    archivedBy: Session.email
  }, { merge: true });
  batch.set(T.invite(clean), {
    status: 'revoked',
    revokedAt: SERVER_TS(),
    revokedBy: Session.email
  }, { merge: true });

  batch.commit().then(function () {
    showToast(clean + ' has been archived. Their records are retained.', 'success');
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

function restoreUserRecord(email) {
  var clean = String(email).toLowerCase().trim();
  if (!isSuperAdmin()) {
    showToast('Only a Super Admin can restore a person.', 'error');
    return;
  }
  var batch = newBatch();
  batch.set(T.userDoc(clean), {
    status: 'active',
    restoredAt: SERVER_TS(),
    restoredBy: Session.email
  }, { merge: true });
  batch.set(T.invite(clean), {
    companyId: Session.companyId,
    email: clean,
    status: 'pending',
    restoredAt: SERVER_TS()
  }, { merge: true });

  batch.commit().then(function () {
    showToast(clean + ' has been restored and can sign in again.', 'success');
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

/* ---------------------------------------------------------------------------
 * Invite a single person
 * -------------------------------------------------------------------------*/

function handleManualUserCreation(event) {
  if (event) event.preventDefault();
  if (!isSuperAdmin()) {
    showToast('Only a Super Admin can invite people.', 'error');
    return;
  }

  var email = String(getVal('newUserEmail')).toLowerCase().trim();
  var name = String(getVal('newUserName')).trim();
  var designation = String(getVal('newUserDesignation')).trim();
  var departmentName = String(getVal('newUserDepartment')).trim();
  var teamName = String(getVal('newUserTeamName')).trim();
  var managerEmail = String(getVal('newUserManagerEmail')).toLowerCase().trim();

  if (!email || email.indexOf('@') === -1) {
    showToast('Please enter a valid work email address.', 'error');
    return;
  }
  var allowedDomains = (Session.company && Session.company.allowedDomains) || [];
  if (allowedDomains.length) {
    var inviteDomain = email.split('@')[1] || '';
    if (allowedDomains.indexOf(inviteDomain) === -1) {
      showToast('This workspace only accepts email addresses at: ' + allowedDomains.join(', ') + '.', 'error');
      return;
    }
  }
  if (!name) {
    showToast('Please enter the person\'s full name.', 'error');
    return;
  }
  if (managerEmail && managerEmail === email) {
    showToast('A person cannot be their own manager.', 'error');
    return;
  }

  var seatLimit = companySeatLimit();
  if (activeSeatCount() >= seatLimit) {
    showToast('Your plan includes ' + seatLimit + ' seats and they are all in use. Upgrade the plan to invite more people.', 'error');
    return;
  }

  var batch = newBatch();
  batch.set(T.userDoc(email), {
    email: email,
    name: name,
    designation: designation,
    departmentName: departmentName,
    teamName: teamName,
    managerEmail: managerEmail,
    accessLevel: 'Level 1',
    status: 'invited',
    invitedAt: SERVER_TS(),
    invitedBy: Session.email
  }, { merge: true });

  batch.set(T.invite(email), {
    companyId: Session.companyId,
    companyName: (Session.company && Session.company.name) || '',
    email: email,
    name: name,
    role: 'Level 1',
    designation: designation,
    departmentName: departmentName,
    teamName: teamName,
    managerEmail: managerEmail,
    status: 'pending',
    invitedAt: SERVER_TS(),
    invitedBy: Session.email
  }, { merge: true });

  batch.commit().then(function () {
    closeModal('modal-add-user');
    ['newUserEmail', 'newUserName', 'newUserDesignation', 'newUserDepartment',
      'newUserTeamName', 'newUserManagerEmail'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    showToast(name + ' has been invited. They join automatically the first time they sign in with ' + email + '.', 'success');
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

function activeSeatCount() {
  return Object.keys(userMap).filter(function (k) {
    return userMap[k].status !== 'archived';
  }).length;
}

function companySeatLimit() {
  var planKey = (Session.company && Session.company.plan) || 'trial';
  var plan = COMPANY_PLANS[planKey] || COMPANY_PLANS.trial;
  return plan.seatLimit;
}

function renderPlanSummary() {
  var planKey = (Session.company && Session.company.plan) || 'trial';
  var plan = COMPANY_PLANS[planKey] || COMPANY_PLANS.trial;
  setText('planNameBadge', plan.label || planKey);
  setText('planSeatUsage', activeSeatCount() + ' of ' + plan.seatLimit + ' seats in use');
}

/* ---------------------------------------------------------------------------
 * CSV roster import
 * -------------------------------------------------------------------------*/

function downloadSampleCSVFormat() {
  downloadCSV('Perfexio_Roster_Template.csv', [
    ['name', 'email', 'designation', 'departmentName', 'teamName', 'managerEmail'],
    ['Jordan Ellis', 'jordan.ellis@company.com', 'Software Engineer', 'Engineering', 'Platform', 'dana.reed@company.com'],
    ['Dana Reed', 'dana.reed@company.com', 'Engineering Manager', 'Engineering', 'Platform', 'owner@company.com']
  ]);
}

function processUploadedCSV() {
  var fileInput = document.getElementById('csvFileInput');
  if (!fileInput || !fileInput.files.length) {
    showToast('Please choose a CSV file first.', 'error');
    return;
  }

  var reader = new FileReader();
  reader.onload = function (e) {
    var text = String(e.target.result || '');
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
    parsedCsvUsers = [];
    var hasError = false;

    for (var i = 1; i < lines.length; i++) {
      var cols = splitCsvLine(lines[i]);
      if (cols.length >= 6) {
        var userObj = {
          name: cols[0],
          email: String(cols[1]).toLowerCase().trim(),
          designation: cols[2],
          departmentName: cols[3],
          teamName: cols[4],
          managerEmail: String(cols[5]).toLowerCase().trim(),
          isValid: true
        };
        if (!userObj.name || !userObj.email || userObj.email.indexOf('@') === -1 ||
          !userObj.designation || !userObj.departmentName || !userObj.teamName) {
          userObj.isValid = false;
          hasError = true;
        }
        parsedCsvUsers.push(userObj);
      }
    }

    renderCSVPreview();
    if (parsedCsvUsers.length === 0) {
      showToast('No rows could be read. Check that the file uses the template columns.', 'error');
    } else if (hasError) {
      showToast('Some rows are missing required fields. Fix the highlighted rows before importing.', 'error');
    } else {
      showToast(parsedCsvUsers.length + ' rows are ready to import.', 'success');
    }
  };
  reader.onerror = function () {
    showToast('That file could not be read. Please try again.', 'error');
  };
  reader.readAsText(fileInput.files[0]);
}

/** Split one CSV line, honouring quoted fields that contain commas. */
function splitCsvLine(line) {
  var out = [];
  var current = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line.charAt(i);
    if (ch === '"') {
      if (inQuotes && line.charAt(i + 1) === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

function renderCSVPreview() {
  var tbody = document.getElementById('csvPreviewTableBody');
  if (!tbody) return;

  if (parsedCsvUsers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-400">No rows loaded yet.</td></tr>';
    return;
  }

  tbody.innerHTML = parsedCsvUsers.map(function (u, idx) {
    var complete = !!(u.name && u.email && u.designation && u.departmentName && u.teamName);
    var cell = function (field, lowercase) {
      return '<td class="p-1"><input type="text" value="' + esc(u[field]) +
        '" onchange="updateCsvRow(' + idx + ', \'' + field + '\', this.value, ' + (lowercase ? 'true' : 'false') +
        ')" class="w-full bg-slate-50 border border-slate-200 p-1 text-xs rounded-lg focus:outline-none"></td>';
    };
    return '<tr class="border-b border-slate-100' + (complete ? '' : ' bg-red-50/50') + '">' +
      cell('email', true) + cell('name', false) + cell('designation', false) +
      cell('departmentName', false) + cell('teamName', false) + cell('managerEmail', true) +
      '<td class="p-1 text-center font-bold text-xs ' + (complete ? 'text-emerald-600' : 'text-red-600') + '">' +
        (complete ? 'Ready' : 'Incomplete') + '</td>' +
      '<td class="p-1 text-center"><button onclick="removeCsvRow(' + idx +
        ')" class="text-slate-400 hover:text-slate-900 font-bold">Remove</button></td>' +
      '</tr>';
  }).join('');
}

function updateCsvRow(index, field, value, lowercase) {
  if (!parsedCsvUsers[index]) return;
  parsedCsvUsers[index][field] = lowercase ? String(value).toLowerCase().trim() : value;
  renderCSVPreview();
}

function removeCsvRow(index) {
  parsedCsvUsers.splice(index, 1);
  renderCSVPreview();
}

function triggerStartAndNotify() {
  if (!isSuperAdmin()) {
    showToast('Only a Super Admin can import a roster.', 'error');
    return;
  }
  if (parsedCsvUsers.length === 0) {
    showToast('There is no roster data to import.', 'error');
    return;
  }

  var invalidCount = parsedCsvUsers.filter(function (u) {
    return !u.name || !u.email || u.email.indexOf('@') === -1 ||
      !u.designation || !u.departmentName || !u.teamName;
  }).length;

  if (invalidCount > 0) {
    showToast('Cannot import: ' + invalidCount + ' rows are missing required fields.', 'error');
    return;
  }

  var seatLimit = companySeatLimit();
  var projected = activeSeatCount() + parsedCsvUsers.length;
  if (projected > seatLimit) {
    showToast('This import needs ' + projected + ' seats but your plan includes ' + seatLimit +
      '. Upgrade the plan or reduce the file.', 'error');
    return;
  }

  showBusy('Importing roster...');
  var batch = newBatch();
  parsedCsvUsers.forEach(function (u) {
    batch.set(T.userDoc(u.email), {
      email: u.email,
      name: u.name,
      designation: u.designation,
      departmentName: u.departmentName,
      teamName: u.teamName,
      managerEmail: u.managerEmail,
      accessLevel: 'Level 1',
      status: 'invited',
      invitedAt: SERVER_TS(),
      invitedBy: Session.email
    }, { merge: true });

    batch.set(T.invite(u.email), {
      companyId: Session.companyId,
      companyName: (Session.company && Session.company.name) || '',
      email: u.email,
      name: u.name,
      role: 'Level 1',
      designation: u.designation,
      departmentName: u.departmentName,
      teamName: u.teamName,
      managerEmail: u.managerEmail,
      status: 'pending',
      invitedAt: SERVER_TS(),
      invitedBy: Session.email
    }, { merge: true });
  });

  batch.commit().then(function () {
    hideBusy();
    showToast(parsedCsvUsers.length + ' people imported. They join automatically on first sign-in.', 'success');
    parsedCsvUsers = [];
    renderCSVPreview();
    var fileInput = document.getElementById('csvFileInput');
    if (fileInput) fileInput.value = '';
  }).catch(function (error) {
    hideBusy();
    showToast(friendlyAuthError(error), 'error');
  });
}

/* ---------------------------------------------------------------------------
 * Company branding + values statements
 * -------------------------------------------------------------------------*/

function processCompanyLogoUpload(event) {
  var file = event && event.target && event.target.files ? event.target.files[0] : null;
  if (!file) return;

  readImageAsResizedDataUrl(file, 300, function (dataUrl, error) {
    if (error) {
      setText('companyLogoStatusText', error);
      var el = document.getElementById('companyLogoStatusText');
      if (el) el.className = 'text-xs font-mono font-bold text-red-600';
      return;
    }
    T.settingsDoc().set({
      companyLogoUrl: dataUrl,
      logoUpdatedAt: SERVER_TS(),
      logoUpdatedBy: Session.email
    }, { merge: true }).then(function () {
      setText('companyLogoStatusText', 'Company logo updated across the workspace.');
      var el = document.getElementById('companyLogoStatusText');
      if (el) el.className = 'text-xs font-mono font-bold text-emerald-600';
      showToast('Company logo updated.', 'success');
    }).catch(function (err) { showToast(friendlyAuthError(err), 'error'); });
  });
}

function removeCompanyLogo() {
  if (!confirm('Remove the company logo and fall back to the Perfexio mark?')) return;
  T.settingsDoc().set({
    companyLogoUrl: '',
    logoRemovedAt: SERVER_TS(),
    logoRemovedBy: Session.email
  }, { merge: true }).then(function () {
    showToast('Company logo removed.', 'success');
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

function saveCompanyBrandingSettings() {
  var cName = String(getVal('companyNameInput')).trim();
  if (!cName) {
    showToast('Please enter the company name.', 'error');
    return;
  }
  var batch = newBatch();
  batch.set(T.settingsDoc(), {
    companyName: cName,
    updatedAt: SERVER_TS(),
    updatedBy: Session.email
  }, { merge: true });
  batch.set(T.companyDoc(), { name: cName, updatedAt: SERVER_TS() }, { merge: true });

  batch.commit().then(function () {
    if (Session.company) Session.company.name = cName;
    showToast('Company name updated.', 'success');
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

function saveCompanyValuesStatements() {
  var raw = String(getVal('valuesStatementsInput'));
  var statements = raw.split('\n').map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 0; });

  if (statements.length === 0) {
    showToast('Please enter at least one values statement, one per line.', 'error');
    return;
  }
  if (statements.length > 12) {
    showToast('Please keep the list to 12 statements or fewer.', 'error');
    return;
  }

  T.settingsDoc().set({
    valuesStatements: statements,
    valuesUpdatedAt: SERVER_TS(),
    valuesUpdatedBy: Session.email
  }, { merge: true }).then(function () {
    companyValuesStatements = statements.slice();
    showToast('Culture and values statements saved.', 'success');
    if (selectedTeammateEmail()) loadTeamMemberData();
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

function restoreDefaultValuesStatements() {
  var el = document.getElementById('valuesStatementsInput');
  if (el) el.value = DEFAULT_VALUES_STATEMENTS.join('\n');
  showToast('Default statements loaded. Choose Save to apply them.', 'info');
}
