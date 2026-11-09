/* ============================================================================
 * Perfexio — Reports, analytics charts, and CSV exports
 * ----------------------------------------------------------------------------
 * Visibility mirrors the reporting line: a Super Admin sees the whole company,
 * a manager sees themselves plus every layer beneath them.
 * ==========================================================================*/

var lastReportRows = [];
var lastReportUserAgg = {};
var lastDeptSummaryRows = [];
var lastAtRiskRows = [];

function destroyChart(instance) {
  if (instance && typeof instance.destroy === 'function') {
    try { instance.destroy(); } catch (e) { /* already destroyed */ }
  }
  return null;
}

function loadReports() {
  if (!activeCycleId) {
    setHtml('okrReportTableBody', '<tr><td colspan="11" class="p-4 text-center text-slate-400">Select an active review cycle to see reports.</td></tr>');
    setHtml('userReportTableBody', '<tr><td colspan="9" class="p-4 text-center text-slate-400">Select an active review cycle to see reports.</td></tr>');
    renderLeadershipSummary([], { ratingBuckets: [0, 0, 0, 0, 0], avgRating: 0, signedOff: 0, ratingsCount: 0 });
    renderAnalyticsCharts({ okrStats: [], ratingBuckets: [0, 0, 0, 0, 0], signedOff: 0, ratingsCount: 0, peopleCount: 0 });
    return;
  }

  T.okrs().where('cycleId', '==', activeCycleId).get().then(function (snapshot) {
    var okrStats = [];
    snapshot.forEach(function (doc) {
      var o = doc.data() || {};
      if (o.isDeleted === true) return;
      var owner = String(o.ownerEmail || '').toLowerCase().trim();
      var meta = userMap[owner] || {
        name: owner.split('@')[0],
        managerEmail: 'Not set',
        teamName: 'General',
        departmentName: 'Not set'
      };
      okrStats.push({
        userName: meta.name || owner,
        owner: owner,
        managerEmail: meta.managerEmail || 'Not set',
        teamName: meta.teamName || 'General',
        departmentName: meta.departmentName || 'Not set',
        period: o.targetPeriod || 'Yearly',
        title: o.title || '',
        weight: o.weight || 0,
        target: parseFloat(o.targetValue) || 0,
        achievement: parseFloat(o.currentValue) || 0,
        achievementPct: calculateOkrAchievementPercentage(o),
        status: o.status || 'Pending Approval',
        excluded: !!o.isExcludedFromScoring
      });
    });

    var visibleStats = filterStatsByVisibility(okrStats);
    lastReportRows = visibleStats;

    setHtml('okrReportTableBody', visibleStats.length === 0
      ? '<tr><td colspan="11" class="p-4 text-center text-slate-400">No goals have been created in this cycle yet.</td></tr>'
      : visibleStats.map(function (o) {
        return '<tr class="border-b border-slate-100 hover:bg-slate-50/80">' +
          '<td class="p-3 font-semibold">' + esc(o.userName) + '</td>' +
          '<td class="p-3">' + esc(o.owner) + '</td>' +
          '<td class="p-3">' + esc(o.managerEmail) + '</td>' +
          '<td class="p-3">' + esc(o.teamName) + '</td>' +
          '<td class="p-3">' + esc(o.period) + '</td>' +
          '<td class="p-3 font-medium">' + esc(o.title) + '</td>' +
          '<td class="p-3">' + esc(o.weight) + '%</td>' +
          '<td class="p-3">' + esc(o.target) + '</td>' +
          '<td class="p-3">' + esc(o.achievement) + '</td>' +
          '<td class="p-3 font-bold">' + esc(o.achievementPct) + '%</td>' +
          '<td class="p-3">' + esc(o.status) + (o.excluded ? ' (excluded)' : '') + '</td>' +
          '</tr>';
      }).join(''));

    return T.ratings().where('cycleId', '==', activeCycleId).get().then(function (rSnap) {
      var recMap = {};
      var feedbackMap = {};
      var ratingMap = {};
      var ratingBuckets = [0, 0, 0, 0, 0]; /* index 0 = 1 star ... index 4 = 5 stars */
      var signedOff = 0;
      var totalRatings = 0;
      var ratingSum = 0;
      var ratingCountNonZero = 0;

      rSnap.forEach(function (rd) {
        var rData = rd.data() || {};
        if (!rData.ownerEmail) return;
        var em = String(rData.ownerEmail).toLowerCase().trim();
        recMap[em] = rData.recommendation || 'Pending';
        feedbackMap[em] = rData.feedbackComment || 'None';
        ratingMap[em] = parseFloat(rData.overallRating) || 0;
        if (rData.managerSignedOff) signedOff++;
        totalRatings++;
        var rounded = Math.round(ratingMap[em]);
        if (rounded >= 1 && rounded <= 5) ratingBuckets[rounded - 1]++;
        if (ratingMap[em] > 0) { ratingSum += ratingMap[em]; ratingCountNonZero++; }
      });

      var userAgg = {};
      visibleStats.forEach(function (o) {
        if (!userAgg[o.owner]) {
          userAgg[o.owner] = {
            name: o.userName, email: o.owner, mgr: o.managerEmail,
            team: o.teamName, count: 0, totalPct: 0
          };
        }
        userAgg[o.owner].count++;
        userAgg[o.owner].totalPct += parseFloat(o.achievementPct);
      });
      lastReportUserAgg = userAgg;

      var aggList = Object.keys(userAgg).map(function (k) { return userAgg[k]; });
      setHtml('userReportTableBody', aggList.length === 0
        ? '<tr><td colspan="9" class="p-4 text-center text-slate-400">No goal data to summarise yet.</td></tr>'
        : aggList.map(function (u) {
          var mean = (u.totalPct / u.count).toFixed(2);
          return '<tr class="border-b border-slate-100 hover:bg-slate-50/80">' +
            '<td class="p-3 font-semibold">' + esc(u.name) + '</td>' +
            '<td class="p-3">' + esc(u.email) + '</td>' +
            '<td class="p-3">' + esc(u.mgr) + '</td>' +
            '<td class="p-3">' + esc(u.team) + '</td>' +
            '<td class="p-3 font-bold">' + u.count + '</td>' +
            '<td class="p-3 font-extrabold text-emerald-600">' + mean + '%</td>' +
            '<td class="p-3 font-bold">' + formatScoreFive(mean) + ' / 5.0</td>' +
            '<td class="p-3 font-bold text-indigo-700">' + esc(recMap[u.email] || 'Pending') + '</td>' +
            '<td class="p-3 text-slate-700 italic">' + esc(feedbackMap[u.email] || 'None') + '</td>' +
            '</tr>';
        }).join(''));

      setText('kpiPeopleInCycle', String(aggList.length));
      setText('kpiGoalsInCycle', String(visibleStats.length));
      setText('kpiSignedOff', signedOff + ' of ' + (totalRatings || 0));
      var avgAll = aggList.length > 0
        ? (aggList.reduce(function (acc, u) { return acc + (u.totalPct / u.count); }, 0) / aggList.length).toFixed(2)
        : '0.00';
      setText('kpiAverageProgress', avgAll + '%');

      var avgRating = ratingCountNonZero > 0 ? (ratingSum / ratingCountNonZero) : 0;

      renderLeadershipSummary(visibleStats, {
        ratingBuckets: ratingBuckets,
        avgRating: avgRating,
        signedOff: signedOff,
        ratingsCount: totalRatings
      });

      renderAnalyticsCharts({
        okrStats: visibleStats,
        ratingBuckets: ratingBuckets,
        signedOff: signedOff,
        ratingsCount: totalRatings,
        peopleCount: aggList.length
      });
    });
  }).catch(function (error) {
    console.error('Report load failed:', error);
    showToast(friendlyAuthError(error), 'error');
  });
}

