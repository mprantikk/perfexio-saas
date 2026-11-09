/* ============================================================================
 * Perfexio — Product feedback capture and dashboard
 * ----------------------------------------------------------------------------
 * Feedback is stored per company, so one customer never sees another's notes.
 * The tools are shown only where ENV.showFeedbackTools is enabled.
 * ==========================================================================*/

function resetFeedbackModalFields() {
  var name = document.getElementById('fbTesterName');
  var email = document.getElementById('fbTesterEmail');
  if (name) name.value = (currentUser && currentUser.name) ? currentUser.name : '';
  if (email) email.value = Session.email || '';
  ['fbCommentBug', 'fbCommentFeature', 'fbCommentUI', 'fbCommentGeneral'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['fbRatingBug', 'fbRatingFeature', 'fbRatingUI', 'fbRatingGeneral'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = '5';
  });
}

function handleSubmitStagingFeedback(event) {
  if (event) event.preventDefault();

  var name = String(getVal('fbTesterName')).trim();
  var email = String(getVal('fbTesterEmail')).toLowerCase().trim();

  if (!name || !email) {
    showToast('Please enter your name and email address.', 'error');
    return;
  }

  var feedbackData = {
    testerName: name,
    testerEmail: email,
    bugRating: parseFloat(getVal('fbRatingBug')) || 0,
    bugComment: String(getVal('fbCommentBug')).trim(),
    featureRating: parseFloat(getVal('fbRatingFeature')) || 0,
    featureComment: String(getVal('fbCommentFeature')).trim(),
    uiRating: parseFloat(getVal('fbRatingUI')) || 0,
    uiComment: String(getVal('fbCommentUI')).trim(),
    generalRating: parseFloat(getVal('fbRatingGeneral')) || 0,
    generalComment: String(getVal('fbCommentGeneral')).trim(),
    environment: ENV_NAME,
    submittedByUid: Session.uid || '',
    submittedAt: SERVER_TS()
  };

  T.feedback().add(feedbackData).then(function () {
    showToast('Thank you. Your feedback has been submitted.', 'success');
    resetFeedbackModalFields();
    closeModal('modal-feedback');
  }).catch(function (error) {
    showToast(friendlyAuthError(error), 'error');
  });
}

function loadFeedbackDashboard() {
  if (!Session.companyId) return;

  if (typeof unsubscribeFeedback === 'function') {
    try { unsubscribeFeedback(); } catch (e) { /* already detached */ }
  }

  unsubscribeFeedback = T.feedback().onSnapshot(function (snapshot) {
    allFeedbacksList = [];
    var totalBug = 0;
    var totalFeat = 0;
    var totalUI = 0;
    var totalGen = 0;
    var starCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    snapshot.forEach(function (doc) {
      var data = Object.assign({ id: doc.id }, doc.data());
      allFeedbacksList.push(data);

      totalBug += (parseFloat(data.bugRating) || 0);
      totalFeat += (parseFloat(data.featureRating) || 0);
      totalUI += (parseFloat(data.uiRating) || 0);
      totalGen += (parseFloat(data.generalRating) || 0);

      var roundedGen = Math.round(parseFloat(data.generalRating) || 5);
      if (starCounts[roundedGen] !== undefined) starCounts[roundedGen]++;
    });

    allFeedbacksList.sort(function (a, b) {
      var tA = (a.submittedAt && a.submittedAt.seconds) ? a.submittedAt.seconds : 0;
      var tB = (b.submittedAt && b.submittedAt.seconds) ? b.submittedAt.seconds : 0;
      return tB - tA;
    });

    var totalCount = allFeedbacksList.length;
    setText('fbKpiTotal', String(totalCount));

    var avg = function (sum) {
      return (totalCount > 0 ? (sum / totalCount).toFixed(1) : '0.0') + ' / 5';
    };
    setText('fbKpiBug', avg(totalBug));
    setText('fbKpiFeature', avg(totalFeat));
    setText('fbKpiUI', avg(totalUI));
    setText('fbKpiGeneral', avg(totalGen));

    renderFeedbackTable(allFeedbacksList);
    renderFeedbackCharts(totalCount, totalBug, totalFeat, totalUI, totalGen, starCounts);
  }, function (error) {
    console.error('Feedback listener failed:', error);
    showToast(friendlyAuthError(error), 'error');
  });
}

