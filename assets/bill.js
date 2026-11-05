/* The customer's paid bill. The link carries the order ID, and the bill comes from the
   backend, so this page shows the same record the counter holds. */
const $ = SSE.$;
const fit = () => document.documentElement.style.setProperty('--bill-zoom', Math.min(1, (innerWidth - 24) / 794).toFixed(3));
(async function init() {
  const id = new URLSearchParams(location.search).get('order') || '';
  fit();
  addEventListener('resize', fit);
  try {
    if (!SSE.api() || !/^SSE[0-9A-Z]+$/.test(id)) throw 0;
    const r = await fetch(SSE.api() + '/payments/invoice/' + encodeURIComponent(id));
    if (!r.ok) throw 0;
    const b = onlineBill(await r.json());
    buildPrint(b, { single: true });
    $('#billNo').textContent = b.no;
    $('#billSub').textContent = `${SSE.fmt(b.grand)} paid ${b.mode === 'Online' ? 'online' : 'by ' + b.mode}`;
    $('#billTools').hidden = false;
    $('#billPrint').onclick = () => window.print();
  } catch {
    $('#billNo').textContent = 'Bill not found';
    $('#billSub').textContent = 'Check the link, or call the counter on +91 72401 07540.';
  }
})();
