/* SSE API client — uses TypeScript backend when configured, else local IndexedDB.
   Set in Admin → Website tab or console: localStorage.setItem('sse_api','https://your-api.vercel.app') */
const API = (() => {
  const base = () => (localStorage.getItem('sse_api') || '').replace(/\/$/, '');
  const token = () => sessionStorage.getItem('sse_token') || '';
  async function login(pin) {
    const b = base(); if (!b) return null;
    const r = await fetch(b + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
    if (!r.ok) throw new Error('Wrong PIN');
    const j = await r.json();
    sessionStorage.setItem('sse_token', j.token);
    return j;
  }
  async function req(path, opts = {}) {
    const b = base(); if (!b) throw new Error('no-api');
    const r = await fetch(b + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: 'Bearer ' + token() } : {}), ...(opts.headers || {}) } });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || ('HTTP ' + r.status));
    return r.json();
  }
  // Paginated catalogue from Postgres (unlimited). Falls back to SSE.all() on 'no-api'.
  async function products(q = '', category = '', page = 1, pageSize = 48) {
    try {
      const p = new URLSearchParams({ q, category, page: String(page), pageSize: String(pageSize) });
      return await req('/products?' + p);
    } catch (e) {
      if (String(e.message) !== 'no-api') throw e;
      const all = await SSE.all();
      const f = SSE.filter(all, q, category);
      return { page, pageSize, total: f.length, items: SSE.page(f, page), offline: true };
    }
  }
  return { base, login, req, products };
})();
