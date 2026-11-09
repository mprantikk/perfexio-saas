/* ============================================================================
 * Perfexio — Team view: manager review, culture & values, final sign-off
 * ----------------------------------------------------------------------------
 * Values evaluations use deterministic document ids
 * ({cycleId}_{email}_{statementIndex}), so saving is an idempotent merge and
 * never requires deleting a previously submitted rating.
 * ==========================================================================*/

function selectedTeammateEmail() {
  return String(getVal('teamMemberSelect')).toLowerCase().trim();
}

function loadTeamMemberData() {
  var selectedEmail = selectedTeammateEmail();
  if (!selectedEmail || !activeCycleId) return;

  show('teamOverallEvalBox');
  show('teamCultureValuesBox');

  var teammate = userMap[selectedEmail] || {};
  setText('teamMemberHeaderName', teammate.name || selectedEmail);
  setText('teamMemberHeaderMeta',
    (teammate.designation || 'Team Member') +
    (teammate.departmentName ? ' — ' + teammate.departmentName : ''));

  if (typeof unsubscribeTeamOkrs === 'function') {
    try { unsubscribeTeamOkrs(); } catch (e) { /* already detached */ }
  }

  unsubscribeTeamOkrs = T.okrs().where('cycleId', '==', activeCycleId).where('ownerEmail', '==', selectedEmail)
    .onSnapshot(function (snapshot) {
      var okrs = liveOkrDocs(snapshot);
      currentTeammatesData = okrs;

      T.valuesEvals().where('cycleId', '==', activeCycleId).where('ownerEmail', '==', selectedEmail).get()
        .then(function (vSnap) {
          var values = [];
          vSnap.forEach(function (d) {
            var data = d.data() || {};
            if (data.isDeleted !== true) values.push(data);
          });

          return T.ratings().doc(T.ratingId(activeCycleId, selectedEmail)).get().then(function (rDoc) {
            var ratingDoc = rDoc.exists ? rDoc.data() : null;
            currentTeammateSignedOff = ratingDoc ? !!ratingDoc.managerSignedOff : false;

            var set = function (id, value) {
              var el = document.getElementById(id);
              if (el) el.value = value;
            };
            set('mgrOverallRatingVal', ratingDoc ? (ratingDoc.overallRating || 3) : 3);
            set('mgrRecommendationVal', ratingDoc ? (ratingDoc.recommendation || 'Increment') : 'Increment');
            set('mgrOverallFeedbackVal', ratingDoc ? (ratingDoc.feedbackComment || '') : '');

            renderOKRsToElement({ okrs: okrs }, document.getElementById('teamMemberContent'), true);

            var teamFinalSummaryBox = document.getElementById('teamFinalSummaryBox');
            if (teamFinalSummaryBox) {
              if (currentTeammateSignedOff) teamFinalSummaryBox.classList.remove('hidden');
              else teamFinalSummaryBox.classList.add('hidden');
            }

            renderTeamCultureValues({ values: values });
            renderTeammateFinalSummary(selectedEmail, { okrs: okrs, values: values, managerRating: ratingDoc });
            applyManagerLockControls();
          });
        }).catch(function (error) { console.warn('Teammate review load skipped:', error.message); });
    }, function (error) {
      console.error('Teammate goal listener failed:', error);
      showToast(friendlyAuthError(error), 'error');
    });
}

function applyManagerLockControls() {
  var isLocked = !canEditTeammate();

  ['mgrOverallRatingVal', 'mgrRecommendationVal', 'mgrOverallFeedbackVal'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.disabled = isLocked;
  });

  ['btnManagerFinalSignoff', 'btnSaveRatingRec', 'btnSaveCultureValues',
    'btnBatchApproveOkrs', 'btnAssignTeamOkr'].forEach(function (id) {
    toggleHidden(id, isLocked);
  });

  toggleHidden('teamLockedNotice', !isLocked);
}

