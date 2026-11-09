#!/usr/bin/env node
/* ============================================================================
 * Perfexio — test harness
 * ----------------------------------------------------------------------------
 * Runs with plain Node, no npm install required:
 *
 *     node tools/test.js          (or: npm test)
 *
 * WHY THIS EXISTS
 *   The product ships as classic <script> files with hundreds of inline
 *   onclick="fn()" handlers. A normal bundler would catch a renamed function
 *   at build time, but there is no build step here on purpose, so these checks
 *   take that role instead. Run them before every deploy.
 *
 * WHAT IT CHECKS
 *   1. Syntax        — node --check on every public/js/*.js file
 *   2. Handlers      — every on* handler in index.html resolves to a global
 *   3. Element ids   — every id the JS reads exists in index.html
 *   4. Duplicate ids — no id is defined twice in index.html
 *   5. Language      — no Bengali / Banglish text in the shipped UI
 *   6. Unit tests    — the scoring, weighting and CSV maths behave
 *
 * Exit code is 0 only when every section passes, so CI can gate on it.
 * ========================================================================== */

'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var PUBLIC = path.join(ROOT, 'public');
var JS_DIR = path.join(PUBLIC, 'js');
var INDEX = path.join(PUBLIC, 'index.html');

/* Script load order, mirrored from index.html. Keep in sync when adding a
   module. app.js is loaded last because it is the only one that calls the
   others at boot. */
var LOAD_ORDER = [
  'env.js', 'firebase.js', 'state.js', 'ui.js', 'auth.js',
  'cycles.js', 'okrs.js', 'team.js', 'admin.js', 'reports.js',
  'feedback.js', 'demo.js', 'app.js'
];

/* Ids that are created at run time, so they will not appear in index.html. */
var DYNAMIC_ID_PREFIXES = ['sec-', 'tab-', 'weight_input_'];
var DYNAMIC_ID_EXACT = ['demoPanelMessage', 'userAvatarText'];

var failures = [];
var passes = [];

function ok(section, detail) { passes.push(section + (detail ? ' — ' + detail : '')); }
function fail(section, detail) { failures.push(section + ': ' + detail); }

function readFile(p) { return fs.readFileSync(p, 'utf8'); }

/* ---------------------------------------------------------------------------
 * 1. Syntax check
 * -------------------------------------------------------------------------*/
function checkSyntax() {
  var files = fs.readdirSync(JS_DIR).filter(function (f) { return f.endsWith('.js'); });
  var bad = 0;
  files.forEach(function (f) {
    try {
      cp.execSync('node --check ' + JSON.stringify(path.join(JS_DIR, f)), { stdio: 'pipe' });
    } catch (e) {
      bad++;
      fail('syntax', f + '\n' + String(e.stderr || e.message));
    }
  });
  if (!bad) ok('syntax', files.length + ' JS files parse');
}

/* ---------------------------------------------------------------------------
 * Collect the set of global names the JS files define
 * -------------------------------------------------------------------------*/
function collectDefinedGlobals() {
  var defined = {};
  LOAD_ORDER.forEach(function (f) {
    var src = readFile(path.join(JS_DIR, f));
    (src.match(/^function\s+([A-Za-z_$][\w$]*)/gm) || []).forEach(function (m) {
      defined[m.replace(/^function\s+/, '')] = true;
    });
    (src.match(/^var\s+([A-Za-z_$][\w$]*)/gm) || []).forEach(function (m) {
      defined[m.replace(/^var\s+/, '')] = true;
    });
  });
  return defined;
}

/* ---------------------------------------------------------------------------
 * 2. Inline handlers resolve to a defined global
 * -------------------------------------------------------------------------*/
