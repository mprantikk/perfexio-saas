/* ============================================================================
 * Perfexio — Objectives, key results, weighting, and the personal summary
 * ----------------------------------------------------------------------------
 * The scoring maths is a byte-faithful port of the original build:
 *   Goals 50% + Manager sign-off 40% + Culture & Values 10%
 * Records are never hard-deleted; removal sets isDeleted and keeps the history.
 * ==========================================================================*/

/** Live OKR documents only — archived goals stay in the database but hide. */
function liveOkrDocs(snapshot) {
  var out = [];
  snapshot.forEach(function (doc) {
    var data = doc.data() || {};
    if (data.isDeleted === true) return;
    out.push(Object.assign({ okrId: doc.id, id: doc.id }, data));
  });
  return out;
}

function activeCycleObject() {
  return cyclesList.filter(function (c) { return c.id === activeCycleId; })[0] || null;
}

/** True when the signed-in user may still create or edit their own goals. */
function canEditOwnOkrs() {
  var c = activeCycleObject();
  return !!(c && c.isActive && !c.isPublished && !currentUserSignedOff);
}

/** True when the manager may still edit the selected teammate's cycle. */
function canEditTeammate() {
  var c = activeCycleObject();
  return !!(c && c.isActive && !c.isPublished && !currentTeammateSignedOff);
}

