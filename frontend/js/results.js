"use strict";
document.addEventListener("DOMContentLoaded", async () => {
  if (!PrepifyAPI.requireAuth()) return;
  const attemptId = new URLSearchParams(location.search).get("attemptId");
  const violation = sessionStorage.getItem("prepifyExamViolation");
  if (violation) {
    sessionStorage.removeItem("prepifyExamViolation");
    const notice = document.createElement("p");
    notice.setAttribute("role", "alert");
    notice.textContent = violation === "tab-switch"
      ? "Your attempt was automatically submitted because you switched tabs or moved away from the test window."
      : "Your attempt was automatically submitted.";
    document.querySelector(".results-overview")?.prepend(notice);
  }
  const overview = document.querySelector(".results-overview");
  const scoreBox = document.querySelector(".score-placeholder");
  const scoreNote = document.querySelector(".results-score p");
  const stats = [...document.querySelectorAll(".result-stat h2")];
  const performance = document.querySelector(".performance-placeholder");
  const review = document.querySelector(".review-placeholder");
  if (!attemptId) { if (scoreNote) scoreNote.textContent = "Choose a completed attempt from your history to view its result."; return; }
  try {
    const r = await PrepifyAPI.get(`/results/${encodeURIComponent(attemptId)}`);
    if (scoreBox) { scoreBox.replaceChildren(); scoreBox.append(document.createTextNode(`${r.score ?? 0} `)); const span=document.createElement("span"); span.textContent=`/ ${r.maxScore ?? 0}`; scoreBox.appendChild(span); }
    if (scoreNote) scoreNote.textContent = `${r.percentage ?? 0}% overall`; 
    if (stats[0]) stats[0].textContent = String(r.correct ?? 0);
    if (stats[1]) stats[1].textContent = String(r.incorrect ?? 0);
    if (stats[2]) stats[2].textContent = String(r.unanswered ?? 0);
    if (performance) { performance.replaceChildren(); const p=document.createElement("p"); p.textContent=`Score: ${r.score ?? 0} / ${r.maxScore ?? 0} (${r.percentage ?? 0}%).`; performance.appendChild(p); }
    if (review) {
      review.replaceChildren();
      if (!r.reviewAvailable) { const p=document.createElement("p"); p.textContent="Answer review will be available after the examination window closes."; review.appendChild(p); return; }
      if (!Array.isArray(r.review) || !r.review.length) { const p=document.createElement("p"); p.textContent="No question review is available for this attempt."; review.appendChild(p); return; }
      r.review.forEach((q,i)=>{
        const article=document.createElement("article"); article.className="question-review-item";
        const h=document.createElement("h3"); h.textContent=`Question ${i+1}: ${q.questionText || ""}`; article.appendChild(h);
        const p=document.createElement("p"); const selected=(q.options||[]).find(o=>Number(o.index)===Number(q.selectedIndex)); p.textContent=`Your answer: ${selected?.text ?? (q.selectedIndex == null ? "Not answered" : `Option ${Number(q.selectedIndex)+1}`)} · ${q.isCorrect == null ? "Not scored" : q.isCorrect ? "Correct" : "Incorrect"}`; article.appendChild(p);
        const correct=(q.options||[]).find(o=>o.isCorrect); if(correct){const c=document.createElement("p");c.textContent=`Correct answer: ${correct.text}`;article.appendChild(c);}
        if(q.explanation){const e=document.createElement("p");e.textContent=`Explanation: ${q.explanation}`;article.appendChild(e);} review.appendChild(article);
      });
    }
  } catch (e) { if (overview) { const p=document.createElement("p"); p.setAttribute("role","alert"); p.textContent=e.message || "Unable to load results."; overview.prepend(p); } }
});
