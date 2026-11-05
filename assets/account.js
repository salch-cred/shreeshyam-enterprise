/* Details live on this device and prefill checkout. There is no SMS provider
   connected, so this page does not pretend to verify anyone. */
const $ = SSE.$;
const cust = () => { try { return JSON.parse(localStorage.getItem('sse_cust') || 'null'); } catch { return null; } };
const stage = v => { const s = $('#stage'); if (s) s.style.visibility = v ? '' : 'hidden'; };
function drawOrders(phone) {
  let list = [];
  try { list = JSON.parse(localStorage.getItem('sse_orders') || '[]'); } catch {}
  list = list.filter(o => !o.phone || o.phone === phone).reverse();
  const box = $('#orders');
  if (!list.length) {
    box.innerHTML = '<div class="empty" ><b>No orders yet</b><p>Orders you place from this device show up here.</p></div>';
    return;
  }
  box.innerHTML = list.map((o, i) => `<div class="acct-row"><div><b>${SSE.esc(o.id)}</b> <span class="pill">${SSE.esc(o.status || 'new')}</span>
    <small>${o.created ? new Date(o.created).toLocaleDateString('en-IN') + ' · ' : ''}${SSE.esc((o.text || '').slice(0, 120))}</small></div>
    <div class="acct-actions"><span>${o.total ? SSE.fmt(o.total) : 'Rates to confirm'}</span>${o.items ? `<button class="btn line sm" data-i="${i}">Order again</button>` : ''}</div></div>`).join('');
  box.querySelectorAll('button').forEach(b => b.onclick = () => {
    const cart = SSE.getCart();
    list[+b.dataset.i].items.forEach(it => { const ex = cart.find(c => c.id === it.id); if (ex) ex.qty += it.qty; else cart.push({ ...it }); });
    SSE.setCart(cart);
    location.href = 'checkout.html';
  });
}
function show() {
  const c = cust(), has = !!(c && c.phone);
  $('#authView').hidden = has;
  $('#meView').hidden = !has;
  stage(!has);
  if (!has) return;
  $('#meName').textContent = c.name;
  $('#meLine').textContent = '+91 ' + c.phone + (c.gst ? ' · GSTIN ' + c.gst : '');
  $('#ledgerWa').href = SSE.wa('Namaste, mujhe account statement chahiye. Mobile: ' + c.phone);
  drawOrders(c.phone);
}
$('#detailsForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#aname').value.trim(), phone = $('#aphone').value.trim(), good = /^[6-9]\d{9}$/.test(phone);
  $('#nameErr').textContent = name ? '' : 'Enter a name';
  $('#phoneErr').textContent = good ? '' : 'Enter a 10 digit mobile number';
  if (!name || !good) return;
  localStorage.setItem('sse_cust', JSON.stringify({ name, phone, gst: $('#agst').value.trim().toUpperCase(), address: $('#aaddr').value.trim() }));
  SSE.toast('Details saved on this device');
  show();
});
$('#editMe').onclick = () => {
  const c = cust();
  $('#aname').value = c.name; $('#aphone').value = c.phone; $('#agst').value = c.gst || ''; $('#aaddr').value = c.address || '';
  $('#authView').hidden = false; $('#meView').hidden = true;
  stage(true);
};
$('#logout').onclick = () => { localStorage.removeItem('sse_cust'); SSE.toast('Signed out'); show(); };
show();