function filterStatsByVisibility(okrStats) {
  if (userAccessRole === 'Super Admin') return okrStats;
  if (!currentUser) return [];

  var directEmails = getDirectReporteeEmails(currentUser.email);
  var deepEmails = getDeepSubordinateEmails(directEmails);
  var allowed = {};
  allowed[currentUser.email] = true;
  directEmails.concat(deepEmails).forEach(function (e) { allowed[e] = true; });

  return okrStats.filter(function (o) { return !!allowed[o.owner]; });
}

/* ---------------------------------------------------------------------------
 * Leadership summary — department / team rollups and the at-risk watchlist
 * ---------------------------------------------------------------------------
 * These are the tables a leader reads first: where the organisation stands by
 * team, and exactly which goals need attention now. Everything is derived from
 * the comparable 0-100(+)% achievement figure, never from raw target numbers.
 * -------------------------------------------------------------------------*/

var AT_RISK_THRESHOLD = 50;   /* below this % a goal is flagged at risk       */
var ON_TRACK_THRESHOLD = 75;  /* at or above this % a goal counts as on track */

function renderLeadershipSummary(stats, meta) {
  meta = meta || {};
  var buckets = meta.ratingBuckets || [0, 0, 0, 0, 0];

  /* Headline KPIs ------------------------------------------------------- */
  var atRisk = stats.filter(function (o) { return (parseFloat(o.achievementPct) || 0) < AT_RISK_THRESHOLD; });
  var topBox = buckets[3] + buckets[4];                 /* 4 and 5 star */
  var ratedPeople = buckets[0] + buckets[1] + buckets[2] + buckets[3] + buckets[4];
  var topBoxPct = ratedPeople > 0 ? Math.round((topBox / ratedPeople) * 100) : 0;
  var completionPct = meta.ratingsCount > 0 ? Math.round((meta.signedOff / meta.ratingsCount) * 100) : 0;

  setText('kpiAvgRating', meta.avgRating > 0 ? meta.avgRating.toFixed(2) + ' / 5' : '--');
  setText('kpiTopBox', ratedPeople > 0 ? topBoxPct + '%' : '--');
  setText('kpiReviewCompletion', meta.ratingsCount > 0 ? completionPct + '%' : '--');
  setText('kpiAtRisk', String(atRisk.length));

  /* Department and team rollup ------------------------------------------ */
  var groups = {};
  stats.forEach(function (o) {
    var dept = o.departmentName || 'Not set';
    var team = o.teamName || 'General';
    var key = dept + ' | ' + team;
    if (!groups[key]) {
      groups[key] = { dept: dept, team: team, people: {}, goals: 0, pctSum: 0, onTrack: 0, atRisk: 0 };
    }
    var g = groups[key];
    var pct = parseFloat(o.achievementPct) || 0;
    g.people[o.owner] = true;
    g.goals++;
    g.pctSum += pct;
    if (pct >= ON_TRACK_THRESHOLD) g.onTrack++;
    if (pct < AT_RISK_THRESHOLD) g.atRisk++;
  });

  var deptRows = Object.keys(groups).map(function (k) {
    var g = groups[k];
    return {
      dept: g.dept,
      team: g.team,
      people: Object.keys(g.people).length,
      goals: g.goals,
      avgPct: g.goals > 0 ? (g.pctSum / g.goals) : 0,
      onTrack: g.onTrack,
      atRisk: g.atRisk
    };
  }).sort(function (a, b) { return b.avgPct - a.avgPct; });
  lastDeptSummaryRows = deptRows;

  setHtml('deptSummaryTableBody', deptRows.length === 0
    ? '<tr><td colspan="7" class="p-4 text-center text-slate-400">No goal data to summarise yet.</td></tr>'
    : deptRows.map(function (r) {
      var avg = r.avgPct.toFixed(0);
      var tone = r.avgPct >= ON_TRACK_THRESHOLD ? 'text-emerald-600'
        : (r.avgPct < AT_RISK_THRESHOLD ? 'text-rose-600' : 'text-amber-600');
      return '<tr class="border-b border-slate-100 hover:bg-slate-50/80">' +
        '<td class="p-3 font-semibold">' + esc(r.dept) + '</td>' +
        '<td class="p-3">' + esc(r.team) + '</td>' +
        '<td class="p-3 font-bold">' + r.people + '</td>' +
        '<td class="p-3 font-bold">' + r.goals + '</td>' +
        '<td class="p-3 font-extrabold ' + tone + '">' + avg + '%</td>' +
        '<td class="p-3 font-bold text-emerald-600">' + r.onTrack + '</td>' +
        '<td class="p-3 font-bold text-rose-600">' + r.atRisk + '</td>' +
        '</tr>';
    }).join(''));

  /* At-risk watchlist --------------------------------------------------- */
  var atRiskRows = atRisk.map(function (o) {
    return {
      userName: o.userName, owner: o.owner, managerEmail: o.managerEmail,
      teamName: o.teamName, title: o.title,
      achievementPct: parseFloat(o.achievementPct) || 0, status: o.status
    };
  }).sort(function (a, b) { return a.achievementPct - b.achievementPct; });
  lastAtRiskRows = atRiskRows;

  setHtml('atRiskTableBody', atRiskRows.length === 0
    ? '<tr><td colspan="5" class="p-4 text-center text-emerald-600 font-semibold">No goals are below ' + AT_RISK_THRESHOLD + '% — nothing flagged at risk.</td></tr>'
    : atRiskRows.map(function (r) {
      return '<tr class="border-b border-slate-100 hover:bg-slate-50/80">' +
        '<td class="p-3 font-semibold">' + esc(r.userName) + '</td>' +
        '<td class="p-3">' + esc(r.teamName) + '</td>' +
        '<td class="p-3 font-medium">' + esc(r.title) + '</td>' +
        '<td class="p-3 font-extrabold text-rose-600">' + r.achievementPct.toFixed(0) + '%</td>' +
        '<td class="p-3">' + esc(r.status) + '</td>' +
        '</tr>';
    }).join(''));
}