function checkHandlers() {
  var html = readFile(INDEX);
  var defined = collectDefinedGlobals();

  /* Grab the first identifier called inside each on* attribute. The lookbehind
     skips property accesses like window.print(), so only bare-global calls
     (the ones that must resolve to a defined function) are checked. */
  var attrRe = /\bon(?:click|change|input|submit|keyup|keydown|keypress)\s*=\s*"([^"]*)"/g;
  var callRe = /(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
  var missing = {};
  var seen = 0;
  var m;
  while ((m = attrRe.exec(html)) !== null) {
    var body = m[1];
    var c;
    while ((c = callRe.exec(body)) !== null) {
      var name = c[1];
      seen++;
      if (!defined[name]) missing[name] = true;
    }
    callRe.lastIndex = 0;
  }
  var names = Object.keys(missing);
  if (names.length) fail('handlers', 'undefined globals referenced by inline handlers: ' + names.join(', '));
  else ok('handlers', seen + ' handler calls all resolve');
}

/* ---------------------------------------------------------------------------
 * 3. Every id the JS reads exists in index.html
 * -------------------------------------------------------------------------*/
function checkIds() {
  var html = readFile(INDEX);
  var wanted = JSON.parse(readFile(path.join(ROOT, 'tools', '_js_ids_all.json')));

  var present = {};
  var idRe = /\bid\s*=\s*"([^"]+)"/g;
  var mm;
  while ((mm = idRe.exec(html)) !== null) present[mm[1]] = true;

  var missing = wanted.filter(function (id) {
    if (present[id]) return false;
    if (DYNAMIC_ID_EXACT.indexOf(id) !== -1) return false;
    for (var i = 0; i < DYNAMIC_ID_PREFIXES.length; i++) {
      if (id.indexOf(DYNAMIC_ID_PREFIXES[i]) === 0) return false;
    }
    return true;
  });

  if (missing.length) fail('ids', missing.length + ' ids read by JS are missing from index.html: ' + missing.join(', '));
  else ok('ids', wanted.length + ' referenced ids present');
}

/* ---------------------------------------------------------------------------
 * 4. No duplicate ids in index.html
 * -------------------------------------------------------------------------*/
function checkDuplicateIds() {
  var html = readFile(INDEX);
  var counts = {};
  var idRe = /\bid\s*=\s*"([^"]+)"/g;
  var mm;
  while ((mm = idRe.exec(html)) !== null) counts[mm[1]] = (counts[mm[1]] || 0) + 1;
  var dupes = Object.keys(counts).filter(function (k) { return counts[k] > 1; });
  if (dupes.length) fail('duplicate-ids', dupes.map(function (d) { return d + ' (x' + counts[d] + ')'; }).join(', '));
  else ok('duplicate-ids', 'none');
}

/* ---------------------------------------------------------------------------
 * 5. No Bengali / Banglish in shipped UI
 *
 * Two passes over public/ (js + html):
 *   a. any Bengali Unicode code point is an immediate failure
 *   b. a curated list of Banglish tokens, matched case-insensitively as whole
 *      words, catches romanised Bengali that slipped into a user-facing string
 * Comments are stripped from JS first so an explanatory note never trips it.
 * -------------------------------------------------------------------------*/
function checkLanguage() {
  var banglish = [
    'korte', 'korbo', 'korchi', 'hobe', 'hoyeche', 'ache', 'nai', 'naki',
    'ami', 'tumi', 'apni', 'amar', 'tomar', 'kori', 'kora', 'thakbe',
    'lagbe', 'dekhabe', 'jonno', 'kintu', 'karon', 'tarpor', 'ekhon',
    'valo', 'kaj', 'obosshoi', 'sobkichu', 'bhabe', 'onek'
  ];
  var files = [];
  ['js'].forEach(function (sub) {
    fs.readdirSync(path.join(PUBLIC, sub)).forEach(function (f) {
      if (f.endsWith('.js')) files.push(path.join(PUBLIC, sub, f));
    });
  });
  files.push(INDEX);

  var problems = [];
  files.forEach(function (fp) {
    var src = readFile(fp);
    var name = path.relative(ROOT, fp);

    /* Bengali script anywhere is a hard fail. */
    var bengali = src.match(/[ঀ-৿]+/g);
    if (bengali) problems.push(name + ': Bengali script "' + bengali[0] + '"');

    /* For Banglish, strip JS comments so notes are exempt, then scan the rest.
       index.html has HTML comments; strip those too. */
    var scan = src;
    if (fp.endsWith('.js')) {
      scan = scan.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    } else {
      scan = scan.replace(/<!--[\s\S]*?-->/g, ' ');
    }
    banglish.forEach(function (tok) {
      var re = new RegExp('\\b' + tok + '\\b', 'i');
      if (re.test(scan)) problems.push(name + ': Banglish token "' + tok + '"');
    });
  });

  if (problems.length) fail('language', 'non-English UI text found:\n    ' + problems.join('\n    '));
  else ok('language', 'shipped UI is clean English');
}

