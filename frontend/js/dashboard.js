"use strict";
document.addEventListener("DOMContentLoaded", async () => {
  if (!PrepifyAPI.requireAuth()) return;
  const user=PrepifyAPI.user();
  const welcome=document.querySelector('.dashboard-welcome h1');
  if(welcome && user?.fullName) welcome.textContent=`Welcome back, ${user.fullName.split(/\s+/)[0]}!`;
  const logout=[...document.querySelectorAll('a')].find(a=>/log out/i.test(a.textContent));
  if(logout) logout.addEventListener('click',e=>{e.preventDefault();PrepifyAPI.clearSession();location.href='login.html';});
  try {
    const r=await PrepifyAPI.get('/results?page=1&limit=100'); const items=r.items||[];
    const stats=document.querySelectorAll('.stat-card h2');
    if(stats[0])stats[0].textContent=String(items.length);
    const scored=items.filter(x=>x.score!==null&&x.maxScore>0);
    if(stats[1])stats[1].textContent=scored.length?`${Math.round(scored.reduce((n,x)=>n+(Number(x.score)/Number(x.maxScore))*100,0)/scored.length)}%`:'—';
  } catch(e) { /* dashboard remains usable if history is empty */ }
});
