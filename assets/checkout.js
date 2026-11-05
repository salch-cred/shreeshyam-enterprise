/* Checkout. With a backend configured it takes payment online. Without one the
   order goes to the shop on WhatsApp, which is how a static site reaches the counter. */
const $ = SSE.$;
const api = SSE.api;
let cart = SSE.getCart(), status = { gateway: 'none' }, method = 'upi', pending = null;

const save = () => { pending = null; SSE.setCart(cart); };
function totals() {
  let sub = 0, gst = 0;
  for (const it of cart) { const t = it.qty * (it.rate || 0); sub += t; gst += t * ((it.gst_pct ?? 18) / 100); }
  return { sub, gst, grand: Math.round(sub + gst), open: cart.filter(i => !i.rate).length };
}
function drawItems() {
  const box = $('#coItems');
  if (!cart.length) {
    box.innerHTML = `<div class="empty"><b>Your cart is empty</b><p>Add parts from the catalogue first.</p><a class="btn" href="shop.html">Open the catalogue</a></div>`;
    $('#coTotals').innerHTML = '';
    $('#coPay').disabled = true;
    $('#copayTotal').textContent = '—';
    $('#coNote').textContent = '';
    return;
  }
  $('#coPay').disabled = false;
  box.innerHTML = cart.map((c, i) => `<div class="co-line">
    <img src="${SSE.safeImg(c.img)}" alt="" loading="lazy">
    <div><b>${SSE.esc(c.name)}</b><small>${c.rate ? SSE.fmt(c.rate) + ' + ' + (c.gst_pct ?? 18) + '% GST' : 'Rate on request'}</small>
      <div><button type="button" class="co-rm" data-i="${i}">Remove</button></div></div>
    <div class="stepper"><button type="button" data-i="${i}" data-d="-1" aria-label="Decrease">−</button><b>${c.qty}</b><button type="button" data-i="${i}" data-d="1" aria-label="Increase">+</button></div>
    <div class="co-amt">${c.rate ? SSE.fmt(c.qty * c.rate) : ''}</div></div>`).join('');
  box.querySelectorAll('.stepper button').forEach(b => b.onclick = () => {
    const it = cart[+b.dataset.i]; it.qty = Math.max(1, it.qty + +b.dataset.d); save(); drawItems();
  });
  box.querySelectorAll('.co-rm').forEach(b => b.onclick = () => { cart.splice(+b.dataset.i, 1); save(); drawItems(); });
  const t = totals(), allOpen = t.open === cart.length;
  $('#coTotals').innerHTML = allOpen ? '' : `<div><span>Subtotal</span><b>${SSE.fmt(t.sub)}</b></div><div><span>GST</span><b>${SSE.fmt(t.gst)}</b></div>
    <div class="grand"><span>Total${t.open ? ' so far' : ''}</span><b>${SSE.fmt(t.grand)}</b></div>`;
  $('#coTotalLabel').textContent = t.open ? `${t.open} rate${t.open === 1 ? '' : 's'} to confirm` : 'Order total';
  $('#copayTotal').textContent = allOpen ? 'Quote' : SSE.fmt(t.grand);
  $('#coPay').textContent = t.open ? 'Send order for rates' : 'Place order';
  $('#coNote').textContent = t.open
    ? 'We reply with the final rates and total before anything is dispatched. Nothing to pay yet.'
    : 'A GST invoice with HSN comes with your order.';
}
function drawPay() {
  const opts = [['upi', 'UPI to the shop', 'Pay from any UPI app once the order is confirmed.'], ['cod', 'Cash on delivery', 'Pay cash or UPI to the delivery van. RIICO belt orders.']];
  if (status.gateway === 'cashfree') opts.unshift(['card', 'Pay online', 'UPI, card or netbanking. Confirmed instantly, secured by Cashfree.']);
  $('#payPanel').innerHTML = opts.map(o => `<button type="button" data-m="${o[0]}" aria-pressed="${method === o[0]}"><b>${o[1]}</b><span>${o[2]}</span></button>`).join('');
  $('#payPanel').querySelectorAll('button').forEach(b => b.onclick = () => { method = b.dataset.m; drawPay(); });
}
function done(o) {
  const t = o.grand, upi = SSE.content().upi_id;
  // Only a upi: link may become a button, whatever a server response contains.
  const link = /^upi:\/\/pay\?/.test(o.payLink || '') ? o.payLink : '';
  const pay = link || (o.method === 'upi' && t && upi ? `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent('Shree Shyam Enterprises')}&am=${t}&tn=${encodeURIComponent(o.id)}` : '');
  const mark = '<svg class="okmark" viewBox="0 0 96 96" aria-hidden="true"><circle class="ok-pulse" cx="48" cy="48" r="44"/><circle class="ok-disc" cx="48" cy="48" r="44"/><circle class="ok-ring" cx="48" cy="48" r="44" pathLength="100"/><path class="ok-check" pathLength="100" d="M28 50l14 14 27-30"/></svg>';
  $('#stepDone').classList.add('on');
  if (o.paid) {
    $('#coSide').innerHTML = `<div class="done paidok">${mark}<h2>Thank you</h2>
      <p>We have received your payment of ${SSE.fmt(t)}.</p>
      <dl class="done-bill">${o.invoice ? `<div><dt>Bill no.</dt><dd>${SSE.esc(o.invoice)}</dd></div>` : ''}<div><dt>Order</dt><dd>${SSE.esc(o.id)}</dd></div></dl>
      <div class="btns">${o.invoice ? `<a class="btn" href="invoice.html?order=${encodeURIComponent(o.id)}">View and print bill</a>` : ''}<a class="btn line" href="shop.html">Back to catalogue</a></div></div>`;
    document.querySelectorAll('.stepper, .co-rm').forEach(el => el.remove());
    SSE.toast('Payment received');
    return;
  }
  $('#coSide').innerHTML = `<div class="done">${mark}<h2>Order ${SSE.esc(o.id)}</h2>
    <p>${SSE.esc(o.note)}</p>
    <div class="btns">
      ${o.wa ? `<a class="btn" href="${o.wa}" target="_blank" rel="noopener">Send order on WhatsApp</a>` : ''}
      ${pay ? `<a class="btn line" href="${SSE.esc(pay)}">Pay ${SSE.fmt(t)} by UPI</a>` : ''}
      <a class="btn line" href="shop.html">Back to catalogue</a>
    </div></div>`;
  document.querySelectorAll('.stepper, .co-rm').forEach(el => el.remove());
  SSE.toast(`Order ${o.id} placed`);
}
function record(o, items, phone, name) {
  // status defaults to new; a confirmed online payment is recorded as paid.
  try {
    const a = JSON.parse(localStorage.getItem('sse_orders') || '[]');
    a.push({ id: o.id, source: 'web', phone, name, items, total: o.grand, text: items.map(c => `${c.name} x ${c.qty}`).join(', '), created: new Date().toISOString(), status: o.status || 'new', invoice: o.invoice || '' });
    localStorage.setItem('sse_orders', JSON.stringify(a));
  } catch {}
}
// The Cashfree window only reports that it closed. Whether money arrived is asked from the server.
const paidCheck = async id => (await fetch(api() + '/payments/verify/' + encodeURIComponent(id))).json();
function loadCashfree() {
  if (window.Cashfree) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://sdk.cashfree.com/js/v3/cashfree.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
function paidDone(o, invoice) {
  if (o.items) record({ id: o.orderId, grand: o.grand, status: 'paid', invoice }, o.items, o.phone, o.name);
  try { localStorage.removeItem('sse_pay'); } catch {}
  cart = []; save();
  drawItems();
  done({ id: o.orderId, grand: o.grand, paid: true, invoice });
}
async function payOnline(p) {
  const err = $('#coErr'), btn = $('#coPay');
  err.textContent = '';
  btn.disabled = true;
  try {
    localStorage.setItem('sse_pay', JSON.stringify({ orderId: p.orderId, grand: p.grand, items: p.items, phone: p.phone, name: p.name }));
    await loadCashfree();
    const out = await Cashfree({ mode: p.cashfreeMode === 'production' ? 'production' : 'sandbox' }).checkout({ paymentSessionId: p.paymentSessionId, redirectTarget: '_modal' });
    if (out?.redirect) return;
    const v = await paidCheck(p.orderId);
    if (v.status === 'paid') return paidDone(p, v.invoiceNo);
    err.textContent = 'Payment did not go through. No money was taken for this order. You can try again.';
    btn.textContent = 'Try payment again';
  } catch {
    err.textContent = 'Could not confirm the payment. If money left your account, call the counter with order ' + p.orderId + '.';
    btn.textContent = 'Try payment again';
  }
  btn.disabled = false;
}
$('#coForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('#coErr').textContent = '';
  if (!cart.length) return;
  let ok = true;
  e.target.querySelectorAll('[required]').forEach(i => {
    const v = i.value.trim(), bad = !v || (i.pattern && !new RegExp(`^${i.pattern}$`).test(v));
    i.closest('.field').querySelector('.err').textContent = bad ? (i.id === 'coPhone' ? 'Enter a 10 digit mobile number' : 'Required') : '';
    if (bad) ok = false;
  });
  if (!ok) return;
  const name = $('#coName').value.trim(), phone = $('#coPhone').value.trim(), address = $('#coAddr').value.trim(), gstin = $('#coGst').value.trim().toUpperCase(), email = $('#coEmail').value.trim().toLowerCase();
  const goodMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  $('#coEmailErr').textContent = (email && !goodMail) || (method === 'card' && !goodMail) ? 'Enter your email so we can send the bill' : '';
  if ($('#coEmailErr').textContent) return;
  const items = cart.map(c => ({ id: c.id, name: c.name, qty: c.qty, rate: c.rate || 0, gst_pct: c.gst_pct ?? 18, img: c.img }));
  const t = totals();
  localStorage.setItem('sse_cust', JSON.stringify({ ...(JSON.parse(localStorage.getItem('sse_cust') || 'null') || {}), name, phone, email, gst: gstin, address }));

  if (api()) {
    if (pending) { await payOnline(pending); return; }
    try {
      const r = await fetch(api() + '/payments/create-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: cart.map(c => ({ id: c.id, qty: c.qty, slab: c.slab === 'wholesale' ? 'wholesale' : 'retail' })), name, phone, email, address, gstin, method }) });
      const j = await r.json();
      if (!r.ok) { $('#coErr').textContent = j.error || 'Could not place the order. Try again.'; return; }
      if (j.mode === 'cashfree') {
        pending = { ...j, items, phone, name };
        await payOnline(pending);
        return;
      }
      record({ id: j.orderId, grand: j.grand }, items, phone, name);
      cart = []; save();
      if (j.mode === 'quote') done({ id: j.orderId, grand: 0, note: 'Order received. We confirm rates and the total before anything is dispatched.' });
      else done({ id: j.orderId, grand: j.grand, method, payLink: j.intent, note: j.mode === 'cod' ? `Pay ${SSE.fmt(j.grand)} to the delivery van. Your invoice follows on WhatsApp.` : `We confirm stock and your invoice follows on WhatsApp. Total ${SSE.fmt(j.grand)}.` });
    } catch { $('#coErr').textContent = 'Could not reach the shop. Check your connection.'; }
    return;
  }

  const id = 'W' + Date.now().toString(36).toUpperCase();
  const lines = items.map((c, i) => `${i + 1}. ${c.name} x ${c.qty}${c.rate ? ` @ ${SSE.fmt(c.rate)}` : ' (rate please)'}`).join('\n');
  const msg = `Namaste, new order ${id}\n\n${lines}\n\n${t.grand ? `Total: ${SSE.fmt(t.grand)} incl. GST${t.open ? ' + items to quote' : ''}\n` : ''}Payment: ${method === 'upi' ? 'UPI' : 'Cash on delivery'}\n\nName: ${name}\nPhone: ${phone}${gstin ? `\nGSTIN: ${gstin}` : ''}\nAddress: ${address}`;
  const wa = SSE.wa(msg), order = { id, grand: t.open ? 0 : t.grand, method, wa };
  record(order, items, phone, name);
  cart = []; save();
  window.open(wa, '_blank', 'noopener');
  done({ ...order, note: 'Your order opened in WhatsApp. Press send there so it reaches the counter, then we confirm rates and dispatch.' });
});
// Saved carts can be stale or edited. Rates always come from the live catalogue.
async function reprice() {
  const cat = await SSE.catalog();
  if (!cat.length) return;
  const byId = new Map(cat.map(p => [p.id, p])), before = cart.length;
  cart = cart.filter(c => byId.has(c.id)).map(c => {
    const p = byId.get(c.id), wholesale = c.slab === 'wholesale';
    return { ...c, name: p.name, img: p.image, gst_pct: p.gst_pct, rate: (wholesale ? p.rate_wholesale : p.rate_retail) || 0 };
  });
  save(); drawItems();
  if (cart.length < before) SSE.toast('An item is no longer listed and was removed');
}
(async function init() {
  const c = (() => { try { return JSON.parse(localStorage.getItem('sse_cust') || 'null'); } catch { return null; } })();
  if (c) { $('#coName').value = c.name || ''; $('#coPhone').value = c.phone || ''; $('#coEmail').value = c.email || ''; $('#coGst').value = c.gst || ''; $('#coAddr').value = c.address || ''; }
  drawItems(); drawPay();
  await reprice();
  if (api()) { try { status = await (await fetch(api() + '/payments/status')).json(); if (status.gateway === 'cashfree') method = 'card'; drawPay(); } catch {} }
  // Back from a bank or in-app browser redirect.
  const back = new URLSearchParams(location.search).get('order');
  if (api() && back && /^SSE[0-9A-Z]+$/.test(back)) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('sse_pay') || 'null'); } catch {}
    try {
      const v = await paidCheck(back);
      if (v.status === 'paid') paidDone(saved?.orderId === back ? saved : { orderId: back, grand: v.grand }, v.invoiceNo);
      else $('#coErr').textContent = 'That payment did not go through. Your cart is still here, so you can try again.';
    } catch { $('#coErr').textContent = 'Could not confirm the payment. If money left your account, call the counter with order ' + back + '.'; }
  }
})();