/* ---------------------------------------------------------------------------
 * Leadership analytics charts
 * ---------------------------------------------------------------------------
 * Every chart here is built from figures that are comparable across goals and
 * people: goal achievement is always a 0-100(+)% completion, ratings are the
 * 1-5 manager stars, and status / sign-off counts are plain headcounts.
 *
 * Raw target and "current value" numbers are deliberately NOT summed across
 * goals: a goal measured in dollars and a goal measured in tickets share no
 * common unit, so adding them produces a total that means nothing. The old
 * dashboard did exactly that; these charts replace it with comparable views.
 * -------------------------------------------------------------------------*/

var CHART_INK = '#0F172A';     /* primary dark    */
var CHART_MUTED = '#64748B';   /* neutral slate   */
var CHART_FAINT = '#E2E8F0';   /* track / empty   */
var CHART_GREEN = '#059669';   /* on track        */
var CHART_AMBER = '#D97706';   /* needs attention */
var CHART_RED = '#E11D48';     /* at risk         */

/* Kept for any older reference; the palette above supersedes them. */
var CHART_TARGET_COLOR = '#CBD5E1';
var CHART_PROGRESS_COLOR = '#0F172A';
var CHART_MUTED_COLOR = '#94A3B8';

function chartContext(id) {
  var canvas = document.getElementById(id);
  return canvas ? canvas.getContext('2d') : null;
}

