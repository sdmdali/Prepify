"use strict";
document.addEventListener('DOMContentLoaded',async()=>{
 if(!PrepifyAPI.requireAuth())return;
 const search=document.getElementById('question-search'),subject=document.getElementById('question-subject'),difficulty=document.getElementById('question-difficulty');
 const section=document.querySelector('.question-bank-results');const empty=section?.querySelector('.question-bank-empty');
 const heading=section?.querySelector('.question-bank-toolbar p'); if(!section)return;
 let subjects=[];
 try{const r=await PrepifyAPI.get('/subjects');subjects=r.items||[];subjects.forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.name;subject.appendChild(o);});}catch(e){if(heading)heading.textContent=e.message;}
 let timer;
 async function load(){try{const params=new URLSearchParams({page:'1',limit:'50'});if(subject.value)params.set('subjectId',subject.value);if(difficulty.value)params.set('difficulty',difficulty.value);if(search.value.trim())params.set('search',search.value.trim());const r=await PrepifyAPI.get(`/questions?${params}`);let list=section.querySelector('.question-bank-live-list');if(!list){list=document.createElement('div');list.className='question-bank-live-list';section.insertBefore(list,section.querySelector('.question-bank-pagination'));}list.replaceChildren();(r.items||[]).forEach((q,i)=>{const article=document.createElement('article');article.className='question-review-item';const h=document.createElement('h3');h.textContent=`${i+1}. ${q.questionText}`;article.appendChild(h);const meta=document.createElement('p');meta.textContent=`${subjects.find(s=>Number(s.id)===Number(q.subjectId))?.name||'Subject'} · ${q.difficulty||'mixed'} · ${q.marks??1} mark(s)`;article.appendChild(meta);(q.options||[]).forEach((o,j)=>{const p=document.createElement('p');p.textContent=`${String.fromCharCode(65+j)}. ${o.text}`;article.appendChild(p);});list.appendChild(article);});if(empty)empty.hidden=(r.items||[]).length>0;if(heading)heading.textContent=`${r.total||0} question(s) available`;if(!r.items?.length&&empty)empty.hidden=false;}catch(e){if(heading)heading.textContent=e.message;if(empty)empty.hidden=false;}}
 [subject,difficulty].forEach(el=>el?.addEventListener('change',load));search?.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(load,250);});load();
});
