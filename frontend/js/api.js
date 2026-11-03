"use strict";
/* Prepify API client. Configure PREPIFY_API_BASE if backend is hosted elsewhere. */
(() => {
  const base = (window.PREPIFY_API_BASE || "http://localhost:8080/api").replace(/\/$/, "");
  const tokenKey = "prepifyToken";
  const userKey = "prepifyUser";
  async function request(path, options={}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const token = localStorage.getItem(tokenKey) || sessionStorage.getItem(tokenKey);
    if (token) headers.Authorization = `Bearer ${token}`;
    let response;
    try { response = await fetch(`${base}${path}`, { ...options, headers }); }
    catch (_) { throw new Error("Cannot reach Prepify backend. Make sure the backend is running at " + base + "."); }
    if (response.status === 204) return null;
    let payload;
    try { payload = await response.json(); } catch (_) { throw new Error(`Server returned an unreadable response (${response.status}).`); }
    if (!response.ok || payload?.success === false) throw new Error(payload?.error?.message || `Request failed (${response.status}).`);
    return payload?.data ?? payload;
  }
  const api = {
    base,
    get: (p) => request(p),
    post: (p, body={}) => request(p,{method:"POST",body:JSON.stringify(body)}),
    put: (p, body={}) => request(p,{method:"PUT",body:JSON.stringify(body)}),
    patch: (p, body={}) => request(p,{method:"PATCH",body:JSON.stringify(body)}),
    del: (p) => request(p,{method:"DELETE"}),
    setSession(result, remember=true) {
      const store = remember ? localStorage : sessionStorage;
      store.setItem(tokenKey, result.token);
      store.setItem(userKey, JSON.stringify(result.user));
    },
    clearSession() { [localStorage,sessionStorage].forEach(s=>{s.removeItem(tokenKey);s.removeItem(userKey);}); },
    user() { try { return JSON.parse(localStorage.getItem(userKey)||sessionStorage.getItem(userKey)||"null"); } catch (_) { return null; } },
    requireAuth() { if (!(localStorage.getItem(tokenKey)||sessionStorage.getItem(tokenKey))) { location.href="login.html"; return false; } return true; },
    escape(value) { return String(value ?? "").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); },
    message(error) { alert(error?.message || "Something went wrong."); }
  };
  window.PrepifyAPI = api;
})();
