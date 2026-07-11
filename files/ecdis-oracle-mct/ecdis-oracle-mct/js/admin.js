/* ===================================================================
   ECDIS ORACLE - M.CT.  |  Admin dashboard logic
   Note: this is a client-side password gate suitable for deterring
   casual access on a static site. It is NOT secure authentication —
   anyone viewing the page source can find the password check. See
   README.md for a note on stronger options if that matters to you.
   =================================================================== */

const ADMIN_PASSWORD = "CAPT.PHOTOS";
const STORAGE_KEY = "ecdis_oracle_attempts_v1";

function getAttempts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

function fmtDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${s}s`;
}

function showDashboard() {
  document.getElementById("view-login").classList.add("hidden");
  document.getElementById("view-dashboard").classList.remove("hidden");
  renderDashboard();
}

function showLogin() {
  document.getElementById("view-dashboard").classList.add("hidden");
  document.getElementById("view-login").classList.remove("hidden");
}

document.getElementById("btn-login").addEventListener("click", attemptLogin);
document.getElementById("input-password").addEventListener("keydown", e => {
  if (e.key === "Enter") attemptLogin();
});

function attemptLogin() {
  const val = document.getElementById("input-password").value;
  const field = document.getElementById("field-password");
  if (val === ADMIN_PASSWORD) {
    field.classList.remove("invalid");
    sessionStorage.setItem("ecdis_admin_ok", "1");
    showDashboard();
  } else {
    field.classList.add("invalid");
  }
}

document.getElementById("btn-logout").addEventListener("click", () => {
  sessionStorage.removeItem("ecdis_admin_ok");
  document.getElementById("input-password").value = "";
  showLogin();
});

document.getElementById("btn-clear").addEventListener("click", () => {
  if (confirm("This will permanently delete all locally stored attempt records on this device. Continue?")) {
    localStorage.removeItem(STORAGE_KEY);
    renderDashboard();
  }
});

document.getElementById("btn-export").addEventListener("click", () => {
  const attempts = getAttempts();
  if (!attempts.length) { alert("No attempts to export yet."); return; }

  const headers = ["HKID", "Full Name", "Rank", "Score", "Total", "Result", "Time Taken (sec)", "Auto-Submitted", "Completed At (Local)", "Completed At (ISO)"];
  const lines = [headers.join(",")];
  attempts.forEach(a => {
    const row = [
      csvEscape(a.hkid), csvEscape(a.fullName), csvEscape(a.rank),
      a.score, a.total, a.pass ? "PASS" : "FAIL",
      a.timeTakenSec, a.autoSubmitted ? "YES" : "NO",
      csvEscape(a.completedAtLocal), a.completedAtISO
    ];
    lines.push(row.join(","));
  });
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ECDIS_ORACLE_MCT_attempts_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

function csvEscape(str) {
  const s = String(str ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function renderDashboard() {
  const attempts = getAttempts();
  const tbody = document.getElementById("admin-tbody");
  tbody.innerHTML = "";

  attempts.slice().reverse().forEach((a, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${attempts.length - i}</td>
      <td>${escapeHtml(a.hkid)}</td>
      <td>${escapeHtml(a.fullName)}</td>
      <td>${escapeHtml(a.rank)}</td>
      <td>${a.score} / ${a.total}</td>
      <td class="${a.pass ? "pass-tag" : "fail-tag"}">${a.pass ? "PASS" : "FAIL"}</td>
      <td>${fmtDuration(a.timeTakenSec)}</td>
      <td>${a.autoSubmitted ? "YES" : "NO"}</td>
      <td>${escapeHtml(a.completedAtLocal)}</td>
    `;
    tbody.appendChild(tr);
  });

  const total = attempts.length;
  const passed = attempts.filter(a => a.pass).length;
  const failed = total - passed;
  const auto = attempts.filter(a => a.autoSubmitted).length;

  document.getElementById("stat-row").innerHTML = `
    <div class="stat-chip">Total attempts: <b>${total}</b></div>
    <div class="stat-chip">Passed: <b>${passed}</b></div>
    <div class="stat-chip">Failed: <b>${failed}</b></div>
    <div class="stat-chip">Auto-submitted: <b>${auto}</b></div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// Keep dashboard unlocked across a refresh within the same tab session
if (sessionStorage.getItem("ecdis_admin_ok") === "1") {
  showDashboard();
}