function resetOkrModalFields() {
  ['newOkrTitle', 'newOkrDescription', 'newOkrTarget', 'newOkrAchievement',
    'newOkrWeight', 'okrStartDate', 'okrEndDate', 'editingOkrId'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  var el;
  el = document.getElementById('newOkrPeriod'); if (el) el.value = 'Yearly';
  el = document.getElementById('newOkrDirection'); if (el) el.value = 'INCREASE';
  el = document.getElementById('newOkrDataType'); if (el) el.value = 'Percentage';
  el = document.getElementById('targetOkrOwnerEmail'); if (el) el.value = '';
  el = document.getElementById('krContainer'); if (el) el.innerHTML = '';
  krCounter = 0;
}

/* ---------------------------------------------------------------------------
 * Key result rows
 * -------------------------------------------------------------------------*/

function addFullFeaturedKRRow(data) {
  var d = data || {};
  krCounter++;
  var container = document.getElementById('krContainer');
  if (!container) return;
  var div = document.createElement('div');
  div.className = 'p-4 bg-slate-50/80 border border-slate-200 rounded-2xl space-y-3 font-mono text-xs animate-modal-pop';
  div.id = 'kr_' + krCounter;
  div.innerHTML =
    '<div class="flex justify-between items-center border-b border-slate-200/60 pb-2">' +
      '<span class="font-bold text-slate-900 text-xs">Key Result #' + krCounter + '</span>' +
      '<button type="button" onclick="this.parentElement.parentElement.remove()" class="text-red-500 hover:text-red-700 font-bold text-xs">Remove key result</button>' +
    '</div>' +
    '<div><label class="block font-bold mb-1 text-slate-600">Key result title *</label>' +
      '<input type="text" value="' + esc(d.title || '') + '" placeholder="What will be measured" class="kr-title w-full bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none"></div>' +
    '<div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">' +
      '<div><label class="block font-bold mb-1 text-slate-600">Period</label>' +
        '<select class="kr-period w-full bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none">' +
        ['Q1', 'Q2', 'Q3', 'Q4', 'Yearly'].map(function (p) {
          var sel = (d.targetPeriod ? d.targetPeriod === p : p === 'Yearly') ? ' selected' : '';
          return '<option value="' + p + '"' + sel + '>' + p + '</option>';
        }).join('') + '</select></div>' +
      '<div><label class="block font-bold mb-1 text-slate-600">Direction</label>' +
        '<select class="kr-direction w-full bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none">' +
        '<option value="INCREASE"' + (d.direction === 'DECREASE' ? '' : ' selected') + '>Higher is better</option>' +
        '<option value="DECREASE"' + (d.direction === 'DECREASE' ? ' selected' : '') + '>Lower is better</option>' +
        '</select></div>' +
      '<div><label class="block font-bold mb-1 text-slate-600">Data type</label>' +
        '<select class="kr-datatype w-full bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none">' +
        '<option value="Percentage"' + (d.dataType === 'Value' ? '' : ' selected') + '>Percentage</option>' +
        '<option value="Value"' + (d.dataType === 'Value' ? ' selected' : '') + '>Absolute value</option>' +
        '</select></div>' +
    '</div>' +
    '<div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">' +
      '<div><label class="block font-bold mb-1 text-slate-600">Target *</label>' +
        '<input type="number" value="' + esc(d.targetValue === 0 ? 0 : (d.targetValue || '')) + '" placeholder="100" class="kr-target w-full bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none"></div>' +
      '<div><label class="block font-bold mb-1 text-slate-600">Current standing *</label>' +
        '<input type="number" value="' + esc(d.currentValue === 0 ? 0 : (d.currentValue || '0')) + '" placeholder="0" class="kr-achieved w-full bg-white border border-slate-200 rounded-xl p-2.5 font-bold focus:outline-none"></div>' +
      '<div><label class="block font-bold mb-1 text-slate-600">Weight % *</label>' +
        '<input type="number" value="' + esc(d.weight === 0 ? 0 : (d.weight || '')) + '" placeholder="20" class="kr-weight w-full bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none"></div>' +
    '</div>' +
    '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">' +
      '<div><label class="block font-bold mb-1 text-slate-600">Start date</label>' +
        '<input type="date" value="' + esc(d.startDate || '') + '" class="kr-startdate w-full bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none"></div>' +
      '<div><label class="block font-bold mb-1 text-slate-600">End date</label>' +
        '<input type="date" value="' + esc(d.endDate || '') + '" class="kr-enddate w-full bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none"></div>' +
    '</div>';
  container.appendChild(div);
}

/* ---------------------------------------------------------------------------
 * Create / update an objective
 * -------------------------------------------------------------------------*/

function handleCreateOrUpdateOKR(event) {
  if (event) event.preventDefault();

  var targetEmailRaw = getVal('targetOkrOwnerEmail');
  var isForTeammate = !!targetEmailRaw;

  if (isForTeammate ? !canEditTeammate() : !canEditOwnOkrs()) {
    closeModal('modal-okr');
    showToast('This review cycle is locked, so goals can no longer be changed.', 'error');
    return;
  }

  var editingId = getVal('editingOkrId');
  var email = String(targetEmailRaw || (currentUser ? currentUser.email : '')).toLowerCase().trim();
  if (!email) {
    showToast('The goal owner could not be determined. Please try again.', 'error');
    return;
  }

  var title = String(getVal('newOkrTitle')).trim();
  if (!title) {
    showToast('Please enter an objective title.', 'error');
    return;
  }

  var krs = [];
  var rows = document.querySelectorAll('#krContainer > div');
  Array.prototype.forEach.call(rows, function (row) {
    krs.push({
      title: row.querySelector('.kr-title').value,
      targetPeriod: row.querySelector('.kr-period').value,
      direction: row.querySelector('.kr-direction').value,
      dataType: row.querySelector('.kr-datatype').value,
      targetValue: parseFloat(row.querySelector('.kr-target').value) || 0,
      currentValue: parseFloat(row.querySelector('.kr-achieved').value) || 0,
      weight: parseFloat(row.querySelector('.kr-weight').value) || 0,
      startDate: row.querySelector('.kr-startdate').value || '',
      endDate: row.querySelector('.kr-enddate').value || ''
    });
  });

  var weightInputRaw = String(getVal('newOkrWeight')).trim();
  var userCustomWeight = weightInputRaw !== '' ? parseFloat(weightInputRaw) : null;

  T.okrs().where('cycleId', '==', activeCycleId).where('ownerEmail', '==', email).get().then(function (snapshot) {
    var existingDocs = liveOkrDocs(snapshot).filter(function (d) { return d.id !== editingId; });

    var explicitSum = existingDocs.reduce(function (acc, d) {
      var w = parseFloat(d.weight);
      return acc + (!isNaN(w) ? w : 0);
    }, 0);

    var potentialTotal = explicitSum + (userCustomWeight !== null ? userCustomWeight : 0);

    var payload = {
      cycleId: activeCycleId,
      ownerEmail: email,
      title: title,
      description: getVal('newOkrDescription'),
      targetPeriod: getVal('newOkrPeriod'),
      direction: getVal('newOkrDirection'),
      dataType: getVal('newOkrDataType'),
      targetValue: parseFloat(getVal('newOkrTarget')) || 0,
      currentValue: parseFloat(getVal('newOkrAchievement')) || 0,
      weight: userCustomWeight !== null ? userCustomWeight : 0,
      isExcludedFromScoring: false,
      isDeleted: false,
      updateCount: editingId ? FV().increment(1) : 1,
      lastProgressUpdateAt: SERVER_TS(),
      startDate: getVal('okrStartDate'),
      endDate: getVal('okrEndDate'),
      status: 'Pending Approval',
      keyResults: krs,
      updatedBy: Session.email
    };

    if (userCustomWeight !== null && potentialTotal > 100) {
      pendingOkrPayload = { payload: payload, editingId: editingId, email: email };
      setText('weightOverflowMessageText',
        'The combined weight across this person\'s objectives would reach ' + potentialTotal.toFixed(1) +
        '%, which is above 100%. Continue to split the weight equally across all objectives, or go back and set the weights manually.');
      openModal('modal-weight-overflow');
      return;
    }

    executeSaveOKRAndRebalance(payload, editingId, email, userCustomWeight);
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

function executeSaveOKRAndRebalance(payload, editingId, email, userCustomWeight) {
  if (editingId) {
    T.okrs().doc(editingId).set(payload, { merge: true }).then(function () {
      rebalanceOKRWeightsDynamic(email, editingId, userCustomWeight);
      closeModal('modal-okr');
      showToast('Objective updated.', 'success');
    }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
  } else {
    payload.createdAt = SERVER_TS();
    payload.createdBy = Session.email;
    T.okrs().add(payload).then(function (docRef) {
      rebalanceOKRWeightsDynamic(email, docRef.id, userCustomWeight);
      closeModal('modal-okr');
      showToast('Objective created.', 'success');
    }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
  }
}

/**
 * Objectives with an explicit weight keep it; the remaining balance up to 100%
 * is split evenly across the objectives that were left blank.
 */
function rebalanceOKRWeightsDynamic(userEmail, targetOkrId, newCustomWeight) {
  var target = (targetOkrId === undefined) ? null : targetOkrId;
  var custom = (newCustomWeight === undefined) ? null : newCustomWeight;
  if (!activeCycleId || !userEmail) return;

  T.okrs().where('cycleId', '==', activeCycleId).where('ownerEmail', '==', userEmail).get().then(function (snapshot) {
    var docs = liveOkrDocs(snapshot);
    if (docs.length === 0) return;

    var batch = newBatch();

    if (docs.length === 1) {
      var singleWeight = (custom !== null && !isNaN(custom)) ? parseFloat(custom) : 100;
      batch.update(T.okrs().doc(docs[0].id), { weight: singleWeight });
      return batch.commit().then(function () { loadDashboard(); });
    }

    var explicitSum = 0;
    var explicitDocs = [];
    var autoDocs = [];

    docs.forEach(function (d) {
      var isTarget = (d.id === target);
      var docWeight = isTarget ? custom : d.weight;

      if (docWeight !== null && docWeight !== undefined && !isNaN(docWeight) && docWeight > 0) {
        explicitSum += parseFloat(docWeight);
        explicitDocs.push({ id: d.id, weight: parseFloat(docWeight) });
      } else {
        autoDocs.push(d);
      }
    });

    var remainingBalance = Math.max(0, 100 - explicitSum);

    explicitDocs.forEach(function (item) {
      batch.update(T.okrs().doc(item.id), { weight: item.weight });
    });

    if (autoDocs.length > 0) {
      var sharePerAuto = parseFloat((remainingBalance / autoDocs.length).toFixed(2));
      autoDocs.forEach(function (d) {
        batch.update(T.okrs().doc(d.id), { weight: sharePerAuto });
      });
    }

    return batch.commit().then(function () {
      loadDashboard();
      var select = document.getElementById('teamMemberSelect');
      if (select && String(select.value).toLowerCase().trim() === userEmail) {
        loadTeamMemberData();
      }
    });
  }).catch(function (error) { console.warn('Weight rebalance skipped:', error.message); });
}

function handleOverflowApplyEqualSplit() {
  closeModal('modal-weight-overflow');
  if (!pendingOkrPayload) {
    equalSplitWeights();
    saveOKRWeightsBatch();
    return;
  }
  var payload = pendingOkrPayload.payload;
  var editingId = pendingOkrPayload.editingId;
  var email = pendingOkrPayload.email;
  payload.weight = 0;
  executeSaveOKRAndRebalance(payload, editingId, email, null);
  pendingOkrPayload = null;
}

function handleOverflowAdjustManual() {
  closeModal('modal-weight-overflow');
  pendingOkrPayload = null;
  var el = document.getElementById('newOkrWeight');
  if (el) el.focus();
}

/* ---------------------------------------------------------------------------
 * Personal dashboard
 * -------------------------------------------------------------------------*/

function loadDashboard() {
  if (!currentUser || !Session.companyId) return;
  var selector = document.getElementById('cycleSelector');
  activeCycleId = (selector && selector.value) ? selector.value : activeCycleId;
  var email = currentUser.email;

  if (!activeCycleId) {
    currentUserHasOkrs = false;
    currentUserSignedOff = false;
    applyRolePermissions();
    renderOKRs({ okrs: [] });
    resetUserWeightDisplay();
    return;
  }

  if (typeof unsubscribeOkrs === 'function') {
    try { unsubscribeOkrs(); } catch (e) { /* already detached */ }
  }

  unsubscribeOkrs = T.okrs().where('cycleId', '==', activeCycleId).where('ownerEmail', '==', email)
    .onSnapshot(function (snapshot) {
      var okrs = liveOkrDocs(snapshot);
      currentUserHasOkrs = okrs.length > 0;
      if (okrs.length === 0) resetUserWeightDisplay();

      T.valuesEvals().where('cycleId', '==', activeCycleId).where('ownerEmail', '==', email).get().then(function (vSnap) {
        var values = [];
        vSnap.forEach(function (d) {
          var data = d.data() || {};
          if (data.isDeleted !== true) values.push(data);
        });

        return T.ratings().doc(T.ratingId(activeCycleId, email)).get().then(function (rDoc) {
          var ratingDoc = rDoc.exists ? rDoc.data() : null;
          currentUserSignedOff = ratingDoc ? !!ratingDoc.managerSignedOff : false;
          applyRolePermissions();
          renderOKRs({ okrs: okrs });
          renderFinalSummary({ okrs: okrs, values: values, managerRating: ratingDoc });
        });
      }).catch(function (error) { console.warn('Summary load skipped:', error.message); });
    }, function (error) {
      console.error('Goal listener failed:', error);
      showToast(friendlyAuthError(error), 'error');
    });
}

function calculateOkrAchievementPercentage(okr) {
  var targetVal = parseFloat(okr.targetValue) || 0;
  var currentVal = parseFloat(okr.currentValue) || 0;
  if (targetVal === 0) return 0;

  var pct = 0;
  if (okr.direction === 'DECREASE') {
    pct = currentVal > 0 ? (targetVal / currentVal) * 100 : 100;
  } else {
    pct = (currentVal / targetVal) * 100;
  }
  return parseFloat(pct.toFixed(2));
}

/** Shared weighted-score maths for both the personal and teammate summaries. */
function computeScoreBundle(data) {
  var okrs = data.okrs || [];
  var savedValues = data.values || [];
  var managerRatingDoc = data.managerRating || null;

  var totalW = 0;
  var achievedSum = 0;
  okrs.filter(function (o) { return !o.isExcludedFromScoring; }).forEach(function (o) {
    var w = parseFloat(o.weight) || 0;
    var completionPct = calculateOkrAchievementPercentage(o);
    totalW += w;
    achievedSum += (w * (Math.min(100, completionPct) / 100));
  });

  var goalScorePct = totalW > 0 ? ((achievedSum / totalW) * 100).toFixed(2) : '0.00';
  var managerScorePct = (((managerRatingDoc ? parseFloat(managerRatingDoc.overallRating || 0) : 0) / 5) * 100).toFixed(2);

  var totalV = 0;
  var countV = 0;
  savedValues.forEach(function (v) { totalV += (parseFloat(v.appraiserRating) || 0); countV++; });
  var valuesScorePct = countV > 0 ? ((totalV / (countV * 5)) * 100).toFixed(2) : '0.00';

  var finalWeightedPct = ((parseFloat(goalScorePct) * SCORE_WEIGHTS.goals) +
    (parseFloat(managerScorePct) * SCORE_WEIGHTS.manager) +
    (parseFloat(valuesScorePct) * SCORE_WEIGHTS.values)).toFixed(2);

  return {
    goal: goalScorePct,
    manager: managerScorePct,
    values: valuesScorePct,
    final: finalWeightedPct
  };
}

function applyRatingBadge(elementId, finalPct, sizeClasses) {
  var badge = document.getElementById(elementId);
  if (!badge) return;
  var size = sizeClasses || 'px-4 py-1.5';
  var scoreNum = parseFloat(finalPct);
  if (scoreNum >= 90) {
    badge.innerText = 'Exceeds Expectations';
    badge.className = 'inline-block ' + size + ' rounded-full text-xs font-extrabold uppercase bg-emerald-100/80 text-emerald-800 border border-emerald-200';
  } else if (scoreNum >= 70) {
    badge.innerText = 'Meets Expectation';
    badge.className = 'inline-block ' + size + ' rounded-full text-xs font-extrabold uppercase bg-blue-100/80 text-blue-800 border border-blue-200';
  } else {
    badge.innerText = 'Does Not Meet Expectation';
    badge.className = 'inline-block ' + size + ' rounded-full text-xs font-extrabold uppercase bg-red-100/80 text-red-800 border border-red-200';
  }
}

function renderFinalSummary(data) {
  var s = computeScoreBundle(data);
  var managerRatingDoc = data.managerRating || null;

  setText('summaryGoalScore', s.goal + '%');
  setText('summaryGoalScoreFive', formatScoreFive(s.goal) + ' / 5.0');
  setText('summaryManagerScore', s.manager + '%');
  setText('summaryManagerScoreFive', formatScoreFive(s.manager) + ' / 5.0');
  setText('summaryValuesScore', s.values + '%');
  setText('summaryValuesScoreFive', formatScoreFive(s.values) + ' / 5.0');
  setText('overallFinalScore', s.final + '%');
  setText('overallFinalScoreFive', formatScoreFive(s.final) + ' / 5.0');
  applyRatingBadge('overallRatingBadge', s.final, 'px-4 py-1.5');

  setText('summaryQualitativeFeedbackText',
    (managerRatingDoc && managerRatingDoc.feedbackComment)
      ? '"' + managerRatingDoc.feedbackComment + '"'
      : 'No manager feedback has been submitted yet.');

  setText('summaryRecommendationText',
    (managerRatingDoc && managerRatingDoc.recommendation) ? managerRatingDoc.recommendation : 'Pending');
}

/* ---------------------------------------------------------------------------
 * Objective cards
 * -------------------------------------------------------------------------*/

function renderOKRs(data) {
  renderOKRsToElement(data, document.getElementById('okrContainer'), false);
}

function renderOKRsToElement(data, element, isTeamView) {
  if (!element) return;

  if (!data || !data.okrs || data.okrs.length === 0) {
    element.innerHTML = '<div class="p-16 text-center text-slate-400 glass-card rounded-2xl border border-dashed border-slate-200 font-mono text-sm">' +
      'No goals found for this cycle. Use "Add Objective" to create the first one.</div>';
    if (!isTeamView) resetUserWeightDisplay();
    return;
  }

  if (!isTeamView) {
    var totalW = data.okrs.reduce(function (acc, o) { return acc + (parseFloat(o.weight) || 0); }, 0);
    var badge = document.getElementById('totalWeightBadge');
    if (badge) {
      badge.innerText = totalW.toFixed(0) + ' / 100%';
      badge.className = Math.abs(totalW - 100) < 0.1
        ? 'text-xs sm:text-base font-extrabold font-mono text-emerald-600'
        : 'text-xs sm:text-base font-extrabold font-mono text-amber-600';
    }
  }

  var managerOrAbove = isManagerOrAbove();
  var activeCycle = activeCycleObject();
  var isCyclePublished = activeCycle ? !!activeCycle.isPublished : false;
  var isCycleActive = activeCycle ? !!activeCycle.isActive : false;
  var isLockedForMember = isTeamView ? currentTeammateSignedOff : currentUserSignedOff;
  var isFullyLocked = !isCycleActive || isCyclePublished || isLockedForMember;

  element.innerHTML = data.okrs.map(function (okr) {
    var targetVal = parseFloat(okr.targetValue) || 0;
    var currentVal = parseFloat(okr.currentValue) || 0;
    var completionPct = calculateOkrAchievementPercentage(okr);
    var isApproved = okr.status === 'Approved';
    var isExcluded = !!okr.isExcludedFromScoring;

    var lastUpdatedText = 'Not updated yet';
    if (okr.lastProgressUpdateAt && okr.lastProgressUpdateAt.toDate) {
      lastUpdatedText = okr.lastProgressUpdateAt.toDate()
        .toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }
    var updateCountText = okr.updateCount || 0;

    var canApproveThisOkr = false;
    if (managerOrAbove && currentUser) {
      var ownerUser = userMap[okr.ownerEmail];
      var ownerManagerEmail = ownerUser ? String(ownerUser.managerEmail || '').toLowerCase().trim() : '';
      if (okr.ownerEmail !== currentUser.email) {
        canApproveThisOkr = true;
      } else if (!ownerManagerEmail || ownerManagerEmail === 'none') {
        canApproveThisOkr = true;
      }
    }

    var achievementBgClass = 'bg-emerald-50/80 border-emerald-200 text-emerald-900 font-bold';
    if (completionPct < 50) {
      achievementBgClass = 'bg-red-50 border-red-300 text-red-900 font-extrabold shadow-sm';
    } else if (completionPct < 90) {
      achievementBgClass = 'bg-amber-50/80 border-amber-300 text-amber-900 font-bold';
    }

    var actions = '';
    if (isFullyLocked) {
      actions = '<span class="text-xs font-mono text-amber-700 bg-amber-50/80 border border-amber-200 px-3 py-1.5 rounded-lg font-bold">Locked</span>';
    } else if (isTeamView || managerOrAbove) {
      actions =
        (!isApproved && canApproveThisOkr
          ? '<button onclick="updateStatus(\'' + esc(okr.okrId) + '\', \'Approved\')" class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl shadow-sm active:scale-95">Approve</button>'
          : '') +
        '<button onclick="openEditOkrModal(\'' + esc(okr.okrId) + '\')" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 px-3.5 py-2 rounded-xl active:scale-95">Edit</button>' +
        '<button onclick="deleteOkrById(\'' + esc(okr.okrId) + '\')" class="text-xs bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-2 rounded-xl font-bold active:scale-95">Remove</button>';
    } else {
      actions =
        '<button onclick="promptCheckIn(\'' + esc(okr.okrId) + '\', ' + currentVal + ')" class="text-xs bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-xl shadow-sm active:scale-95">Update Progress</button>' +
        (!isApproved
          ? '<button onclick="openEditOkrModal(\'' + esc(okr.okrId) + '\')" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 px-3.5 py-2 rounded-xl active:scale-95">Edit</button>'
          : '');
    }

    var excludeToggle = (isTeamView && managerOrAbove && !isFullyLocked)
      ? '<label class="inline-flex items-center space-x-1.5 cursor-pointer bg-slate-50 border border-slate-200/80 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold hover:bg-slate-100 transition-all">' +
        '<input type="checkbox" ' + (isExcluded ? 'checked' : '') + ' onchange="toggleOkrScoreExclusion(\'' + esc(okr.okrId) + '\', this.checked)" class="rounded border-slate-300 text-slate-900 focus:ring-slate-900">' +
        '<span>Exclude from score</span></label>'
      : '';

    var krBlock = '';
    if (okr.keyResults && okr.keyResults.length > 0) {
      krBlock = '<div class="border-t border-slate-100 pt-3 space-y-1.5 font-mono text-xs">' +
        '<span class="font-bold text-slate-500 uppercase text-xs">Key results (' + okr.keyResults.length + ')</span>' +
        okr.keyResults.map(function (kr) {
          return '<div class="flex flex-col sm:flex-row sm:justify-between bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/60 gap-1">' +
            '<span>' + esc(kr.title) + ' (' + esc(kr.targetPeriod || 'Yearly') + ')</span>' +
            '<span class="font-bold text-[11px] sm:text-xs">Target: ' + esc(kr.targetValue) +
            ' | Latest progress: ' + esc(kr.currentValue || 0) +
            ' | Weight: ' + esc(kr.weight) + '%' +
            (kr.startDate ? ' | Timeline: ' + esc(kr.startDate) + ' to ' + esc(kr.endDate) : '') +
            '</span></div>';
        }).join('') + '</div>';
    }

    return '<div class="glass-card p-5 sm:p-6 rounded-2xl space-y-4 border ' +
      (isExcluded ? 'border-amber-200 bg-amber-50/20' : 'border-slate-200/80') + ' animate-modal-pop">' +
      '<div class="flex flex-col sm:flex-row justify-between items-start sm:items-start gap-3">' +
        '<div><div class="flex flex-wrap items-center gap-1.5 sm:gap-2">' +
          '<span class="text-[10px] sm:text-xs font-mono font-bold uppercase ' +
            (isApproved ? 'bg-emerald-100/80 text-emerald-800' : 'bg-amber-100/80 text-amber-800') +
            ' px-2.5 py-1 rounded-md">' + esc(okr.status || 'Pending Approval') + '</span>' +
          '<span class="text-[10px] sm:text-xs font-mono font-bold uppercase bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md border border-slate-200">Period: ' +
            esc(okr.targetPeriod || 'Yearly') + '</span>' +
          (isExcluded ? '<span class="text-[10px] sm:text-xs font-mono font-bold uppercase bg-amber-100/80 text-amber-900 border border-amber-200 px-2.5 py-1 rounded-md">Excluded from score</span>' : '') +
        '</div>' +
        '<h3 class="text-base sm:text-lg font-bold text-slate-900 mt-2 tracking-tight">' + esc(okr.title) + '</h3>' +
        (okr.description ? '<p class="text-xs text-slate-500 mt-1">' + esc(okr.description) + '</p>' : '') +
        '</div>' +
        '<div class="flex flex-wrap items-center gap-2 self-end sm:self-auto shrink-0">' + excludeToggle + actions + '</div>' +
      '</div>' +
      '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3 text-xs font-mono">' +
        '<div class="bg-slate-50/90 p-2.5 sm:p-3 rounded-xl border border-slate-200/70">' +
          '<span class="block text-[10px] sm:text-xs text-slate-500 uppercase font-bold">Target</span>' +
          '<span class="block text-xs sm:text-base font-extrabold text-slate-900 mt-0.5">' + targetVal + '</span></div>' +
        '<div class="bg-slate-50/90 p-2.5 sm:p-3 rounded-xl border border-slate-200/70">' +
          '<span class="block text-[10px] sm:text-xs text-slate-500 uppercase font-bold">Latest progress</span>' +
          '<span class="block text-xs sm:text-base font-extrabold text-slate-900 mt-0.5">' + currentVal + '</span></div>' +
        '<div class="bg-slate-50/90 p-2.5 sm:p-3 rounded-xl border border-slate-200/70">' +
          '<span class="block text-[10px] sm:text-xs text-slate-500 uppercase font-bold">Weight</span>' +
          '<span class="block text-xs sm:text-base font-extrabold text-slate-900 mt-0.5">' + esc(okr.weight) + '%</span></div>' +
        '<div class="p-2.5 sm:p-3 rounded-xl border ' + achievementBgClass + '">' +
          '<span class="block text-[10px] sm:text-xs uppercase font-bold opacity-80">Achievement</span>' +
          '<span class="block text-xs sm:text-base font-extrabold mt-0.5">' + completionPct + '%</span></div>' +
        '<div class="bg-blue-50/40 p-2.5 sm:p-3 rounded-xl border border-blue-200/70 col-span-2 sm:col-span-1">' +
          '<span class="block text-[10px] sm:text-xs text-blue-600/80 uppercase font-bold">Update activity</span>' +
          '<span class="block text-xs font-bold text-slate-800 mt-0.5">' + esc(lastUpdatedText) + '</span>' +
          '<span class="block text-[10px] sm:text-xs text-blue-700 font-extrabold mt-0.5">Updated ' + esc(updateCountText) + ' times</span></div>' +
      '</div>' + krBlock + '</div>';
  }).join('');
}

/* ---------------------------------------------------------------------------
 * Single-objective actions
 * -------------------------------------------------------------------------*/

function toggleOkrScoreExclusion(okrId, shouldExclude) {
  if (!okrId) return;
  T.okrs().doc(okrId).set({
    isExcludedFromScoring: !!shouldExclude,
    exclusionUpdatedAt: SERVER_TS(),
    exclusionUpdatedBy: Session.email
  }, { merge: true }).then(function () {
    loadTeamMemberData();
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

function openEditOkrModal(okrId) {
  T.okrs().doc(okrId).get().then(function (doc) {
    if (!doc.exists) {
      showToast('That objective could no longer be found.', 'error');
      return;
    }
    var okr = Object.assign({ okrId: doc.id }, doc.data());
    var isOwn = currentUser && String(okr.ownerEmail).toLowerCase().trim() === currentUser.email;

    if (isOwn ? !canEditOwnOkrs() : !canEditTeammate()) {
      showToast('This review cycle is locked, so goals can no longer be edited.', 'error');
      return;
    }

    var set = function (id, value) {
      var el = document.getElementById(id);
      if (el) el.value = value;
    };
    set('editingOkrId', okr.okrId);
    set('targetOkrOwnerEmail', isOwn ? '' : okr.ownerEmail);
    set('newOkrTitle', okr.title || '');
    set('newOkrDescription', okr.description || '');
    set('newOkrPeriod', okr.targetPeriod || 'Yearly');
    set('newOkrDirection', okr.direction || 'INCREASE');
    set('newOkrDataType', okr.dataType || 'Percentage');
    set('newOkrTarget', okr.targetValue || 0);
    set('newOkrAchievement', okr.currentValue || 0);
    set('newOkrWeight', okr.weight || '');
    set('okrStartDate', okr.startDate || '');
    set('okrEndDate', okr.endDate || '');

    var container = document.getElementById('krContainer');
    if (container) container.innerHTML = '';
    krCounter = 0;
    if (okr.keyResults) okr.keyResults.forEach(function (kr) { addFullFeaturedKRRow(kr); });

    openModal('modal-okr', false);
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

/**
 * Removing an objective archives it and rebalances the remaining weights.
 * The document itself is retained so history and audit trails stay intact.
 */
function deleteOkrById(okrId) {
  T.okrs().doc(okrId).get().then(function (doc) {
    if (!doc.exists) return null;
    var okrData = doc.data() || {};
    var isOwn = currentUser && String(okrData.ownerEmail).toLowerCase().trim() === currentUser.email;

    if (isOwn ? !canEditOwnOkrs() : !canEditTeammate()) {
      showToast('This review cycle is locked, so goals can no longer be removed.', 'error');
      return null;
    }
    if (!confirm('Remove the objective "' + (okrData.title || '') + '"? It is archived rather than erased, and remaining weights are rebalanced.')) {
      return null;
    }

    return T.okrs().doc(okrId).set({
      isDeleted: true,
      isExcludedFromScoring: true,
      weight: 0,
      removedAt: SERVER_TS(),
      removedBy: Session.email
    }, { merge: true }).then(function () {
      showToast('Objective removed and weights rebalanced.', 'success');
      if (okrData.ownerEmail) rebalanceOKRWeightsDynamic(okrData.ownerEmail, null, null);
    });
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

function promptCheckIn(okrId, currentValue) {
  if (!canEditOwnOkrs()) {
    showToast('This review cycle is locked, so progress can no longer be updated.', 'error');
    return;
  }
  var val = prompt('Enter the latest progress value:', currentValue);
  if (val === null || String(val).trim() === '') return;
  var parsed = parseFloat(val);
  if (isNaN(parsed)) {
    showToast('Please enter a number for the progress value.', 'error');
    return;
  }
  T.okrs().doc(okrId).set({
    currentValue: parsed,
    lastProgressUpdateAt: SERVER_TS(),
    updateCount: FV().increment(1),
    updatedBy: Session.email
  }, { merge: true }).then(function () {
    showToast('Progress updated.', 'success');
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

function updateStatus(okrId, status) {
  if (!canEditTeammate()) {
    showToast('This review cycle is locked, so approvals are closed.', 'error');
    return;
  }
  T.okrs().doc(okrId).set({
    status: status,
    statusUpdatedAt: SERVER_TS(),
    statusUpdatedBy: Session.email
  }, { merge: true }).then(function () {
    showToast('Objective marked as ' + status + '.', 'success');
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

/* ---------------------------------------------------------------------------
 * Weight manager modal
 * -------------------------------------------------------------------------*/

function openWeightManagerModal() {
  if (!currentUser || !activeCycleId) {
    showToast('Select an active review cycle first.', 'error');
    return;
  }
  T.okrs().where('cycleId', '==', activeCycleId).where('ownerEmail', '==', currentUser.email).get()
    .then(function (snapshot) {
      currentUserOkrsList = liveOkrDocs(snapshot);
      if (currentUserOkrsList.length === 0) {
        showToast('You have no objectives in this cycle yet.', 'error');
        return;
      }
      renderWeightManagerInputs();
      openModal('modal-weight-manager');
    }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

function renderWeightManagerInputs() {
  var container = document.getElementById('weightInputsContainer');
  if (!container) return;
  var sum = 0;

  container.innerHTML = currentUserOkrsList.map(function (okr, index) {
    var w = parseFloat(okr.weight) || 0;
    sum += w;
    return '<div class="flex items-center justify-between bg-slate-50/80 p-3 rounded-xl border border-slate-200/80">' +
      '<div class="w-2/3 pr-2">' +
        '<span class="font-bold text-xs text-slate-900 block truncate">' + esc(okr.title) + '</span>' +
        '<span class="text-[10px] text-slate-500 font-mono">Period: ' + esc(okr.targetPeriod || 'Yearly') + '</span>' +
      '</div>' +
      '<div class="w-1/3 flex items-center space-x-1">' +
        '<input type="number" id="weight_input_' + index + '" value="' + w + '" min="0" max="100" oninput="recalculateModalWeightSum()" class="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-900 focus:outline-none">' +
        '<span class="text-xs font-mono font-bold text-slate-500">%</span>' +
      '</div></div>';
  }).join('');

  paintWeightSumBadge(sum);
}

function paintWeightSumBadge(sum) {
  var badge = document.getElementById('modalWeightSumBadge');
  if (!badge) return;
  badge.innerText = sum.toFixed(1) + ' / 100%';
  badge.className = Math.abs(sum - 100) < 0.1
    ? 'text-xs font-mono font-extrabold text-emerald-600'
    : 'text-xs font-mono font-extrabold text-amber-600';
}

function recalculateModalWeightSum() {
  var sum = 0;
  currentUserOkrsList.forEach(function (_, idx) {
    sum += parseFloat(getVal('weight_input_' + idx)) || 0;
  });
  paintWeightSumBadge(sum);
}

function equalSplitWeights() {
  if (currentUserOkrsList.length === 0) return;
  var equalVal = parseFloat((100 / currentUserOkrsList.length).toFixed(2));
  currentUserOkrsList.forEach(function (_, idx) {
    var elem = document.getElementById('weight_input_' + idx);
    if (elem) elem.value = equalVal;
  });
  recalculateModalWeightSum();
}

function saveOKRWeightsBatch() {
  if (!canEditOwnOkrs()) {
    showToast('This review cycle is locked, so weights can no longer be changed.', 'error');
    return;
  }

  var sum = 0;
  var newWeights = [];
  currentUserOkrsList.forEach(function (okr, idx) {
    var val = parseFloat(getVal('weight_input_' + idx)) || 0;
    sum += val;
    newWeights.push({ id: okr.id, weight: val });
  });

  if (Math.abs(sum - 100) > 0.5) {
    setText('weightOverflowMessageText',
      'The combined weight across your objectives is ' + sum.toFixed(1) +
      '%, and it must equal 100%. Continue to split the weight equally, or go back and adjust it manually.');
    pendingOkrPayload = null;
    openModal('modal-weight-overflow');
    return;
  }

  var batch = newBatch();
  newWeights.forEach(function (item) {
    batch.update(T.okrs().doc(item.id), { weight: item.weight });
  });

  batch.commit().then(function () {
    closeModal('modal-weight-manager');
    loadDashboard();
    showToast('Objective weights saved.', 'success');
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}