function renderFeedbackTable(feedbacks) {
  var tbody = document.getElementById('fbReportTableBody');
  if (!tbody) return;

  var query = String(getVal('fbSearchInput')).toLowerCase().trim();
  var filtered = feedbacks.filter(function (f) {
    if (!query) return true;
    return String(f.testerName || '').toLowerCase().indexOf(query) !== -1 ||
      String(f.testerEmail || '').toLowerCase().indexOf(query) !== -1;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">No feedback has been submitted yet.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(function (f) {
    var dateStr = 'Not recorded';
    if (f.submittedAt && f.submittedAt.toDate) {
      var d = f.submittedAt.toDate();
      dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    var notes = '';
    if (f.bugComment) notes += '<div><strong class="text-amber-800">Bug note:</strong> <span class="italic">' + esc(f.bugComment) + '</span></div>';
    if (f.featureComment) notes += '<div><strong class="text-indigo-800">Feature note:</strong> <span class="italic">' + esc(f.featureComment) + '</span></div>';
    if (f.uiComment) notes += '<div><strong class="text-blue-800">Design note:</strong> <span class="italic">' + esc(f.uiComment) + '</span></div>';
    if (f.generalComment) notes += '<div><strong class="text-emerald-800">General note:</strong> <span class="italic">' + esc(f.generalComment) + '</span></div>';
    if (!notes) notes = '<span class="text-slate-400 italic">No notes provided</span>';

    return '<tr class="border-b border-slate-100 hover:bg-slate-50/80">' +
      '<td class="p-3">' +
        '<span class="font-bold text-slate-900 block">' + esc(f.testerName || 'Not provided') + '</span>' +
        '<span class="text-xs text-slate-500 block">' + esc(f.testerEmail || 'Not provided') + '</span>' +
        '<span class="text-[10px] text-slate-400 block mt-0.5">' + esc(dateStr) + '</span>' +
      '</td>' +
      '<td class="p-3 text-center font-bold text-amber-700">' + esc(f.bugRating || 0) + '/5</td>' +
      '<td class="p-3 text-center font-bold text-indigo-700">' + esc(f.featureRating || 0) + '/5</td>' +
      '<td class="p-3 text-center font-bold text-blue-700">' + esc(f.uiRating || 0) + '/5</td>' +
      '<td class="p-3 text-center font-bold text-emerald-700">' + esc(f.generalRating || 0) + '/5</td>' +
      '<td class="p-3 text-xs space-y-1">' + notes + '</td>' +
      '</tr>';
  }).join('');
}

function filterFeedbackTable() {
  renderFeedbackTable(allFeedbacksList);
}

function renderFeedbackCharts(totalCount, totalBug, totalFeat, totalUI, totalGen, starCounts) {
  if (typeof Chart === 'undefined') return;

  chartInstanceFbCategory = destroyChart(chartInstanceFbCategory);
  chartInstanceFbDist = destroyChart(chartInstanceFbDist);

  var mean = function (sum) { return totalCount > 0 ? (sum / totalCount) : 0; };

  var ctxCat = chartContext('chartFbCategories');
  if (ctxCat) {
    chartInstanceFbCategory = new Chart(ctxCat, {
      type: 'bar',
      data: {
        labels: ['Bug reports', 'Feature scope', 'Design', 'Overall experience'],
        datasets: [{
          label: 'Average score out of 5',
          data: [mean(totalBug), mean(totalFeat), mean(totalUI), mean(totalGen)],
          backgroundColor: ['#D97706', '#4F46E5', '#2563EB', '#059669']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { min: 0, max: 5 } }
      }
    });
  }

  var ctxDist = chartContext('chartFbDistribution');
  if (ctxDist) {
    chartInstanceFbDist = new Chart(ctxDist, {
      type: 'doughnut',
      data: {
        labels: ['5 stars', '4 stars', '3 stars', '2 stars', '1 star'],
        datasets: [{
          data: [starCounts[5], starCounts[4], starCounts[3], starCounts[2], starCounts[1]],
          backgroundColor: ['#059669', '#2563EB', '#D97706', '#DC2626', '#991B1B']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }
}

function exportFeedbackCSV() {
  if (allFeedbacksList.length === 0) {
    showToast('There is no feedback to export.', 'error');
    return;
  }
  var rows = [[
    'Submitted at', 'Name', 'Email', 'Bug rating', 'Bug note', 'Feature rating',
    'Feature note', 'Design rating', 'Design note', 'Overall rating', 'General note', 'Environment'
  ]];
  allFeedbacksList.forEach(function (f) {
    rows.push([
      formatDateTime(f.submittedAt), f.testerName || '', f.testerEmail || '',
      f.bugRating || 0, f.bugComment || '', f.featureRating || 0, f.featureComment || '',
      f.uiRating || 0, f.uiComment || '', f.generalRating || 0, f.generalComment || '',
      f.environment || ''
    ]);
  });
  downloadCSV('Perfexio_Product_Feedback.csv', rows);
  showToast('Feedback exported.', 'success');
}