/* ---------------------------------------------------------------------------
 * 6. Pure-logic unit tests
 *
 * The real source is loaded into a sandbox with just enough browser and
 * Firebase stubs that the files parse and their declarations register. Only
 * pure functions are exercised, so no network or DOM is ever touched.
 * -------------------------------------------------------------------------*/
function loadSandbox() {
  var sandbox = {
    console: console,
    window: { location: { hostname: 'localhost', search: '', pathname: '/' }, addEventListener: function () {} },
    navigator: { userAgent: 'node' },
    document: {
      readyState: 'loading',
      addEventListener: function () {},
      getElementById: function () { return null; },
      querySelectorAll: function () { return []; },
      createElement: function () { return { setAttribute: function () {}, style: {}, classList: { add: function () {}, remove: function () {} } }; },
      body: { appendChild: function () {}, removeChild: function () {} },
      title: ''
    },
    firebase: {
      initializeApp: function () { return {}; },
      firestore: function () { return {}; },
      auth: function () { return { onAuthStateChanged: function () {} }; }
    },
    Blob: function () {}, Image: function () {}, FileReader: function () {},
    URL: { createObjectURL: function () { return ''; }, revokeObjectURL: function () {} },
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    alert: function () {}, confirm: function () { return true; }
  };
  sandbox.window.document = sandbox.document;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  LOAD_ORDER.forEach(function (f) {
    var src = readFile(path.join(JS_DIR, f));
    try {
      vm.runInContext(src, sandbox, { filename: f });
    } catch (e) {
      fail('unit-load', f + ': ' + e.message);
    }
  });
  return sandbox;
}

function approx(a, b, eps) { return Math.abs(parseFloat(a) - parseFloat(b)) <= (eps || 0.01); }

