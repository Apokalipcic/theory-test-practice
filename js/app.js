(function () {
  'use strict';

  var EXAM_SIZE = 40;
  var EXAM_MINUTES = 45;
  var EXAM_PASS = 35;

  // Practice lengths offered on the setup screen; 0 means "every question".
  var PRACTICE_SIZES = [10, 20, 40, 100, 0];

  var byId = function (id) { return document.getElementById(id); };
  var questionsById = {};
  window.QUESTIONS.forEach(function (q) { questionsById[q.id] = q; });

  // Current session: { mode, queue, index, answers, startedAt, deadline }
  var session = null;
  var tick = null;

  /* ---------- helpers ---------- */

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function show(id) {
    ['screen-profiles', 'screen-home', 'screen-setup', 'screen-quiz', 'screen-result']
      .forEach(function (s) { byId(s).hidden = (s !== id); });
    window.scrollTo(0, 0);
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  // Questions the current profile has never answered.
  function unseenQuestions() {
    var seen = {};
    Store.seenIds().forEach(function (id) { seen[id] = true; });
    return window.QUESTIONS.filter(function (q) { return !seen[q.id]; });
  }

  /* ---------- profiles ---------- */

  var loggingIn = false;

  // Fetches a nickname's progress from the server (or this device's cache when
  // offline) and, on success, shows the home screen. onError gets the failure.
  function loginAs(name, onError) {
    if (loggingIn) return;
    loggingIn = true;
    Store.login(name, function (err) {
      loggingIn = false;
      if (err) { if (onError) onError(err); else alert(err.message); return; }
      // The question set has been replaced once already; clear out progress that
      // refers to questions no longer present before showing any stats.
      Store.prune(Object.keys(questionsById));
      renderHome();
    });
  }

  function renderProfiles() {
    var list = byId('profile-list');
    clear(list);
    byId('new-profile-name').value = '';
    byId('profile-error').hidden = true;

    // Kept in sync with the data rather than hardcoded in the markup.
    byId('question-count').textContent = window.QUESTIONS.length;

    var recent = Store.listProfiles();
    if (recent.length) {
      var cap = document.createElement('p');
      cap.className = 'label';
      cap.textContent = 'Used on this device';
      list.appendChild(cap);
    }
    recent.forEach(function (name) {
      var row = document.createElement('div');
      row.className = 'profile-row';
      var b = document.createElement('button');
      b.className = 'btn';
      b.textContent = name;
      b.onclick = function () { loginAs(name); };
      row.appendChild(b);
      list.appendChild(row);
    });

    byId('storage-warning').hidden = Store.storageAvailable;
    show('screen-profiles');
  }

  byId('new-profile').onsubmit = function (e) {
    e.preventDefault();
    var err = byId('profile-error');
    err.hidden = true;
    loginAs(byId('new-profile-name').value, function (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    });
  };

  byId('import-btn').onclick = function () { byId('import-file').click(); };

  byId('import-file').onchange = function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var err = byId('profile-error');
      try {
        Store.importJSON(reader.result);
        err.hidden = true;
        Store.prune(Object.keys(questionsById));
        renderHome();
      } catch (ex) {
        err.textContent = 'Import failed: ' + ex.message;
        err.hidden = false;
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Allow re-importing the same file.
  };

  /* ---------- home ---------- */

  function renderHome() {
    var s = Store.summary();
    byId('who-name').textContent = Store.currentName();

    var stats = byId('stats');
    clear(stats);
    [
      [s.seen, 'seen of ' + window.QUESTIONS.length],
      [s.mastered, 'mastered'],
      [s.failed, 'in failed bank']
    ].forEach(function (pair) {
      var d = document.createElement('div');
      d.className = 'stat';
      var b = document.createElement('b');
      b.textContent = pair[0];
      var sp = document.createElement('span');
      sp.textContent = pair[1];
      d.appendChild(b); d.appendChild(sp);
      stats.appendChild(d);
    });

    var pill = byId('failed-count');
    pill.textContent = s.failed;
    pill.className = s.failed ? 'pill' : 'pill zero';

    renderExamHistory(s.exams);
    show('screen-home');
  }

  function renderExamHistory(exams) {
    var box = byId('exam-history');
    clear(box);
    if (!exams.length) return;

    box.className = 'exam-log';
    var h = document.createElement('h3');
    h.textContent = 'Recent mock exams';
    box.appendChild(h);

    var ul = document.createElement('ul');
    exams.slice(0, 5).forEach(function (e) {
      var li = document.createElement('li');
      var when = document.createElement('span');
      when.textContent = new Date(e.date).toLocaleDateString();
      var score = document.createElement('span');
      score.className = e.passed ? 'pass' : 'fail';
      score.textContent = e.score + '/' + e.total + (e.passed ? ' PASS' : ' FAIL');
      li.appendChild(when); li.appendChild(score);
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }

  byId('switch-profile').onclick = function () { Store.logout(); renderProfiles(); };

  byId('export-btn').onclick = function () {
    var blob = new Blob([Store.exportJSON()], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'theory-progress-' + Store.currentName().replace(/\s+/g, '-') + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  byId('delete-btn').onclick = function () {
    var name = Store.currentName();
    if (!confirm('Remove "' + name + '" from this device?\n\n' +
      'Its progress stays saved under this nickname — log in again on any ' +
      'device to bring it back.')) return;
    Store.forgetProfile(name);
    renderProfiles();
  };

  /* ---------- starting a session ---------- */

  var pendingMode = null;

  Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (btn) {
    btn.onclick = function () {
      var mode = btn.getAttribute('data-mode');
      // The failed bank has nothing to configure - it drills whatever is in it.
      if (mode === 'failed') start('failed'); else openSetup(mode);
    };
  });

  function openSetup(mode) {
    pendingMode = mode;
    var isPractice = mode === 'practice';

    byId('setup-title').textContent = isPractice ? 'Practice' : 'Mock exam';
    byId('setup-sub').textContent = isPractice
      ? 'Shuffled questions at your own pace, with the answer and explanation after each one.'
      : EXAM_SIZE + ' questions, ' + EXAM_MINUTES + ' minutes, pass mark ' + EXAM_PASS + '.';

    byId('setup-length').hidden = !isPractice;
    byId('setup-unseen').hidden = !isPractice;
    byId('setup-feedback').hidden = isPractice;

    if (isPractice) {
      renderLengthChips();
      renderUnseenToggle();
    } else {
      byId('exam-feedback').checked = Store.getPref('examFeedback', false);
    }

    show('screen-setup');
  }

  function renderLengthChips() {
    var chosen = Store.getPref('practiceSize', 20);
    var box = byId('length-chips');
    clear(box);

    PRACTICE_SIZES.forEach(function (n) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (n === chosen ? ' on' : '');
      b.textContent = n === 0 ? 'All ' + window.QUESTIONS.length : String(n);
      b.onclick = function () {
        Store.setPref('practiceSize', n);
        renderLengthChips();
      };
      box.appendChild(b);
    });
  }

  function renderUnseenToggle() {
    var box = byId('setup-unseen');
    var check = byId('practice-unseen');
    var left = unseenQuestions().length;

    check.checked = Store.getPref('practiceUnseenOnly', false);
    // Nothing new to draw from disables the option rather than starting an
    // empty session; it re-enables itself once the set changes.
    check.disabled = left === 0;
    box.classList.toggle('disabled', left === 0);
    if (left === 0) check.checked = false;

    byId('practice-unseen-sub').textContent = left === 0
      ? 'You have already seen every question at least once.'
      : left + ' of ' + window.QUESTIONS.length + ' still unseen. ' +
        'Fewer than your chosen count just gives you all that are left.';
  }

  byId('setup-back').onclick = function () { pendingMode = null; renderHome(); };

  byId('setup-start').onclick = function () {
    if (pendingMode === 'exam') {
      Store.setPref('examFeedback', byId('exam-feedback').checked);
    } else if (pendingMode === 'practice') {
      Store.setPref('practiceUnseenOnly', byId('practice-unseen').checked);
    }
    start(pendingMode);
  };

  function start(mode) {
    var queue;

    if (mode === 'failed') {
      var ids = Store.failedIds();
      if (!ids.length) {
        alert('Your failed bank is empty. Answer some questions first — anything you get wrong lands here.');
        return;
      }
      // Defensive: ignore ids from a question set this build no longer has.
      queue = shuffle(ids)
        .map(function (id) { return questionsById[id]; })
        .filter(Boolean);
      if (!queue.length) {
        alert('Your failed bank refers to questions that are no longer in this app.');
        return;
      }
    } else if (mode === 'exam') {
      queue = shuffle(window.QUESTIONS).slice(0, EXAM_SIZE);
    } else {
      var size = Store.getPref('practiceSize', 20);
      var pool = window.QUESTIONS;
      if (Store.getPref('practiceUnseenOnly', false)) {
        pool = unseenQuestions();
        if (!pool.length) {
          alert('You have already seen every question at least once. Turn off ' +
            '"only questions I haven\'t seen yet" to keep practising, or drill ' +
            'the failed bank.');
          return;
        }
      }
      queue = shuffle(pool);
      if (size > 0) queue = queue.slice(0, size);
    }

    session = {
      mode: mode,
      queue: queue,
      index: 0,
      answers: [],           // parallel to queue: chosen option index, or null
      // Exams normally hide right/wrong until the end; this opts into showing it.
      feedback: mode === 'exam' ? Store.getPref('examFeedback', false) : true,
      startedAt: Date.now(),
      deadline: mode === 'exam' ? Date.now() + EXAM_MINUTES * 60000 : null
    };

    byId('timer').hidden = mode !== 'exam';
    if (mode === 'exam') startTimer(); else stopTimer();

    renderQuestion();
    show('screen-quiz');
  }

  function startTimer() {
    stopTimer();
    var el = byId('timer');
    var update = function () {
      var left = Math.max(0, session.deadline - Date.now());
      var mins = Math.floor(left / 60000);
      var secs = Math.floor((left % 60000) / 1000);
      el.textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
      el.className = left < 5 * 60000 ? 'timer low' : 'timer';
      if (left <= 0) { stopTimer(); finishExam(true); }
    };
    update();
    tick = setInterval(update, 1000);
  }

  function stopTimer() {
    if (tick) { clearInterval(tick); tick = null; }
  }

  /* ---------- the quiz ---------- */

  function renderQuestion() {
    var q = session.queue[session.index];
    var isExam = session.mode === 'exam';
    var isReview = session.mode === 'review';

    byId('progress-label').textContent =
      'Question ' + (session.index + 1) + ' of ' + session.queue.length;
    byId('progressfill').style.width =
      ((session.index) / session.queue.length * 100) + '%';

    byId('q-heading').textContent = q.heading === 'Uncategorized' ? '' : q.heading;
    byId('q-text').textContent = q.q;

    var img = byId('q-image');
    if (q.image) { img.src = q.image; img.hidden = false; } else { img.hidden = true; img.removeAttribute('src'); }

    var box = byId('q-options');
    clear(box);

    byId('q-feedback').hidden = true;
    byId('next').hidden = true;

    q.options.forEach(function (text, i) {
      var b = document.createElement('button');
      b.className = 'option';
      b.type = 'button';
      b.textContent = text;
      b.onclick = function () { choose(i); };
      box.appendChild(b);
    });

    if (isReview) {
      revealReview();
    } else if (isExam && session.answers[session.index] != null) {
      // Returning to an already-answered exam question.
      var prev = session.answers[session.index];
      if (session.feedback) reveal(prev, q); else markChosen(prev);
      byId('next').hidden = false;
    }
  }

  function optionButtons() {
    return Array.prototype.slice.call(byId('q-options').children);
  }

  function markChosen(i) {
    optionButtons().forEach(function (b, n) {
      if (n === i) b.classList.add('chosen');
    });
    byId('next').textContent = lastQuestion() ? 'Finish' : 'Next';
  }

  function lastQuestion() { return session.index === session.queue.length - 1; }

  function choose(i) {
    var q = session.queue[session.index];
    var isExam = session.mode === 'exam';
    session.answers[session.index] = i;

    if (isExam && !session.feedback) {
      // Real-exam behaviour: record the choice silently and stay changeable.
      optionButtons().forEach(function (b) { b.classList.remove('chosen'); });
      markChosen(i);
      byId('next').hidden = false;
      return;
    }

    reveal(i, q);

    // An exam scores and records every answer together in finishExam, so
    // recording here too would count each exam question twice.
    // Only a correct answer in the failed-bank drill clears a question from it.
    if (!isExam) Store.recordAnswer(q.id, i === q.answer, session.mode === 'failed');

    byId('next').textContent = lastQuestion() ? 'Finish' : 'Next';
    byId('next').hidden = false;
  }

  // Locks the options, colours the right and wrong ones, and shows the
  // explanation. Shared by practice, an exam with feedback on, and review.
  function reveal(chosen, q) {
    optionButtons().forEach(function (b, n) {
      b.disabled = true;
      if (n === q.answer) {
        b.classList.add('correct');
        b.appendChild(mark('✓'));
      } else if (n === chosen) {
        b.classList.add('wrong');
        b.appendChild(mark('✗'));
      }
    });

    var correct = chosen === q.answer;
    var verdict = byId('q-verdict');
    verdict.textContent = chosen == null ? 'You left this blank'
      : correct ? 'Correct' : 'Not quite';
    verdict.className = 'verdict ' + (correct ? 'good' : 'bad');
    byId('q-explanation').textContent = q.explanation || '';
    byId('q-feedback').hidden = false;
  }

  function mark(ch) {
    var s = document.createElement('span');
    s.className = 'mark';
    s.textContent = ch;
    return s;
  }

  // Review mode replays a finished exam's wrong answers, fully revealed.
  function revealReview() {
    var q = session.queue[session.index];
    var chosen = session.answers[session.index];
    reveal(chosen, q);
    var verdict = byId('q-verdict');
    verdict.textContent = chosen == null ? 'You left this blank' : 'You answered incorrectly';
    verdict.className = 'verdict bad';
    byId('next').textContent = lastQuestion() ? 'Done' : 'Next';
    byId('next').hidden = false;
  }

  byId('next').onclick = function () {
    if (lastQuestion()) {
      if (session.mode === 'exam') finishExam(false);
      else { stopTimer(); renderHome(); }
      return;
    }
    session.index++;
    renderQuestion();
  };

  byId('quit').onclick = function () {
    if (session && session.mode === 'exam' &&
        !confirm('Leave the exam? Your answers so far will not be scored.')) return;
    stopTimer();
    session = null;
    renderHome();
  };

  /* ---------- exam scoring ---------- */

  function finishExam(timedOut) {
    stopTimer();

    var wrong = [];
    var score = 0;

    session.queue.forEach(function (q, i) {
      var chosen = session.answers[i];
      var correct = chosen === q.answer;
      if (correct) score++; else wrong.push(i);
      // Unanswered questions count as wrong, and go to the failed bank too:
      // not knowing it and not reaching it both mean more practice needed.
      Store.recordAnswer(q.id, correct);
    });

    var passed = score >= EXAM_PASS;
    Store.recordExam({
      date: Date.now(),
      score: score,
      total: session.queue.length,
      passed: passed,
      durationMs: Date.now() - session.startedAt,
      timedOut: !!timedOut
    });

    byId('result-title').textContent = passed ? 'Passed' : 'Not this time';
    var big = byId('result-score');
    big.textContent = score + ' / ' + session.queue.length;
    big.className = 'bigscore ' + (passed ? 'pass' : 'fail');

    var mins = Math.round((Date.now() - session.startedAt) / 60000);
    byId('result-detail').textContent =
      (timedOut ? 'Time ran out. ' : '') +
      'Pass mark is ' + EXAM_PASS + '. Took ' + mins + ' min. ' +
      wrong.length + ' added to your failed bank.';

    // Capture the finished exam before the review handler replaces `session`.
    var examQueue = session.queue;
    var examAnswers = session.answers;

    var reviewBtn = byId('review-wrong');
    reviewBtn.hidden = wrong.length === 0;
    reviewBtn.onclick = function () {
      session = {
        mode: 'review',
        queue: wrong.map(function (i) { return examQueue[i]; }),
        answers: wrong.map(function (i) { return examAnswers[i]; }),
        index: 0
      };
      byId('timer').hidden = true;
      renderQuestion();
      show('screen-quiz');
    };

    show('screen-result');
  }

  byId('result-home').onclick = function () { session = null; renderHome(); };

  /* ---------- boot ---------- */

  var name = Store.currentName();
  if (name) {
    // Resume the last nickname: refresh it from the server (or this device's
    // cached copy if offline), then show home. Falls back to the picker if the
    // server can't be reached and there's nothing cached.
    loginAs(name, function () { renderProfiles(); });
  } else {
    renderProfiles();
  }
})();