function renderTeammateFinalSummary(email, data) {
  var teammate = userMap[email] || {};
  setText('teamSummaryHeaderName', 'Final performance summary for ' + (teammate.name || email));

  var s = computeScoreBundle(data);

  setText('teamSummaryGoalScore', s.goal + '%');
  setText('teamSummaryGoalScoreFive', formatScoreFive(s.goal) + ' / 5.0');
  setText('teamSummaryManagerScore', s.manager + '%');
  setText('teamSummaryManagerScoreFive', formatScoreFive(s.manager) + ' / 5.0');
  setText('teamSummaryValuesScore', s.values + '%');
  setText('teamSummaryValuesScoreFive', formatScoreFive(s.values) + ' / 5.0');
  setText('teamOverallFinalScore', s.final + '%');
  setText('teamOverallFinalScoreFive', '(' + formatScoreFive(s.final) + ' / 5.0)');
  applyRatingBadge('teamOverallRatingBadge', s.final, 'px-3.5 py-1');
}

/* ---------------------------------------------------------------------------
 * Culture & values
 * -------------------------------------------------------------------------*/

function renderTeamCultureValues(data) {
  var tbody = document.getElementById('teamValuesTableBody');
  if (!tbody) return;
  var savedValues = data.values || [];
  var isLocked = !canEditTeammate();
  var statements = (companyValuesStatements && companyValuesStatements.length)
    ? companyValuesStatements
    : DEFAULT_VALUES_STATEMENTS;

  tbody.innerHTML = statements.map(function (stmt, index) {
    var found = savedValues.filter(function (v) {
      return v.statementTitle === stmt || v.statementIndex === index;
    })[0];
    var rating = found ? found.appraiserRating : '';
    var comment = found ? (found.appraiserComment || '') : '';

    var options = [
      { v: '', label: 'Select a rating' },
      { v: '1', label: '1 — Poor' },
      { v: '2', label: '2 — Needs improvement' },
      { v: '3', label: '3 — Meets expectation' },
      { v: '4', label: '4 — Exceeds expectation' },
      { v: '5', label: '5 — Outstanding' }
    ].map(function (o) {
      var selected = (String(rating) === o.v && o.v !== '') ? ' selected' : '';
      return '<option value="' + o.v + '"' + selected + '>' + o.label + '</option>';
    }).join('');

    return '<tr class="border-b border-slate-100 hover:bg-slate-50/80">' +
      '<td class="p-3.5 text-xs font-medium text-slate-800">' + esc(stmt) + '</td>' +
      '<td class="p-3.5">' +
        '<select ' + (isLocked ? 'disabled' : '') +
        ' class="team-val-rating bg-slate-50 border border-slate-200 p-2 text-xs font-bold w-full rounded-xl focus:outline-none" data-index="' + index +
        '" data-statement="' + esc(stmt) + '">' + options + '</select>' +
      '</td>' +
      '<td class="p-3.5">' +
        '<input ' + (isLocked ? 'disabled' : '') + ' type="text" value="' + esc(comment) +
        '" placeholder="Add a comment" class="team-val-comment bg-slate-50 border border-slate-200 p-2 text-xs w-full rounded-xl focus:outline-none">' +
      '</td></tr>';
  }).join('');
}

