"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const $ = (s) => document.querySelector(s);
  const timerDisplay = $(".test-timer span:last-child");
  const subjectDisplay = $(".test-subject");
  const progressLabels = document.querySelectorAll(".test-progress-label span");
  const progressFill = $(".test-progress-fill");
  const questionNumber = $(".question-number");
  const questionDifficulty = $(".question-difficulty");
  const questionTitle = $(".question-title");
  const answerOptions = $(".answer-options");
  const previousButton = $(".question-actions .btn-secondary");
  const nextButton = $(".question-actions .btn-primary");
  const palette = $(".question-palette");
  const submitButton = $(".submit-test-btn");
  if (!timerDisplay || !questionTitle || !answerOptions || !previousButton || !nextButton || !palette || !submitButton) return;
  if (!PrepifyAPI.requireAuth()) return;

  let active;
  try { active = JSON.parse(sessionStorage.getItem("prepifyActiveAttempt") || "null"); } catch (_) {}
  if (!active?.attemptId || !Array.isArray(active.questions) || !active.questions.length) {
    questionTitle.textContent = "No active test was found.";
    answerOptions.replaceChildren();
    const p = document.createElement("p"); p.textContent = "Start a practice test from the setup page first."; answerOptions.appendChild(p);
    nextButton.disabled = previousButton.disabled = submitButton.disabled = true;
    return;
  }

  const questions = active.questions;
  const total = questions.length;
  const answers = questions.map(q => {
    const saved = active.answers && active.answers[q.id];
    return saved === undefined || saved === null ? null : Number(saved);
  });
  let index = 0, submitted = false, busy = false, timer = null;
  const pendingSaves = new Set();
  const deadline = active.deadlineAt ? new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(active.deadlineAt) ? active.deadlineAt : String(active.deadlineAt).replace(' ', 'T') + 'Z').getTime() : Date.now() + Math.max(1, Number(active.settings?.durationMinutes || 30)) * 60000;
  subjectDisplay.textContent = active.settings?.subjectLabel || "Practice Test";
  palette.replaceChildren();
  const buttons = questions.map((q, i) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "palette-number"; b.textContent = String(i + 1); b.setAttribute("aria-label", `Go to question ${i + 1}`);
    b.addEventListener("click", () => { if (!submitted) { index = i; render(); } }); palette.appendChild(b); return b;
  });

  async function saveAnswer(q, selectedIndex) {
    const task = (async () => {
      await PrepifyAPI.put(`/attempts/${active.attemptId}/answer`, { questionId: Number(q.id), selectedIndex });
      active.answers = active.answers || {}; if (selectedIndex === null) delete active.answers[q.id]; else active.answers[q.id] = selectedIndex;
      sessionStorage.setItem("prepifyActiveAttempt", JSON.stringify(active));
    })();
    pendingSaves.add(task);
    try { await task; } catch (e) { PrepifyAPI.message(e); throw e; }
    finally { pendingSaves.delete(task); }
  }
  function render() {
    if (submitted) return;
    const q = questions[index];
    questionNumber.textContent = `QUESTION ${String(index + 1).padStart(2, "0")}`;
    questionDifficulty.textContent = q.difficulty || "";
    questionTitle.textContent = q.questionText || q.text || "Question text unavailable";
    answerOptions.replaceChildren();
    (Array.isArray(q.options) ? q.options : []).forEach((opt, oi) => {
      const label = document.createElement("label"); label.className = "answer-option";
      const input = document.createElement("input"); input.type = "radio"; input.name = "answer"; input.value = String(opt.index ?? oi); input.checked = answers[index] === Number(opt.index ?? oi);
      const letter = document.createElement("span"); letter.className = "answer-letter"; letter.textContent = String.fromCharCode(65 + oi);
      const text = document.createElement("span"); text.className = "answer-text"; text.textContent = opt.text ?? String(opt);
      input.addEventListener("change", async () => { answers[index] = Number(opt.index ?? oi); updateProgress(); await saveAnswer(q, answers[index]); });
      label.append(input, letter, text); answerOptions.appendChild(label);
    });
    previousButton.disabled = index === 0; nextButton.textContent = index === total - 1 ? "Review answers" : "Next question →"; updateProgress();
  }
  function updateProgress() {
    const n = answers.filter(x => x !== null).length;
    if (progressLabels[0]) progressLabels[0].textContent = `Question ${index + 1} of ${total}`;
    if (progressLabels[1]) progressLabels[1].textContent = `${n} of ${total} answered`;
    if (progressFill) progressFill.style.width = `${((index + 1) / total) * 100}%`;
    buttons.forEach((b, i) => { b.classList.toggle("current", i === index); b.classList.toggle("answered", answers[i] !== null); b.setAttribute("aria-current", i === index ? "step" : "false"); });
  }
  previousButton.addEventListener("click", () => { if (!submitted && index > 0) { index--; render(); } });
  nextButton.addEventListener("click", () => {
    if (index < total - 1) { index++; render(); return; }
    const first = answers.findIndex(x => x === null);
    if (first !== -1 && confirm(`${answers.filter(x => x === null).length} question(s) remain unanswered. Review them?`)) { index = first; render(); }
    else alert("Review complete. Use Submit Test when you are ready to finish.");
  });
  function updateTimer() {
    const sec = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    timerDisplay.textContent = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
    if (sec <= 60) timerDisplay.style.color = "#D64545";
    if (sec <= 0) { clearInterval(timer); submitTest(true); }
  }
  async function submitTest(auto = false, reason = null) {
    if (submitted || busy) return;
    if (!auto && !confirm(`Submit this test?\n\nQuestions: ${total}\nAnswered: ${answers.filter(x => x !== null).length}\nUnanswered: ${answers.filter(x => x === null).length}`)) return;
    busy = true; submitButton.disabled = true; submitButton.textContent = "Submitting…";
    try {
      // Ensure selected answers have reached the backend before final submission.
      await Promise.allSettled([...pendingSaves]);
      const result = await PrepifyAPI.post(`/attempts/${active.attemptId}/submit`, {});
      submitted = true; clearInterval(timer);
      sessionStorage.setItem("prepifyLastResult", JSON.stringify(result));
      if (reason) sessionStorage.setItem("prepifyExamViolation", reason);
      location.replace(`results.html?attemptId=${encodeURIComponent(active.attemptId)}`);
    } catch (e) { PrepifyAPI.message(e); busy = false; submitButton.disabled = false; submitButton.textContent = "Submit Test"; }
  }
  submitButton.addEventListener("click", () => submitTest(false));

  // Exam integrity controls apply to both practice/mock tests and college exams.
  // Browsers do not let a webpage disable the browser's tab strip, but switching
  // away is detected and the attempt is immediately auto-submitted server-side.
  history.pushState({ prepifyActiveTest: true }, "", location.href);
  window.addEventListener("popstate", () => {
    if (submitted) return;
    history.pushState({ prepifyActiveTest: true }, "", location.href);
    window.alert("You cannot go back or leave the test while an attempt is in progress. Submit the test or wait until its time expires.");
  });
  window.addEventListener("keydown", (event) => {
    if (submitted) return;
    const key = event.key.toLowerCase();
    if ((event.altKey && key === "arrowleft") || (event.altKey && key === "arrowright") || (event.metaKey && key === "[") || (event.key === "Backspace" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName))) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
  document.addEventListener("click", (event) => {
    if (submitted) return;
    const link = event.target.closest("a[href]");
    if (link) {
      event.preventDefault();
      event.stopPropagation();
      window.alert("Navigation is disabled while your test is in progress. Submit the test or wait until its time expires.");
    }
  }, true);
  window.addEventListener("beforeunload", (event) => {
    if (submitted) return;
    event.preventDefault();
    event.returnValue = "Your test is still in progress. Leaving may submit or interrupt your attempt.";
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && !submitted && !busy) {
      // A tab switch/minimize is treated as leaving the examination. The server
      // finalizes the attempt and the result page opens when this request completes.
      submitTest(true, "tab-switch");
    }
  });

  render(); updateTimer(); timer = setInterval(updateTimer, 1000);
});