function checkUnits() {
  var s = loadSandbox();
  var t = [];
  function assert(name, cond) { t.push({ name: name, pass: !!cond }); }

  /* calculateOkrAchievementPercentage */
  assert('achievement: half of target -> 50%',
    approx(s.calculateOkrAchievementPercentage({ targetValue: 100, currentValue: 50, direction: 'INCREASE' }), 50));
  assert('achievement: target 0 -> 0%',
    s.calculateOkrAchievementPercentage({ targetValue: 0, currentValue: 10 }) === 0);
  assert('achievement: DECREASE goal rewards being under target',
    approx(s.calculateOkrAchievementPercentage({ targetValue: 50, currentValue: 100, direction: 'DECREASE' }), 50));

  /* formatScoreFive: 0-100 -> 0-5 */
  assert('formatScoreFive: 100 -> 5.00', s.formatScoreFive(100) === '5.00');
  assert('formatScoreFive: 80 -> 4.00', s.formatScoreFive(80) === '4.00');
  assert('formatScoreFive: clamps above 100', s.formatScoreFive(140) === '5.00');
  assert('formatScoreFive: clamps below 0', s.formatScoreFive(-20) === '0.00');

  /* SCORE_WEIGHTS sum to 1 */
  assert('SCORE_WEIGHTS sum to 1.0',
    approx(s.SCORE_WEIGHTS.goals + s.SCORE_WEIGHTS.manager + s.SCORE_WEIGHTS.values, 1.0));

  /* computeScoreBundle: a perfect record scores 100 across the board */
  var perfect = s.computeScoreBundle({
    okrs: [{ weight: 100, targetValue: 10, currentValue: 10, direction: 'INCREASE' }],
    values: [{ appraiserRating: 5 }],
    managerRating: { overallRating: 5 }
  });
  assert('score: perfect goal -> 100.00', perfect.goal === '100.00');
  assert('score: perfect manager -> 100.00', perfect.manager === '100.00');
  assert('score: perfect values -> 100.00', perfect.values === '100.00');
  assert('score: perfect final -> 100.00', perfect.final === '100.00');

  /* computeScoreBundle: weighting blends correctly.
     goals 100, manager 50 (2.5/5), values 0 ->
     100*0.5 + 50*0.4 + 0*0.1 = 70.00 */
  var mixed = s.computeScoreBundle({
    okrs: [{ weight: 100, targetValue: 10, currentValue: 10, direction: 'INCREASE' }],
    values: [{ appraiserRating: 0 }],
    managerRating: { overallRating: 2.5 }
  });
  assert('score: blended weighting -> 70.00', mixed.final === '70.00');

  /* computeScoreBundle: excluded goals drop out of the goal score */
  var excluded = s.computeScoreBundle({
    okrs: [
      { weight: 50, targetValue: 10, currentValue: 10, direction: 'INCREASE' },
      { weight: 50, targetValue: 10, currentValue: 0, direction: 'INCREASE', isExcludedFromScoring: true }
    ],
    values: [], managerRating: null
  });
  assert('score: excluded goal ignored -> goal 100.00', excluded.goal === '100.00');

  /* computeScoreBundle: no data is safe, not NaN */
  var empty = s.computeScoreBundle({ okrs: [], values: [], managerRating: null });
  assert('score: empty record -> final 0.00', empty.final === '0.00');

  /* splitCsvLine: quoted commas and escaped quotes */
  var row = s.splitCsvLine('Amelia Hart,"Hart, A.",hr@x.com,"She said ""hi"""');
  assert('csv: field count', row.length === 4);
  assert('csv: quoted comma kept', row[1] === 'Hart, A.');
  assert('csv: escaped quote unwrapped', row[3] === 'She said "hi"');

  /* detectPerfexioEnvironment: host mapping (demo before staging) */
  assert('env: production host', envFor(s, 'perfexio.web.app') === 'production');
  assert('env: staging host', envFor(s, 'staging-perfexio.web.app') === 'staging');
  assert('env: demo host beats staging prefix', envFor(s, 'staging-perfexio-demo.web.app') === 'demo');

  var bad = t.filter(function (x) { return !x.pass; });
  t.forEach(function (x) { if (!x.pass) fail('unit', x.name); });
  if (!bad.length) ok('unit', t.length + ' logic assertions pass');
}

/* Re-evaluate detectPerfexioEnvironment against a chosen hostname. */
function envFor(s, host) {
  s.window.location.hostname = host;
  return s.detectPerfexioEnvironment();
}

/* ---------------------------------------------------------------------------
 * Run everything
 * -------------------------------------------------------------------------*/
console.log('\nPerfexio test harness\n=====================');
[checkSyntax, checkHandlers, checkIds, checkDuplicateIds, checkLanguage, checkUnits]
  .forEach(function (fn) {
    try { fn(); } catch (e) { fail(fn.name, e.stack || e.message); }
  });

console.log('\nPASS');
passes.forEach(function (p) { console.log('  ✓ ' + p); });

if (failures.length) {
  console.log('\nFAIL');
  failures.forEach(function (f) { console.log('  ✗ ' + f); });
  console.log('\n' + failures.length + ' section(s) failed.\n');
  process.exit(1);
}
console.log('\nAll checks passed.\n');
process.exit(0);
