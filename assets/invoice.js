/* The A4 bill, shared by the counter console and the customer's paid-bill page. */
const SHOP = {
  name: 'Shree Shyam Enterprises', tag: 'Industrial and Project Suppliers',
  address: 'Shop No. 191, RIICO Hanuman Market Complex, Neemrana (Alwar), Rajasthan 301705',
  phone: '+91 72401 07540, +91 98879 79884', email: 'shreeshyamenterprises7540@gmail.com', gstin: '08SJHPS7017F1ZK', state: '08',
};
const STATES = { '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh' };

/* Amount in words, Indian numbering */
function words(n) {
  const o = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const ty = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = x => (x < 20 ? o[x] : ty[Math.floor(x / 10)] + (x % 10 ? ' ' + o[x % 10] : ''));
  const three = x => { const h = Math.floor(x / 100), r = x % 100; return (h ? o[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? two(r) : ''); };
  if (!n) return 'Zero Rupees Only';
  let s = '';
  const cr = Math.floor(n / 1e7), lk = Math.floor(n % 1e7 / 1e5), th = Math.floor(n % 1e5 / 1e3), rest = n % 1e3;
  if (cr) s += three(cr) + ' Crore ';
  if (lk) s += two(lk) + ' Lakh ';
  if (th) s += two(th) + ' Thousand ';
  if (rest) s += three(rest);
  return (s + ' Rupees Only').replace(/\s+/g, ' ').trim();
}

/* A4 tax invoice. Rows are paged by hand so each sheet keeps its header and
   footer and the totals block never splits across pages. */
const PAGE_ROWS = 24, LAST_ROWS = 11;
function qrSvg(text) {
  const q = qrcode(0, 'M');
  q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
}
function buildPrint(r, opts = {}) {
  // Tax paperwork shows paise on every amount so the columns line up.
  const fmt = n => '₹ ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const c = SSE.content(), keep = r.keep ?? 1, inter = !!r.inter, code = r.supply || SHOP.state, isTax = r.type === 'TAX';
  const upi = c.upi_id || '', taxable = r.taxable ?? r.sub;
  const anyDisc = r.items.some(it => Number(it.disc_pct) > 0);
  const rows = r.items.map((it, i) => {
    const tx = SSE.lineValue(it) * keep, g = tx * it.gst_pct / 100;
    return `<tr><td class="c">${i + 1}</td><td class="item"><b>${SSE.esc(it.name)}</b>${it.hsn ? `<span>HSN ${SSE.esc(it.hsn)}</span>` : ''}</td>
      <td class="r">${Number(it.qty)} ${SSE.esc(it.unit || 'nos')}</td><td class="r">${fmt(it.rate)}</td>${anyDisc ? `<td class="r">${Number(it.disc_pct) ? Number(it.disc_pct) + '%' : '—'}</td>` : ''}<td class="r">${fmt(tx)}</td>
      <td class="r">${Number(it.gst_pct)}%</td><td class="r">${fmt(g)}</td><td class="r amt">${fmt(tx + g)}</td></tr>`;
  });
  const hsn = {};
  r.items.forEach(it => {
    const k = (it.hsn || '—') + '|' + it.gst_pct, tx = SSE.lineValue(it) * keep;
    hsn[k] = hsn[k] || { hsn: it.hsn || '—', rate: it.gst_pct, tx: 0, g: 0 };
    hsn[k].tx += tx; hsn[k].g += tx * it.gst_pct / 100;
  });
  const chunks = [], list = rows.slice();
  while (list.length > LAST_ROWS) chunks.push(list.splice(0, Math.min(PAGE_ROWS, list.length > PAGE_ROWS ? PAGE_ROWS : list.length - 1)));
  chunks.push(list);
  const dt = new Date(r.date), date = dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const pay = upi && isTax && r.balance > 0 ? `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(SHOP.name)}&am=${r.balance}&tn=${encodeURIComponent(r.no)}` : '';
  const summary = `<div class="i-sum"><div class="i-left">
      <p class="i-words"><span>Amount in words</span>${words(r.grand)}</p>
      <table class="i-hsn"><thead><tr><th>HSN</th><th class="r">Taxable</th><th class="r">Rate</th>${inter ? '<th class="r">IGST</th>' : '<th class="r">CGST</th><th class="r">SGST</th>'}</tr></thead><tbody>
      ${Object.values(hsn).slice(0, 5).map(h => `<tr><td>${SSE.esc(h.hsn)}</td><td class="r">${fmt(h.tx)}</td><td class="r">${Number(h.rate)}%</td>${inter ? `<td class="r">${fmt(h.g)}</td>` : `<td class="r">${fmt(h.g / 2)}</td><td class="r">${fmt(h.g / 2)}</td>`}</tr>`).join('')}</tbody></table>
    </div><div class="i-right">
      <div><span>Subtotal</span><b>${fmt(r.gross ?? r.sub)}</b></div>
      ${r.itemDisc ? `<div><span>Item discount</span><b>− ${fmt(r.itemDisc)}</b></div>` : ''}
      ${r.disc ? `<div><span>Discount</span><b>− ${fmt(r.disc)}</b></div>` : ''}
      ${r.disc || r.itemDisc ? `<div><span>Taxable value</span><b>${fmt(taxable)}</b></div>` : ''}
      ${inter ? `<div><span>IGST</span><b>${fmt(r.gst)}</b></div>` : `<div><span>CGST</span><b>${fmt(r.gst / 2)}</b></div><div><span>SGST</span><b>${fmt(r.gst / 2)}</b></div>`}
      <div><span>Round off</span><b>${fmt(r.round ?? 0)}</b></div>
      <div class="i-grand"><span>Total</span><b>${fmt(r.grand)}</b></div>
      <div><span>Received (${SSE.esc(r.mode)})</span><b>${fmt(r.paid)}</b></div>
      <div class="i-bal"><span>Balance due</span><b>${fmt(r.balance)}</b></div>
    </div></div>
    <div class="i-end">
      <div class="i-terms"><span>Terms</span>Goods once sold are taken back only in original pack within 7 days with this bill. Warranty as per the maker. Interest at 18% a year after the due date. Disputes subject to local jurisdiction.</div>
      ${pay ? `<div class="i-qr">${qrSvg(pay)}<span>Scan to pay ${fmt(r.balance)}<br>${SSE.esc(upi)}</span></div>` : ''}
      <div class="i-sign"><span>For ${SHOP.name}</span><i></i><b>Authorised signatory</b></div>
    </div>`;
  const sheet = (label, c2, i, n) => `<section class="a4">
    <header class="i-top">
      <img src="assets/land/logo-full-ink.png" alt="">
      <div class="i-shop"><b>${SHOP.name}</b><span>${SHOP.tag}</span><span>${SHOP.address}</span><span>${SHOP.phone}</span><span>${SHOP.email}</span></div>
      <div class="i-title"><h1>${isTax ? 'Tax Invoice' : 'Estimate'}</h1><span>${SSE.esc(label)}</span><span class="mono">GSTIN ${SHOP.gstin}</span>${r.online ? `<span class="i-paid">Paid ${r.mode === 'Online' ? 'online' : 'by ' + SSE.esc(r.mode)}</span>` : ''}</div>
    </header>
    <div class="i-meta">
      <div><span>${isTax ? 'Invoice no.' : 'Estimate no.'}</span><b class="mono">${SSE.esc(r.no)}</b></div>
      <div><span>Date</span><b>${date}</b></div>
      <div><span>Place of supply</span><b>${SSE.esc(STATES[code] || 'Rajasthan')} (${SSE.esc(code)})</b></div>
      <div><span>Reverse charge</span><b>No</b></div>
    </div>
    ${i === 0 ? `<div class="i-party${r.gstin ? '' : ' solo'}"><div><span>Bill to</span><b>${SSE.esc(r.customer || 'Walk-in customer')}</b>${r.address ? `<p>${SSE.esc(r.address)}</p>` : ''}${r.phone ? `<p>${SSE.esc(r.phone)}</p>` : ''}</div>
      ${r.gstin ? `<div><span>Buyer GSTIN</span><b class="mono">${SSE.esc(r.gstin)}</b><p>${SSE.esc(STATES[code] || '')}</p></div>` : ''}</div>` : ''}
    <table class="i-items"><thead><tr><th class="c">#</th><th>Item</th><th class="r">Qty</th><th class="r">Rate</th>${anyDisc ? '<th class="r">Disc</th>' : ''}<th class="r">Taxable</th><th class="r">GST</th><th class="r">Tax</th><th class="r">Amount</th></tr></thead>
    <tbody>${c2}</tbody></table>
    ${i === n - 1 ? summary : '<p class="i-cont">Continued on the next sheet</p>'}
    ${isTax && n === 1 ? '' : `<footer class="i-foot"><span>${isTax ? '' : 'Valid for 7 days. Not a tax invoice.'}</span><span class="mono">${n > 1 ? `Sheet ${i + 1} of ${n}` : ''}</span></footer>`}
  </section>`;
  const copy = label => chunks.map((c2, i) => sheet(label, c2.join(''), i, chunks.length)).join('');
  SSE.$('#printArea').innerHTML = !isTax ? copy('Not a tax invoice') : opts.single ? copy('Original for recipient') : copy('Original for recipient') + copy('Duplicate for supplier');
}

/* A bill from the backend, in the shape the counter's own bills use. */
function onlineBill(x) {
  const t = SSE.totals(x.items, 0), code = STATES[(x.gstin || '').slice(0, 2)] ? x.gstin.slice(0, 2) : SHOP.state;
  return { no: x.no, date: x.date, type: 'TAX', customer: x.customer, phone: x.phone, gstin: x.gstin, address: x.address, mode: x.mode || 'Online', online: true, orderId: x.order_id,
    items: x.items, gross: t.gross, itemDisc: t.itemDisc, sub: t.sub, disc: 0, taxable: t.taxable, gst: t.gst, keep: t.keep, round: t.round, grand: t.grand,
    supply: code, inter: code !== SHOP.state, paid: t.grand, balance: 0 };
}
