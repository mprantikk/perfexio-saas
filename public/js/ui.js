/* ============================================================================
 * Perfexio — Shared UI primitives
 * Modals, tabs, toasts, dropdowns, formatting, CSV download, image handling.
 * ==========================================================================*/

/**
 * openModal('modal-okr')        -> opens a blank objective form
 * openModal('modal-okr', false) -> opens without clearing (edit / assign flows)
 */
function openModal(id, isCreatingNew) {
  if (id === 'modal-okr') {
    if (typeof canEditOwnOkrs === 'function' && isCreatingNew !== false && !canEditOwnOkrs()) {
      showToast('This review cycle is locked, so new goals cannot be added.', 'error');
      return;
    }
    if (isCreatingNew !== false && typeof resetOkrModalFields === 'function') {
      resetOkrModalFields();
    }
  }
  if (id === 'modal-feedback' && typeof resetFeedbackModalFields === 'function') {
    resetFeedbackModalFields();
  }
  var el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function closeModal(id) {
  var el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function show(id) {
  var el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function hide(id) {
  var el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function setText(id, value) {
  var el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setHtml(id, value) {
  var el = document.getElementById(id);
  if (el) el.innerHTML = value;
}

function getVal(id) {
  var el = document.getElementById(id);
  return el ? el.value : '';
}

/** Escape user-supplied text before injecting it into innerHTML. */
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------------------------------------------------------------------------
 * Toast notifications
 * -------------------------------------------------------------------------*/

var TOAST_TIMER = null;

function showToast(message, kind) {
  var host = document.getElementById('toastHost');
  if (!host) {
    alert(message);
    return;
  }
  var palette = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    error: 'border-red-200 bg-red-50 text-red-900',
    info: 'border-slate-200 bg-white text-slate-900'
  };
  var cls = palette[kind] || palette.info;
  host.innerHTML =
    '<div class="pointer-events-auto animate-modal-pop rounded-xl border px-5 py-3 text-xs sm:text-sm font-bold shadow-2xl ' +
    cls + '">' + esc(message) + '</div>';
  host.classList.remove('hidden');
  if (TOAST_TIMER) clearTimeout(TOAST_TIMER);
  TOAST_TIMER = setTimeout(function () {
    host.classList.add('hidden');
    host.innerHTML = '';
  }, 4200);
}

function showBusy(message) {
  var el = document.getElementById('busyOverlay');
  if (!el) return;
  setText('busyOverlayText', message || 'Working...');
  el.classList.remove('hidden');
}

function hideBusy() {
  var el = document.getElementById('busyOverlay');
  if (el) el.classList.add('hidden');
}

/* ---------------------------------------------------------------------------
 * Tabs
 * -------------------------------------------------------------------------*/

var ALL_TAB_IDS = ['my-okrs', 'final-summary', 'team-view', 'reports', 'analytics', 'admin-panel', 'feedback-dash'];

var TAB_ACTIVE_CLASSES = ['bg-slate-900', 'text-white', 'shadow-md'];
var TAB_IDLE_CLASSES = ['text-slate-600', 'hover:text-slate-900', 'hover:bg-slate-100/80', 'border-transparent'];

function switchTab(tabId) {
  ALL_TAB_IDS.forEach(function (id) {
    var section = document.getElementById('sec-' + id);
    if (section) section.classList.add('hidden');
    var navBtn = document.getElementById('tab-' + id);
    if (navBtn) {
      TAB_ACTIVE_CLASSES.forEach(function (c) { navBtn.classList.remove(c); });
      TAB_IDLE_CLASSES.forEach(function (c) { navBtn.classList.add(c); });
    }
  });

  var target = document.getElementById('sec-' + tabId);
  if (target) target.classList.remove('hidden');
  var activeBtn = document.getElementById('tab-' + tabId);
  if (activeBtn) {
    TAB_IDLE_CLASSES.forEach(function (c) { activeBtn.classList.remove(c); });
    TAB_ACTIVE_CLASSES.forEach(function (c) { activeBtn.classList.add(c); });
  }

  if (tabId === 'final-summary') loadDashboard();
  else if (tabId === 'reports' || tabId === 'analytics') loadReports();
  else if (tabId === 'feedback-dash') loadFeedbackDashboard();
}

/* ---------------------------------------------------------------------------
 * Header dropdown
 * -------------------------------------------------------------------------*/

function toggleHeaderDropdown(event) {
  if (event) event.stopPropagation();
  var menu = document.getElementById('headerProfileMenu');
  if (menu) menu.classList.toggle('hidden');
}

function closeHeaderDropdownOutside(event) {
  var menu = document.getElementById('headerProfileMenu');
  var trigger = document.getElementById('profileDropdownBtn');
  if (menu && !menu.classList.contains('hidden')) {
    if (!(trigger && trigger.contains(event.target)) && !menu.contains(event.target)) {
      menu.classList.add('hidden');
    }
  }

  var sugBox = document.getElementById('hrUnlockSuggestionsBox');
  var input = document.getElementById('hrUnlockSearchInput');
  if (sugBox && input && !sugBox.contains(event.target) && !input.contains(event.target)) {
    sugBox.classList.add('hidden');
  }
}

/* ---------------------------------------------------------------------------
 * Score formatting
 * -------------------------------------------------------------------------*/

/** Convert a 0-100 percentage into a 0.00-5.00 scale string. */
function formatScoreFive(pct) {
  var p = parseFloat(pct) || 0;
  return Math.max(0, Math.min(5.0, (p / 100) * 5.0)).toFixed(2);
}

/** Rating label + colour classes for a 0-100 score. */
function ratingBadgeFor(score) {
  var s = parseFloat(score) || 0;
  if (s >= 90) return { label: 'Outstanding', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40' };
  if (s >= 70) return { label: 'Meets Expectations', cls: 'bg-amber-500/20 text-amber-300 border-amber-400/40' };
  return { label: 'Needs Improvement', cls: 'bg-rose-500/20 text-rose-300 border-rose-400/40' };
}

function formatDateOnly(value) {
  if (!value) return '--';
  try {
    if (typeof value.toDate === 'function') return value.toDate().toISOString().split('T')[0];
    if (value instanceof Date) return value.toISOString().split('T')[0];
    return String(value).split('T')[0];
  } catch (e) {
    return String(value);
  }
}

function formatDateTime(value) {
  if (!value) return '--';
  try {
    var d = (typeof value.toDate === 'function') ? value.toDate() : new Date(value);
    return d.toLocaleString();
  } catch (e) {
    return String(value);
  }
}

/* ---------------------------------------------------------------------------
 * CSV download
 * -------------------------------------------------------------------------*/

function downloadCSV(filename, rows) {
  var csvContent = rows.map(function (row) {
    return row.map(function (cell) {
      var value = (cell === null || cell === undefined) ? '' : String(cell);
      return '"' + value.replace(/"/g, '""') + '"';
    }).join(',');
  }).join('\n');

  var blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ---------------------------------------------------------------------------
 * Image handling (stored as compressed base64 data URLs in Firestore)
 * -------------------------------------------------------------------------*/

/**
 * Read an <input type="file"> image, downscale it, and hand back a data URL.
 * maxSide keeps documents comfortably under the 1 MiB Firestore limit.
 */
function readImageAsResizedDataUrl(file, maxSide, callback) {
  if (!file) {
    callback(null, 'No file selected.');
    return;
  }
  if (String(file.type).indexOf('image/') !== 0) {
    callback(null, 'Please choose an image file (PNG, JPG, or SVG).');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    callback(null, 'That image is larger than 5 MB. Please choose a smaller file.');
    return;
  }

  var reader = new FileReader();
  reader.onload = function (event) {
    var img = new Image();
    img.onload = function () {
      var limit = maxSide || 300;
      var scale = Math.min(1, limit / Math.max(img.width, img.height));
      var w = Math.max(1, Math.round(img.width * scale));
      var h = Math.max(1, Math.round(img.height * scale));
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      try {
        callback(canvas.toDataURL('image/png'), null);
      } catch (e) {
        callback(null, 'That image could not be processed. Please try another file.');
      }
    };
    img.onerror = function () {
      callback(null, 'That image could not be read. Please try another file.');
    };
    img.src = event.target.result;
  };
  reader.onerror = function () {
    callback(null, 'The file could not be read. Please try again.');
  };
  reader.readAsDataURL(file);
}

/** Consistent initials avatar fallback. */
function initialsFor(nameOrEmail) {
  var source = String(nameOrEmail || '').trim();
  if (!source) return '?';
  if (source.indexOf('@') !== -1 && source.indexOf(' ') === -1) {
    return source.charAt(0).toUpperCase();
  }
  var parts = source.split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function avatarMarkup(photoUrl, nameOrEmail, sizeClass) {
  var size = sizeClass || 'h-9 w-9';
  if (photoUrl) {
    return '<img src="' + esc(photoUrl) + '" alt="" class="' + size +
      ' rounded-full object-cover border border-white/20" />';
  }
  return '<div class="' + size +
    ' rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-xs font-extrabold text-white">' +
    esc(initialsFor(nameOrEmail)) + '</div>';
}
