// All reads/writes of user progress go through this module. Nothing else in the
// app touches localStorage directly, so swapping in a real backend later means
// rewriting this file and nothing else.
window.Store = (function () {
  var PROFILES = 'tt.profiles';
  var CURRENT = 'tt.current';
  var DATA = 'tt.data.';
  // Session setup choices. Device-level rather than per-profile: they describe
  // how you like to study on this device, not what you have learned.
  var PREFS = 'tt.prefs';

  // A question leaves the failed bank after this many correct answers in a row,
  // so a lucky guess on a 1-in-4 multiple choice doesn't clear it.
  var MASTERY = 2;

  var available = (function () {
    try {
      localStorage.setItem('tt.probe', '1');
      localStorage.removeItem('tt.probe');
      return true;
    } catch (e) {
      return false; // Private browsing, or storage disabled.
    }
  })();

  var memory = {}; // Fallback so the app still runs (unsaved) without storage.

  function readRaw(key) {
    if (!available) return memory[key] || null;
    return localStorage.getItem(key);
  }

  function writeRaw(key, value) {
    if (!available) { memory[key] = value; return; }
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // Quota exceeded. Rare here (progress is a few KB) but fail loudly rather
      // than silently dropping the user's history.
      alert('Could not save progress: browser storage is full.');
    }
  }

  function readJSON(key, fallback) {
    var raw = readRaw(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function blank(name) {
    return {
      name: name,
      created: Date.now(),
      // qid -> { c: times correct, w: times wrong, streak: correct in a row }
      answers: {},
      exams: []
    };
  }

  function listProfiles() { return readJSON(PROFILES, []); }

  function saveProfiles(names) { writeRaw(PROFILES, JSON.stringify(names)); }

  function createProfile(name) {
    name = String(name || '').trim();
    if (!name) throw new Error('Please enter a name.');
    if (name.length > 30) throw new Error('That name is a bit long.');
    var names = listProfiles();
    // Case-insensitive check so "Sam" and "sam" don't become two profiles.
    var clash = names.some(function (n) { return n.toLowerCase() === name.toLowerCase(); });
    if (clash) throw new Error('That name is already taken on this device.');
    names.push(name);
    saveProfiles(names);
    writeRaw(DATA + name, JSON.stringify(blank(name)));
    return name;
  }

  function deleteProfile(name) {
    saveProfiles(listProfiles().filter(function (n) { return n !== name; }));
    if (available) localStorage.removeItem(DATA + name); else delete memory[DATA + name];
    if (currentName() === name) setCurrent(null);
  }

  function currentName() { return readRaw(CURRENT); }

  function setCurrent(name) {
    if (name === null) {
      if (available) localStorage.removeItem(CURRENT); else delete memory[CURRENT];
    } else {
      writeRaw(CURRENT, name);
    }
  }

  function data() {
    var name = currentName();
    if (!name) return null;
    return readJSON(DATA + name, blank(name));
  }

  function save(d) { writeRaw(DATA + d.name, JSON.stringify(d)); }

  // Records one answer and returns the updated per-question record.
  function recordAnswer(qid, correct) {
    var d = data();
    if (!d) return null;
    var rec = d.answers[qid] || { c: 0, w: 0, streak: 0 };
    if (correct) { rec.c++; rec.streak++; } else { rec.w++; rec.streak = 0; }
    d.answers[qid] = rec;
    save(d);
    return rec;
  }

  // The failed bank: anything answered wrong at least once that hasn't since
  // been answered correctly MASTERY times in a row.
  // Ids are kept as strings - the current source uses ids like "ABMW0425RU19".
  function failedIds() {
    var d = data();
    if (!d) return [];
    return Object.keys(d.answers).filter(function (id) {
      var r = d.answers[id];
      return r.w > 0 && r.streak < MASTERY;
    });
  }

  // Drops progress for questions that no longer exist. Without this, swapping
  // the question set leaves orphaned answers that inflate the stats and put
  // unresolvable ids into the failed bank.
  function prune(validIds) {
    var d = data();
    if (!d) return 0;
    var valid = {};
    validIds.forEach(function (id) { valid[id] = true; });
    var removed = 0;
    Object.keys(d.answers).forEach(function (id) {
      if (!valid[id]) { delete d.answers[id]; removed++; }
    });
    if (removed) save(d);
    return removed;
  }

  function recordExam(result) {
    var d = data();
    if (!d) return;
    d.exams.unshift(result);
    d.exams = d.exams.slice(0, 50); // Keep history bounded.
    save(d);
  }

  function summary() {
    var d = data();
    if (!d) return { seen: 0, failed: 0, mastered: 0, exams: [] };
    var ids = Object.keys(d.answers);
    var mastered = ids.filter(function (id) { return d.answers[id].streak >= MASTERY; });
    return {
      seen: ids.length,
      failed: failedIds().length,
      mastered: mastered.length,
      exams: d.exams || []
    };
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
    var d = data();
    return JSON.stringify({ format: 'theory-test-progress', version: 1, profile: d }, null, 2);
  }

  // Imports a previously exported profile. Renames on collision rather than
  // overwriting, so an import can never destroy existing progress.
  function importJSON(text) {
    var parsed = JSON.parse(text);
    var p = parsed && parsed.profile;
    if (!p || !p.name || typeof p.answers !== 'object') {
      throw new Error('That file is not a progress export.');
    }
    var name = p.name;
    var taken = listProfiles().map(function (n) { return n.toLowerCase(); });
    var n = 2;
    while (taken.indexOf(name.toLowerCase()) !== -1) name = p.name + ' (' + n++ + ')';
    p.name = name;
    var names = listProfiles();
    names.push(name);
    saveProfiles(names);
    save(p);
    return name;
  }

  return {
    MASTERY: MASTERY,
    storageAvailable: available,
    listProfiles: listProfiles,
    createProfile: createProfile,
    deleteProfile: deleteProfile,
    currentName: currentName,
    setCurrent: setCurrent,
    recordAnswer: recordAnswer,
    failedIds: failedIds,
    prune: prune,
    recordExam: recordExam,
    summary: summary,
    getPref: getPref,
    setPref: setPref,
    exportJSON: exportJSON,
    importJSON: importJSON
  };
})();