function baseChartOptions() {
  return { responsive: true, maintainAspectRatio: false };
}

/** Options for a single-series bar chart (legend hidden by default). */
function barOptions(opts) {
  opts = opts || {};
  var o = baseChartOptions();
  o.plugins = { legend: { display: false } };
  if (opts.tooltip) o.plugins.tooltip = opts.tooltip;
  if (opts.horizontal) o.indexAxis = 'y';
  o.scales = opts.scales || {};
  return o;
}

/** A percentage axis capped a little above 100 so a full bar keeps headroom. */
function percentAxis(horizontal) {
  var cfg = { beginAtZero: true, max: 110, ticks: { callback: function (v) { return v + '%'; } } };
  return horizontal ? { x: cfg } : { y: cfg };
}

/** Average of a numeric list; 0 for an empty list. */
function averageOf(list) {
  if (!list || !list.length) return 0;
  var sum = list.reduce(function (a, b) { return a + b; }, 0);
  return sum / list.length;
}

function renderAnalyticsCharts(data) {
  if (typeof Chart === 'undefined') return;

  var stats = data.okrStats || [];
  var buckets = data.ratingBuckets || [0, 0, 0, 0, 0];
  var signedOff = data.signedOff || 0;
  var ratingsCount = data.ratingsCount || 0;

  chartInstanceOverall = destroyChart(chartInstanceOverall);
  chartInstanceTeam = destroyChart(chartInstanceTeam);
  chartInstanceManager = destroyChart(chartInstanceManager);
  chartInstanceHeadcount = destroyChart(chartInstanceHeadcount);
  chartInstanceTargetMet = destroyChart(chartInstanceTargetMet);
  chartInstanceMetrics = destroyChart(chartInstanceMetrics);
  chartInstancePie = destroyChart(chartInstancePie);

  var pctTooltip = { callbacks: { label: function (c) { return c.parsed.x + '% average achievement'; } } };

  /* 1 — Goal achievement distribution -----------------------------------
   * How the whole population of goals is landing, in comparable % bands. */
  var distBands = [0, 0, 0, 0, 0];
  stats.forEach(function (o) {
    var p = parseFloat(o.achievementPct) || 0;
    if (p < 25) distBands[0]++;
    else if (p < 50) distBands[1]++;
    else if (p < 75) distBands[2]++;
    else if (p < 100) distBands[3]++;
    else distBands[4]++;
  });
  var ctxDist = chartContext('chartOverallTargetVsAch');
  if (ctxDist) {
    chartInstanceOverall = new Chart(ctxDist, {
      type: 'bar',
      data: {
        labels: ['Under 25%', '25-50%', '50-75%', '75-100%', 'Over 100%'],
        datasets: [{
          label: 'Goals',
          data: distBands,
          backgroundColor: [CHART_RED, CHART_AMBER, CHART_AMBER, CHART_GREEN, CHART_GREEN]
        }]
      },
      options: barOptions({ scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } })
    });
  }

  /* 2 — Average achievement by department -------------------------------- */
  var byDept = {};
  stats.forEach(function (o) {
    var k = o.departmentName || 'Not set';
    (byDept[k] = byDept[k] || []).push(Math.min(150, parseFloat(o.achievementPct) || 0));
  });
  var deptNames = Object.keys(byDept).sort(function (a, b) { return averageOf(byDept[b]) - averageOf(byDept[a]); });
  var ctxDept = chartContext('chartTeamTargetVsAch');
  if (ctxDept) {
    chartInstanceTeam = new Chart(ctxDept, {
      type: 'bar',
      data: {
        labels: deptNames,
        datasets: [{
          label: 'Average achievement',
          data: deptNames.map(function (k) { return Math.round(averageOf(byDept[k])); }),
          backgroundColor: CHART_INK
        }]
      },
      options: barOptions({ horizontal: true, scales: percentAxis(true), tooltip: pctTooltip })
    });
  }

  /* 3 — Average achievement by team -------------------------------------- */
  var byTeam = {};
  stats.forEach(function (o) {
    var k = o.teamName || 'General';
    (byTeam[k] = byTeam[k] || []).push(Math.min(150, parseFloat(o.achievementPct) || 0));
  });
  var teamNames = Object.keys(byTeam).sort(function (a, b) { return averageOf(byTeam[b]) - averageOf(byTeam[a]); });
  var ctxTeam = chartContext('chartManagerTargetVsAch');
  if (ctxTeam) {
    chartInstanceManager = new Chart(ctxTeam, {
      type: 'bar',
      data: {
        labels: teamNames,
        datasets: [{
          label: 'Average achievement',
          data: teamNames.map(function (k) { return Math.round(averageOf(byTeam[k])); }),
          backgroundColor: CHART_MUTED
        }]
      },
      options: barOptions({ horizontal: true, scales: percentAxis(true), tooltip: pctTooltip })
    });
  }

  /* 4 — Manager rating calibration --------------------------------------- */
  var ctxCal = chartContext('chartRatingHeadcount');
  if (ctxCal) {
    chartInstanceHeadcount = new Chart(ctxCal, {
      type: 'bar',
      data: {
        labels: ['5 stars', '4 stars', '3 stars', '2 stars', '1 star'],
        datasets: [{
          label: 'People',
          data: [buckets[4], buckets[3], buckets[2], buckets[1], buckets[0]],
          backgroundColor: [CHART_GREEN, CHART_GREEN, CHART_AMBER, CHART_RED, CHART_RED]
        }]
      },
      options: barOptions({ scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } })
    });
  }

  /* 5 — Goal health (red / amber / green) -------------------------------- */
  var onTrack = 0, attention = 0, risk = 0;
  stats.forEach(function (o) {
    var p = parseFloat(o.achievementPct) || 0;
    if (p >= ON_TRACK_THRESHOLD) onTrack++;
    else if (p >= AT_RISK_THRESHOLD) attention++;
    else risk++;
  });
  var ctxHealth = chartContext('chartTargetMetRatio');
  if (ctxHealth) {
    chartInstanceTargetMet = new Chart(ctxHealth, {
      type: 'doughnut',
      data: {
        labels: ['On track (75%+)', 'Needs attention (50-75%)', 'At risk (under 50%)'],
        datasets: [{ data: [onTrack, attention, risk], backgroundColor: [CHART_GREEN, CHART_AMBER, CHART_RED] }]
      },
      options: (function () { var o = baseChartOptions(); o.plugins = { legend: { position: 'bottom' } }; return o; })()
    });
  }

  /* 6 — Review completion (sign-off progress) ---------------------------- */
  var awaiting = Math.max(0, ratingsCount - signedOff);
  var ctxDone = chartContext('chartTypeWiseMetrics');
  if (ctxDone) {
    chartInstanceMetrics = new Chart(ctxDone, {
      type: 'doughnut',
      data: {
        labels: ['Signed off', 'Awaiting sign-off'],
        datasets: [{ data: [signedOff, awaiting], backgroundColor: [CHART_GREEN, CHART_FAINT] }]
      },
      options: (function () { var o = baseChartOptions(); o.plugins = { legend: { position: 'bottom' } }; return o; })()
    });
  }

  /* 7 — Goal plan approval ----------------------------------------------- */
  var approved = stats.filter(function (o) { return o.status === 'Approved'; }).length;
  var ctxPlan = chartContext('chartStatusPie');
  if (ctxPlan) {
    chartInstancePie = new Chart(ctxPlan, {
      type: 'doughnut',
      data: {
        labels: ['Approved', 'Pending approval'],
        datasets: [{ data: [approved, Math.max(0, stats.length - approved)], backgroundColor: [CHART_INK, CHART_MUTED_COLOR] }]
      },
      options: (function () { var o = baseChartOptions(); o.plugins = { legend: { position: 'bottom' } }; return o; })()
    });
  }
}

