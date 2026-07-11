/* ===================================================================
   ECDIS ORACLE - M.CT.  |  Application logic
   =================================================================== */

const CONFIG = {
  TOTAL_QUESTIONS: 50,
  TIME_LIMIT_SEC: 40 * 60,
  PASS_MARK: 40,
  DIFFICULTY_TARGET: { Easy: 10, Medium: 33, Hard: 7 }, // sums to 50
  RANK_OPTIONS: ["MASTER", "CHIEF OFF", "2 OFF", "3 OFF", "DECK CADET", "SHORE MANAGER"],
  // Optional: paste a Google Apps Script Web App URL here to also log every
  // attempt to a shared Google Sheet (works across devices). Leave blank to
  // rely on this browser's local storage only. See README.md.
  REMOTE_WEBHOOK_URL: "",
  STORAGE_KEY: "ecdis_oracle_attempts_v1"
};

// ---------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function groupBy(arr, keyFn) {
  const out = {};
  for (const item of arr) {
    const k = keyFn(item);
    (out[k] = out[k] || []).push(item);
  }
  return out;
}

function fmtTime(totalSec) {
  const m = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const s = Math.floor(totalSec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function fmtDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${s}s`;
}

// Pick `count` questions from `pool`, spreading across topics via round-robin.
function pickTopicBalanced(pool, count) {
  const byTopic = groupBy(pool, q => q.topic);
  const topicKeys = shuffle(Object.keys(byTopic));
  topicKeys.forEach(k => (byTopic[k] = shuffle(byTopic[k])));

  const picked = [];
  let round = 0;
  while (picked.length < count) {
    let progressedThisRound = false;
    for (const k of topicKeys) {
      if (picked.length >= count) break;
      const bucket = byTopic[k];
      if (bucket.length > round) {
        picked.push(bucket[round]);
        progressedThisRound = true;
      }
    }
    round++;
    if (!progressedThisRound) break; // pool exhausted
  }
  return picked;
}

// Build a difficulty-tag sequence with no run longer than 2 of the same
// difficulty in a row, so easy/medium/hard genuinely interleave.
function buildDifficultySequence(counts) {
  const remaining = { ...counts };
  const seq = [];
  let last = null, lastRun = 0;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  while (seq.length < total) {
    const candidates = Object.keys(remaining)
      .filter(k => remaining[k] > 0)
      .sort((a, b) => remaining[b] - remaining[a]);

    let choice = candidates.find(c => !(c === last && lastRun >= 2));
    if (!choice) choice = candidates[0]; // forced repeat if no alternative left

    seq.push(choice);
    remaining[choice]--;
    if (choice === last) lastRun++; else { last = choice; lastRun = 1; }
  }
  return seq;
}

function selectTestQuestions(bank) {
  const byDifficulty = groupBy(bank, q => q.difficulty);
  const selectedByDifficulty = {};
  for (const diff of Object.keys(CONFIG.DIFFICULTY_TARGET)) {
    const pool = byDifficulty[diff] || [];
    const target = Math.min(CONFIG.DIFFICULTY_TARGET[diff], pool.length);
    selectedByDifficulty[diff] = pickTopicBalanced(pool, target);
  }

  const actualCounts = {};
  for (const diff of Object.keys(selectedByDifficulty)) {
    actualCounts[diff] = selectedByDifficulty[diff].length;
  }

  const sequence = buildDifficultySequence(actualCounts);
  const cursors = { Easy: 0, Medium: 0, Hard: 0 };
  const final = sequence.map(diff => {
    const q = selectedByDifficulty[diff][cursors[diff]++];
    return q;
  });
  return final;
}

// ---------------------------------------------------------------
// State
// ---------------------------------------------------------------
const state = {
  candidate: { hkid: "", fullName: "", rank: "" },
  questions: [],
  answers: [],      // array of arrays of selected letters, index-aligned with questions
  currentIndex: 0,
  startTime: null,
  timerInterval: null,
  submitted: false
};

// ---------------------------------------------------------------
// View management
// ---------------------------------------------------------------
const views = ["view-landing", "view-register", "view-quiz", "view-results"];
function showView(id) {
  views.forEach(v => document.getElementById(v).classList.toggle("hidden", v !== id));
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------
// Landing -> Register
// ---------------------------------------------------------------
document.getElementById("btn-register").addEventListener("click", () => {
  showView("view-register");
});

// ---------------------------------------------------------------
// Registration
// ---------------------------------------------------------------
const hkidInput = document.getElementById("input-hkid");
hkidInput.addEventListener("input", () => {
  hkidInput.value = hkidInput.value.replace(/[^0-9]/g, "");
});

document.getElementById("form-register").addEventListener("submit", e => {
  e.preventDefault();
  const hkid = document.getElementById("input-hkid").value.trim();
  const fullName = document.getElementById("input-fullname").value.trim();
  const rank = document.getElementById("input-rank").value;

  let valid = true;
  toggleFieldError("field-hkid", !(hkid.length >= 4));
  toggleFieldError("field-fullname", !(fullName.length >= 2));
  toggleFieldError("field-rank", !rank);
  if (!(hkid.length >= 4)) valid = false;
  if (!(fullName.length >= 2)) valid = false;
  if (!rank) valid = false;
  if (!valid) return;

  state.candidate = { hkid, fullName, rank };
  startTest();
});

function toggleFieldError(fieldId, isInvalid) {
  document.getElementById(fieldId).classList.toggle("invalid", isInvalid);
}

// ---------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------
function startTest() {
  state.questions = selectTestQuestions(QUESTION_BANK);
  state.answers = state.questions.map(() => []);
  state.currentIndex = 0;
  state.startTime = Date.now();
  state.submitted = false;

  buildRouteTrack();
  renderQuestion();
  showView("view-quiz");
  startTimer();
}

function buildRouteTrack() {
  const track = document.getElementById("route-track");
  track.innerHTML = "";
  state.questions.forEach((_, i) => {
    const el = document.createElement("div");
    el.className = "wp";
    el.dataset.idx = i;
    track.appendChild(el);
  });
}

function updateRouteTrack() {
  const track = document.getElementById("route-track");
  [...track.children].forEach((el, i) => {
    el.classList.toggle("answered", state.answers[i].length > 0);
    el.classList.toggle("current", i === state.currentIndex);
  });
}

function renderQuestion() {
  const q = state.questions[state.currentIndex];
  const total = state.questions.length;
  document.getElementById("q-counter").innerHTML =
    `QUESTION <b>${state.currentIndex + 1}</b> / ${total}`;

  document.getElementById("q-topic").textContent = q.topic;
  const diffBadge = document.getElementById("q-diff");
  diffBadge.textContent = q.difficulty;
  diffBadge.className = "diff-badge diff-" + q.difficulty;

  document.getElementById("q-text").textContent = q.question;

  const isMulti = q.correct.length > 1;
  document.getElementById("q-multi-flag").classList.toggle("hidden", !isMulti);

  const optWrap = document.getElementById("q-options");
  optWrap.innerHTML = "";
  const letters = Object.keys(q.options);
  const selected = new Set(state.answers[state.currentIndex]);

  letters.forEach(letter => {
    const optDiv = document.createElement("label");
    optDiv.className = "option" + (selected.has(letter) ? " selected" : "");
    optDiv.innerHTML = `
      <input type="${isMulti ? "checkbox" : "radio"}" name="opt" value="${letter}" ${selected.has(letter) ? "checked" : ""}>
      <span class="opt-letter">${letter}.</span>
      <span class="opt-text">${escapeHtml(q.options[letter])}</span>
    `;
    const input = optDiv.querySelector("input");
    input.addEventListener("change", () => onOptionChange(letter, isMulti));
    optWrap.appendChild(optDiv);
  });

  document.getElementById("btn-back").disabled = state.currentIndex === 0;
  const isLast = state.currentIndex === total - 1;
  document.getElementById("btn-next").classList.toggle("hidden", isLast);
  document.getElementById("btn-submit").classList.toggle("hidden", !isLast);

  updateRouteTrack();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function onOptionChange(letter, isMulti) {
  const idx = state.currentIndex;
  if (isMulti) {
    const set = new Set(state.answers[idx]);
    if (set.has(letter)) set.delete(letter); else set.add(letter);
    state.answers[idx] = [...set];
  } else {
    state.answers[idx] = [letter];
  }
  renderQuestion();
}

document.getElementById("btn-next").addEventListener("click", () => {
  if (state.currentIndex < state.questions.length - 1) {
    state.currentIndex++;
    renderQuestion();
  }
});
document.getElementById("btn-back").addEventListener("click", () => {
  if (state.currentIndex > 0) {
    state.currentIndex--;
    renderQuestion();
  }
});
document.getElementById("btn-submit").addEventListener("click", () => finishTest(false));

// ---------------------------------------------------------------
// Timer
// ---------------------------------------------------------------
function startTimer() {
  const timerEl = document.getElementById("timer");
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    const remaining = CONFIG.TIME_LIMIT_SEC - elapsed;
    if (remaining <= 0) {
      timerEl.innerHTML = `<span class="dot"></span> 00:00`;
      finishTest(true);
      return;
    }
    timerEl.innerHTML = `<span class="dot"></span> ${fmtTime(remaining)}`;
    timerEl.classList.toggle("low", remaining <= 5 * 60);
  }, 500);
}

// ---------------------------------------------------------------
// Scoring & submission
// ---------------------------------------------------------------
function computeScore() {
  let correctCount = 0;
  state.questions.forEach((q, i) => {
    const given = [...state.answers[i]].sort().join(",");
    const correct = [...q.correct].sort().join(",");
    if (given && given === correct) correctCount++;
  });
  return correctCount;
}

function finishTest(auto) {
  if (state.submitted) return;
  state.submitted = true;
  clearInterval(state.timerInterval);

  const elapsedSec = Math.min(
    CONFIG.TIME_LIMIT_SEC,
    Math.floor((Date.now() - state.startTime) / 1000)
  );
  const score = computeScore();
  const pass = score >= CONFIG.PASS_MARK;
  const completedAt = new Date();

  const attempt = {
    hkid: state.candidate.hkid,
    fullName: state.candidate.fullName,
    rank: state.candidate.rank,
    score,
    total: state.questions.length,
    pass,
    autoSubmitted: auto,
    timeTakenSec: elapsedSec,
    completedAtISO: completedAt.toISOString(),
    completedAtLocal: completedAt.toLocaleString()
  };

  saveAttempt(attempt);
  renderResults(attempt, auto);
  generatePdf(attempt);
  showView("view-results");
}

function saveAttempt(attempt) {
  try {
    const existing = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY) || "[]");
    existing.push(attempt);
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(existing));
  } catch (e) {
    console.error("Local save failed", e);
  }

  if (CONFIG.REMOTE_WEBHOOK_URL) {
    fetch(CONFIG.REMOTE_WEBHOOK_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attempt)
    }).catch(() => {});
  }
}

function renderResults(attempt, auto) {
  const badge = document.getElementById("result-badge");
  badge.textContent = attempt.pass ? "PASS" : "FAIL";
  badge.className = "result-badge " + (attempt.pass ? "pass" : "fail");

  document.getElementById("result-score").innerHTML =
    `${attempt.score}<span>/${attempt.total}</span>`;

  document.getElementById("result-autosubmit").classList.toggle("hidden", !auto);

  document.getElementById("result-details").innerHTML = `
    <div class="result-item"><div class="k">HKID</div><div class="v">${escapeHtml(attempt.hkid)}</div></div>
    <div class="result-item"><div class="k">Full Name</div><div class="v">${escapeHtml(attempt.fullName)}</div></div>
    <div class="result-item"><div class="k">Rank</div><div class="v">${escapeHtml(attempt.rank)}</div></div>
    <div class="result-item"><div class="k">Time Taken</div><div class="v">${fmtDuration(attempt.timeTakenSec)}</div></div>
    <div class="result-item"><div class="k">Completed</div><div class="v">${attempt.completedAtLocal}</div></div>
    <div class="result-item"><div class="k">Pass Mark</div><div class="v">${CONFIG.PASS_MARK} / ${attempt.total}</div></div>
  `;
}

// ---------------------------------------------------------------
// PDF generation
// ---------------------------------------------------------------
function generatePdf(attempt) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFillColor(7, 21, 34);
    doc.rect(0, 0, pageWidth, 90, "F");
    doc.setTextColor(43, 217, 168);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("ECDIS ORACLE - M.CT.", 40, 40);
    doc.setTextColor(220, 230, 235);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("Mandatory Computer-Based Test - Result Report", 40, 62);

    let y = 130;
    doc.setTextColor(20, 20, 20);
    const row = (label, value) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(label, 40, y);
      doc.setFont("helvetica", "normal");
      doc.text(String(value), 220, y);
      y += 28;
    };

    row("HKID:", attempt.hkid);
    row("Full Name:", attempt.fullName);
    row("Rank:", attempt.rank);
    row("Score Secured:", `${attempt.score} / ${attempt.total}`);
    row("Result:", attempt.pass ? "PASS" : "FAIL");
    row("Passing Criteria:", `Minimum ${CONFIG.PASS_MARK} / ${attempt.total} correct`);
    row("Time Taken:", fmtDuration(attempt.timeTakenSec) + (attempt.autoSubmitted ? "  (auto-submitted at 40:00)" : ""));
    row("Date & Local Time:", attempt.completedAtLocal);

    y += 10;
    doc.setDrawColor(200, 200, 200);
    doc.line(40, y, pageWidth - 40, y);
    y += 26;

    doc.setFontSize(28);
    doc.setFont("helvetica", "bold");
    if (attempt.pass) doc.setTextColor(30, 140, 100);
    else doc.setTextColor(200, 40, 40);
    doc.text(attempt.pass ? "RESULT: PASS" : "RESULT: FAIL", 40, y);

    y += 40;
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.setFont("helvetica", "normal");
    doc.text("This is an automatically generated report from the ECDIS ORACLE - M.CT. assessment tool.", 40, y);

    const fname = `ECDIS_ORACLE_MCT_${attempt.hkid || "candidate"}.pdf`;
    doc.save(fname);
  } catch (e) {
    console.error("PDF generation failed", e);
  }
}

// ---------------------------------------------------------------
// Populate rank dropdown & init
// ---------------------------------------------------------------
(function init() {
  const select = document.getElementById("input-rank");
  CONFIG.RANK_OPTIONS.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r; opt.textContent = r;
    select.appendChild(opt);
  });

  // Warn before leaving mid-test
  window.addEventListener("beforeunload", e => {
    if (state.startTime && !state.submitted) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
})();
