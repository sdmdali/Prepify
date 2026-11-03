"use strict";
document.addEventListener('DOMContentLoaded',async()=>{
 if(!PrepifyAPI.requireAuth())return;
 const tbody=document.querySelector('.history-table tbody'); const summaries=document.querySelectorAll('.history-summary-card h2'); const filter=document.getElementById('history-type');
 if(!tbody)return;
 let all=[];
 const date=v=>v?new Date(String(v).replace(' ','T')+'Z').toLocaleString(): '—';
 function render(){
  const kind=filter?.value||'all'; const items=all.filter(x=>kind==='all'||(kind==='college'?!!x.examSessionId:!x.examSessionId));
  tbody.replaceChildren();
  if(!items.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.className='history-empty';td.textContent='No attempts found yet. Complete a practice test to see your saved results.';tr.appendChild(td);tbody.appendChild(tr);}
  items.forEach(x=>{const tr=document.createElement('tr');const vals=[x.title||'Practice test',x.subject|| (x.examSessionId?'College examination':'Computer Science'),date(x.submittedAt||x.startedAt),x.score==null?'—':`${x.score} / ${x.maxScore}`,x.status||'—'];vals.forEach(v=>{const td=document.createElement('td');td.textContent=String(v);tr.appendChild(td);});const td=document.createElement('td');if(x.status!=='in_progress'&&x.attemptId){const a=document.createElement('a');a.href=`results.html?attemptId=${encodeURIComponent(x.attemptId)}`;a.textContent='View result';td.appendChild(a);}else td.textContent='In progress';tr.appendChild(td);tbody.appendChild(tr);});
  if(summaries[0])summaries[0].textContent=String(all.length);
  const done=all.filter(x=>x.score!==null&&Number(x.maxScore)>0);if(summaries[1])summaries[1].textContent=done.length?`${Math.round(done.reduce((n,x)=>n+Number(x.score)/Number(x.maxScore)*100,0)/done.length)}%`:'—';
  if(summaries[2])summaries[2].textContent=done.length?`${Math.max(...done.map(x=>Number(x.score)/Number(x.maxScore)*100)).toFixed(0)}%`:'—';
 }
 filter?.addEventListener('change',render);
 try{const r=await PrepifyAPI.get('/results?page=1&limit=100');all=r.items||[];render();}
 catch(e){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.className='history-empty';td.textContent=e.message||'Unable to load history.';tr.appendChild(td);tbody.replaceChildren(tr);}
});