/* ---------------------------------------------------------------------------
 * CSV exports
 * -------------------------------------------------------------------------*/

function cycleFileLabel() {
  var cycle = cyclesList.filter(function (c) { return c.id === activeCycleId; })[0];
  var base = (Session.company && Session.company.name) ? Session.company.name : 'Perfexio';
  var name = (cycle && cycle.name) ? cycle.name : 'Cycle';
  return String(base + '_' + name).replace(/[^A-Za-z0-9_-]+/g, '_');
}

function exportUserSummaryCSV() {
  if (!activeCycleId) {
    showToast('Select an active review cycle first.', 'error');
    return;
  }

  T.ratings().where('cycleId', '==', activeCycleId).get().then(function (rSnap) {
    var recMap = {};
    var feedbackMap = {};
    var ratingMap = {};
    rSnap.forEach(function (rd) {
      var rData = rd.data() || {};
      if (!rData.ownerEmail) return;
      var em = String(rData.ownerEmail).toLowerCase().trim();
      recMap[em] = rData.recommendation || 'Pending';
      feedbackMap[em] = rData.feedbackComment || 'None';
      ratingMap[em] = rData.overallRating || 0;
    });

    var rows = [[
      'Name', 'Email', 'Manager', 'Team', 'Total goals', 'Average progress %',
      'Score out of 5', 'Manager rating out of 5', 'Recommendation', 'Manager feedback'
    ]];

    Object.keys(lastReportUserAgg).forEach(function (email) {
      var u = lastReportUserAgg[email];
      var mean = (u.totalPct / u.count).toFixed(2);
      rows.push([
        u.name, u.email, u.mgr, u.team, u.count, mean + '%',
        formatScoreFive(mean), ratingMap[email] || 0,
        recMap[email] || 'Pending', feedbackMap[email] || 'None'
      ]);
    });

    if (rows.length === 1) {
      showToast('There is no summary data to export for this cycle.', 'error');
      return;
    }
    downloadCSV(cycleFileLabel() + '_User_Summary.csv', rows);
    showToast('User summary exported.', 'success');
  }).catch(function (error) { showToast(friendlyAuthError(error), 'error'); });
}