function saveTeammateCultureValues() {
  if (!canEditTeammate()) {
    showToast('This review cycle is locked, so values ratings can no longer be saved.', 'error');
    return;
  }
  var selectedEmail = selectedTeammateEmail();
  if (!selectedEmail) {
    showToast('Select a teammate first.', 'error');
    return;
  }

  var batch = newBatch();
  var savedCount = 0;
  var rows = document.querySelectorAll('#teamValuesTableBody tr');

  Array.prototype.forEach.call(rows, function (tr) {
    var select = tr.querySelector('.team-val-rating');
    var commentEl = tr.querySelector('.team-val-comment');
    if (!select) return;

    var index = parseInt(select.getAttribute('data-index'), 10);
    var stmt = select.getAttribute('data-statement');
    var rating = select.value;
    var comment = commentEl ? commentEl.value : '';
    var ref = T.valuesEvals().doc(T.valuesId(activeCycleId, selectedEmail, index));

    if (rating) {
      savedCount++;
      batch.set(ref, {
        cycleId: activeCycleId,
        ownerEmail: selectedEmail,
        statementIndex: index,
        statementTitle: stmt,
        appraiserRating: parseFloat(rating),
        appraiserComment: comment,
        appraiserEmail: Session.email,
        isDeleted: false,
        updatedAt: SERVER_TS()
      }, { merge: true });
    } else {
      /* A cleared rating is withdrawn from scoring, not erased. */
      batch.set(ref, {
        cycleId: activeCycleId,
        ownerEmail: selectedEmail,
        statementIndex: index,
        statementTitle: stmt,
        appraiserComment: comment,
        isDeleted: true,
        withdrawnAt: SERVER_TS()
      }, { merge: true });
    }
  });

  batch.commit().then(function () {
    showToast(savedCount > 0
      ? 'Culture and values ratings saved.'
      : 'Ratings cleared. Nothing is counted towards the values score.', 'success');
    loadTeamMemberData();
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

/* ---------------------------------------------------------------------------
 * Manager rating + sign-off
 * -------------------------------------------------------------------------*/

function submitOverallEmployeeRating() {
  if (!canEditTeammate()) {
    showToast('This review cycle is locked, so the rating can no longer be changed.', 'error');
    return;
  }
  var selectedEmail = selectedTeammateEmail();
  if (!selectedEmail) {
    showToast('Select a teammate first.', 'error');
    return;
  }

  T.ratings().doc(T.ratingId(activeCycleId, selectedEmail)).set({
    cycleId: activeCycleId,
    ownerEmail: selectedEmail,
    overallRating: parseFloat(getVal('mgrOverallRatingVal')) || 0,
    recommendation: getVal('mgrRecommendationVal'),
    feedbackComment: getVal('mgrOverallFeedbackVal'),
    updatedAt: SERVER_TS(),
    updatedBy: Session.email
  }, { merge: true }).then(function () {
    showToast('Rating and recommendation saved as a draft.', 'success');
    loadTeamMemberData();
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

function executeManagerFinalSignoff() {
  if (!canEditTeammate()) {
    showToast('This review cycle is locked, so it can no longer be signed off.', 'error');
    return;
  }
  var selectedEmail = selectedTeammateEmail();
  if (!selectedEmail) {
    showToast('Select a teammate first.', 'error');
    return;
  }
  var teammate = userMap[selectedEmail] || {};
  if (!confirm('Sign off the review for ' + (teammate.name || selectedEmail) +
    '? The review locks for both of you, and only an administrator can reopen it.')) {
    return;
  }

  T.ratings().doc(T.ratingId(activeCycleId, selectedEmail)).set({
    cycleId: activeCycleId,
    ownerEmail: selectedEmail,
    overallRating: parseFloat(getVal('mgrOverallRatingVal')) || 0,
    recommendation: getVal('mgrRecommendationVal'),
    feedbackComment: getVal('mgrOverallFeedbackVal'),
    managerSignedOff: true,
    signedOffAt: SERVER_TS(),
    signedOffBy: Session.email
  }, { merge: true }).then(function () {
    showToast('Review signed off and locked.', 'success');
    loadTeamMemberData();
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

function batchApproveEmployeeOkrs() {
  if (!canEditTeammate()) {
    showToast('This review cycle is locked, so approvals are closed.', 'error');
    return;
  }
  var selectedEmail = selectedTeammateEmail();
  if (!selectedEmail) {
    showToast('Select a teammate first.', 'error');
    return;
  }

  T.okrs().where('cycleId', '==', activeCycleId).where('ownerEmail', '==', selectedEmail).get()
    .then(function (snap) {
      var docs = liveOkrDocs(snap);
      if (docs.length === 0) {
        showToast('This teammate has no objectives to approve.', 'error');
        return null;
      }
      var batch = newBatch();
      docs.forEach(function (d) {
        batch.set(T.okrs().doc(d.id), {
          status: 'Approved',
          statusUpdatedAt: SERVER_TS(),
          statusUpdatedBy: Session.email
        }, { merge: true });
      });
      return batch.commit().then(function () {
        showToast('All ' + docs.length + ' objectives approved.', 'success');
      });
    }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

function openModalForTeamMember() {
  if (!canEditTeammate()) {
    showToast('This review cycle is locked, so goals can no longer be assigned.', 'error');
    return;
  }
  var selectedEmail = selectedTeammateEmail();
  if (!selectedEmail) {
    showToast('Select a teammate first.', 'error');
    return;
  }
  resetOkrModalFields();
  var el = document.getElementById('targetOkrOwnerEmail');
  if (el) el.value = selectedEmail;
  openModal('modal-okr', false);
}
