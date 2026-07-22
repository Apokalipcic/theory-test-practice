// All reads/writes of user progress go through this module. It syncs each
// nickname's progress to a Cloudflare Worker so the same nickname sees the same
// progress on any device. localStorage is now only a *cache*: it makes the app
// instant and lets it keep working through a dropped connection. The server is
// the source of truth.
//
// Shape on the wire is one JSON blob per nickname - the same object this file
// has always stored - so the swap stayed inside this file.
window.Store = (function () {
  // The Worker that holds every profile, keyed by nickname. If you redeploy the
  // Worker somewhere else, this is the only line that changes.
  var API = 'https://theory-sync.sname00012.workers.dev';

  // localStorage keys. Only caches and device-level settings live here now.
  var CURRENT = 'tt.current';   // last nickname used on this device
  var RECENT = 'tt.recent';     // [names] used on this device, for quick pick
  var CACHE = 'tt.cache.';      // tt.cache.<name> -> last known blob (offline copy)
  var PREFS = 'tt.prefs';       // how you like to study on THIS device

  // A question leaves the failed bank after this many correct answers in a row,
  // so a lucky guess on a 1-in-4 multiple choice doesn't clear it.
  var MASTERY = 2;

  /* ---------- localStorage plumbing (cache + prefs only) ---------- */

  var available = (function () {
    try { localStorage.setItem('tt.probe', '1'); localStorage.removeItem('tt.probe'); return true; }
    catch (e) { return false; } // Private browsing, or storage disabled.
  })();

  var memory = {}; // Fallback so the app still runs (this session only) without storage.

  function readRaw(key) { return available ? localStorage.getItem(key) : (memory[key] || null); }
  function writeRaw(key, value) {
    if (!available) { memory[key] = value; return; }
    try { localStorage.setItem(key, value); } catch (e) { /* quota: the server copy still holds. */ }
  }
  function removeRaw(key) { if (available) localStorage.removeItem(key); else delete memory[key]; }
  function readJSON(key, fallback) {
    var raw = readRaw(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  /* ---------- current session (held in memory) ---------- */

  var current = null;      // the logged-in profile object, or null
  var dirty = false;       // unsaved changes waiting to reach the server
  var pushTimer = null;
  var pushInFlight = false;

  function blank(name) {
    return {
      name: name,
      created: Date.now(),
      // qid -> { c: times correct, w: times wrong, streak: correct in a row }
      answers: {},
      exams: []
    };
  }

  function normalize(name) { return String(name || '').trim(); }
  function cacheKey(name) { return CACHE + name.toLowerCase(); }

  /* ---------- device-local "recently used" list ---------- */

  function listProfiles() { return readJSON(RECENT, []); }

  function rememberRecent(name) {
    var names = listProfiles().filter(function (n) { return n.toLowerCase() !== name.toLowerCase(); });
    names.unshift(name);
    writeRaw(RECENT, JSON.stringify(names.slice(0, 10)));
  }

  // Removes a nickname from THIS device only (recent list + offline cache). The
  // server copy is untouched, so logging in again anywhere brings it back.
  function forgetProfile(name) {
    writeRaw(RECENT, JSON.stringify(listProfiles().filter(function (n) {
      return n.toLowerCase() !== name.toLowerCase();
    })));
    removeRaw(cacheKey(name));
    var cur = currentName();
    if (cur && cur.toLowerCase() === name.toLowerCase()) logout();
  }

  function currentName() { return current ? current.name : readRaw(CURRENT); }

  /* ---------- login: pull this nickname's progress from the server ---------- */

  // cb(err, info) where info.source is 'server' | 'new' | 'cache'.
  function login(name, cb) {
    name = normalize(name);
    if (!name) return cb(new Error('Please enter a nickname.'));
    if (name.length > 30) return cb(new Error('That nickname is a bit long.'));

    fetch(API + '/' + encodeURIComponent(name))
      .then(function (res) {
        // 204 (current Worker) or 404 (older Worker): no profile yet - start blank.
        if (res.status === 204 || res.status === 404) { begin(blank(name)); cb(null, { source: 'new' }); return; }
        if (!res.ok) throw new Error('server ' + res.status);
        return res.text().then(function (txt) {
          var blob = null;
          try { blob = txt ? JSON.parse(txt) : null; } catch (e) { blob = null; }
          if (!blob || typeof blob.answers !== 'object') blob = blank(name);
          blob.name = name; // keep the casing the person just typed, for display
          begin(blob);
          cb(null, { source: 'server' });
        });
      })
      .catch(function () {
        // Couldn't reach the server. Use this device's cached copy if we have
        // one; otherwise refuse, rather than start blank and later overwrite
        // good server data once the connection returns.
        var cached = readJSON(cacheKey(name), null);
        if (cached) { begin(cached); cb(null, { source: 'cache' }); }
        else cb(new Error("Can't reach the sync server, and there's no saved copy of \"" +
          name + "\" on this device. Check your connection and try again."));
      });
  }

  function begin(blob) {
    current = blob;
    dirty = false;
    writeRaw(CURRENT, blob.name);
    writeRaw(cacheKey(blob.name), JSON.stringify(blob));
    rememberRecent(blob.name);
  }

  function logout() {
    flush();            // get any pending change to the server before dropping it
    current = null;
    removeRaw(CURRENT);
  }

  /* ---------- saving: cache immediately, push (debounced) to the server ---------- */

  function touch() {
    if (!current) return;
    writeRaw(cacheKey(current.name), JSON.stringify(current)); // instant + offline-safe
    dirty = true;
    if (!pushTimer) pushTimer = setTimeout(push, 800);         // coalesce rapid answers
  }

  function push() {
    pushTimer = null;
    if (!current || pushInFlight || !dirty) return;
    pushInFlight = true;
    dirty = false; // capturing the state as it is now; a later change re-sets this
    fetch(API + '/' + encodeURIComponent(current.name), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current)
    })
      .catch(function () { dirty = true; }) // failed: mark for another attempt
      .then(function () {
        pushInFlight = false;
        // Retry a failed push, or send changes that arrived mid-flight, after a
        // short pause (no tight loop while offline).
        if (dirty && !pushTimer) pushTimer = setTimeout(push, 3000);
      });
  }

  // Force a pending change out now. keepalive lets the request finish even as
  // the tab is closing, so the last answer isn't lost.
  function flush() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    if (!current || !dirty) return;
    dirty = false;
    try {
      fetch(API + '/' + encodeURIComponent(current.name), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(current),
        keepalive: true
      });
    } catch (e) { dirty = true; }
  }

  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });

  /* ---------- the synchronous API app.js already uses ---------- */

  // Records one answer and returns the updated per-question record.
  function recordAnswer(qid, correct) {
    if (!current) return null;
    var rec = current.answers[qid] || { c: 0, w: 0, streak: 0 };
    if (correct) { rec.c++; rec.streak++; } else { rec.w++; rec.streak = 0; }
    current.answers[qid] = rec;
    touch();
    return rec;
  }

  // The failed bank: anything answered wrong at least once that hasn't since
  // been answered correctly MASTERY times in a row.
  function failedIds() {
    if (!current) return [];
    return Object.keys(current.answers).filter(function (id) {
      var r = current.answers[id];
      return r.w > 0 && r.streak < MASTERY;
    });
  }

  // Every question this profile has answered at least once.
  function seenIds() { return current ? Object.keys(current.answers) : []; }

  // Drops progress for questions that no longer exist, so a swapped question set
  // can't leave orphaned answers inflating the stats or the failed bank.
  function prune(validIds) {
    if (!current) return 0;
    var valid = {};
    validIds.forEach(function (id) { valid[id] = true; });
    var removed = 0;
    Object.keys(current.answers).forEach(function (id) {
      if (!valid[id]) { delete current.answers[id]; removed++; }
    });
    if (removed) touch();
    return removed;
  }

  function recordExam(result) {
    if (!current) return;
    current.exams.unshift(result);
    current.exams = current.exams.slice(0, 50); // keep history bounded
    touch();
  }

  function summary() {
    if (!current) return { seen: 0, failed: 0, mastered: 0, exams: [] };
    var ids = Object.keys(current.answers);
    var mastered = ids.filter(function (id) { return current.answers[id].streak >= MASTERY; });
    return { seen: ids.length, failed: failedIds().length, mastered: mastered.length, exams: current.exams || [] };
  }

  function getPref(key, fallback) {
    var p = readJSON(PREFS, {});
    return Object.prototype.hasOwnProperty.call(p, key) ? p[key] : fallback;
  }
  function setPref(key, value) {
    var p = readJSON(PREFS, {});
    p[key] = value;
    writeRaw(PREFS, JSON.stringify(p));
  }

  function exportJSON() {
    return JSON.stringify({ format: 'theory-test-progress', version: 1, profile: current }, null, 2);
  }

  // Loads a previously exported profile as the current session and pushes it up,
  // so it becomes the server copy for that nickname.
  function importJSON(text) {
    var parsed = JSON.parse(text);
    var p = parsed && parsed.profile;
    if (!p || !p.name || typeof p.answers !== 'object') throw new Error('That file is not a progress export.');
    p.name = normalize(p.name);
    begin(p);
    touch();
    return p.name;
  }

  return {
    MASTERY: MASTERY,
    storageAvailable: available,
    login: login,
    logout: logout,
    listProfiles: listProfiles,
    forgetProfile: forgetProfile,
    currentName: currentName,
    recordAnswer: recordAnswer,
    failedIds: failedIds,
    seenIds: seenIds,
    prune: prune,
    recordExam: recordExam,
    summary: summary,
    getPref: getPref,
    setPref: setPref,
    exportJSON: exportJSON,
    importJSON: importJSON
  };
})();