function exportDetailedMatrixCSV() {
  if (!activeCycleId) {
    showToast('Select an active review cycle first.', 'error');
    return;
  }
  if (lastReportRows.length === 0) {
    showToast('There is no goal data to export for this cycle.', 'error');
    return;
  }

  var rows = [[
    'Name', 'Email', 'Manager', 'Team', 'Department', 'Objective', 'Period',
    'Weight %', 'Target', 'Latest progress', 'Achievement %', 'Status', 'Excluded from score'
  ]];

  lastReportRows.forEach(function (o) {
    rows.push([
      o.userName, o.owner, o.managerEmail, o.teamName, o.departmentName, o.title,
      o.period, o.weight, o.target, o.achievement, o.achievementPct + '%',
      o.status, o.excluded ? 'Yes' : 'No'
    ]);
  });

  downloadCSV(cycleFileLabel() + '_Goal_Matrix.csv', rows);
  showToast('Goal matrix exported.', 'success');
}

function exportDeptSummaryCSV() {
  if (!activeCycleId) {
    showToast('Select an active review cycle first.', 'error');
    return;
  }
  if (lastDeptSummaryRows.length === 0) {
    showToast('There is no department data to export for this cycle.', 'error');
    return;
  }

  var rows = [[
    'Department', 'Team', 'People', 'Goals', 'Average achievement %', 'On track (75%+)', 'At risk (under 50%)'
  ]];
  lastDeptSummaryRows.forEach(function (r) {
    rows.push([r.dept, r.team, r.people, r.goals, r.avgPct.toFixed(0) + '%', r.onTrack, r.atRisk]);
  });

  downloadCSV(cycleFileLabel() + '_Team_Summary.csv', rows);
  showToast('Team summary exported.', 'success');
}

function exportAtRiskCSV() {
  if (!activeCycleId) {
    showToast('Select an active review cycle first.', 'error');
    return;
  }
  if (lastAtRiskRows.length === 0) {
    showToast('There are no at-risk goals to export for this cycle.', 'error');
    return;
  }

  var rows = [['Name', 'Email', 'Manager', 'Team', 'Goal', 'Achievement %', 'Status']];
  lastAtRiskRows.forEach(function (r) {
    rows.push([r.userName, r.owner, r.managerEmail, r.teamName, r.title, r.achievementPct.toFixed(0) + '%', r.status]);
  });

  downloadCSV(cycleFileLabel() + '_At_Risk_Goals.csv', rows);
  showToast('At-risk goals exported.', 'success');
}

function exportRosterCSV() {
  var list = Object.keys(userMap).map(function (k) { return userMap[k]; });
  if (list.length === 0) {
    showToast('There is nobody in the roster to export.', 'error');
    return;
  }
  var rows = [['name', 'email', 'designation', 'departmentName', 'teamName', 'managerEmail', 'accessLevel', 'status']];
  list.forEach(function (u) {
    rows.push([
      u.name || '', u.email, u.designation || '', u.departmentName || '',
      u.teamName || '', u.managerEmail || '', u.accessLevel || 'Level 1', u.status || 'active'
    ]);
  });
  downloadCSV(cycleFileLabel() + '_Roster.csv', rows);
  showToast('Roster exported.', 'success');
}
