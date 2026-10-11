/* Shyam Assist — scripted business assistant.
   AI chat temporarily disabled by user request. */
(function () {
  return; // AI Chat disabled
  const PROMPT = [
    'You are Shyam Assist for Shree Shyam Enterprises, Industrial and Project Suppliers,',
    'Shop No. 191, RIICO Hanuman Market Complex, Neemrana (Alwar), Rajasthan 301705.',
    'Phones: 7240107540 and 9887979884. Email: shreeshyamenterprises7540@gmail.com.',
    'Authorized distributor for Polymatic Pneumatic Solutions. Brands stocked: FAG, NBC, SKF,',
    'URB, INA, Asahi bearings; Mitsuboshi, Gates, Optibelt, Bando belts; Unbrako, TVS fasteners;',
    'Occo, SKF seals; Rolond, Diamond, Lovejoy chains and couplings; Festo, Janatics, Norgren,',
    'Yuken, Airmax pneumatics; Taparia, Stanley, Sandvik tools; L&T, Siemens, ABB, BCH electricals.',
    'Open 9 to 8, all days. Same-day van delivery across the RIICO Neemrana industrial belt;',
    'all-India transport dispatch for projects. Quotes with make, HSN and lead time within 2 working',
    'hours; quotes hold 7 days. GST invoice with HSN on every sale; test certificates on request.',
    'Payments: UPI, bank transfer, cash, Cash on Delivery inside the belt, and 30-day PO credit',
    'for plants after three cash bills. Returns: unopened stock items within 7 days with bill.',
    'Tone: brief, warm, practical. Always offer WhatsApp handoff for part numbers and BOQs.',
  ].join(' ');

  const WA = 'https://wa.me/917240107540?text=';
  const kb = [
    [/hour|open|close|timing|kab|time/i, 'Counter open 9 to 8, all days. Same-day van across the RIICO Neemrana belt for confirmed orders.'],
    [/where|location|address|shop|kahan|pata/i, 'Shop No. 191, RIICO Hanuman Market Complex, Neemrana (Alwar), Rajasthan 301705. Landmark: Hanuman Market complex in the RIICO belt.'],
    [/deliver|dispatch|ship|transport|courier/i, 'Same-day van in the RIICO Neemrana belt. All-India transport dispatch for project lots, documents shared on WhatsApp.'],
    [/quote|rate|price|kimat|cost|budget/i, 'Industrial rates are quote-based. Send your list on WhatsApp and we return line-wise rates with make, HSN and lead time in 2 working hours. Quotes hold 7 days.'],
    [/gst|invoice|bill|tax|h sn|hsn/i, 'GST invoice with HSN on every sale. Share your GSTIN once and it prints on all future bills. Test certificates available on request.'],
    [/payment|pay|upi|cod|cash|credit|udhaar|po\b/i, 'We accept UPI, bank transfer, cash and Cash on Delivery inside the belt. Plants on PO get 30-day credit after three cash bills.'],
    [/return|replace|warranty|exchange/i, 'Unopened stock items come back within 7 days with the bill. Warranty items are routed to the brand service centre by us.'],
    [/brand|genuine|fake|original|authorized/i, 'Authorized makes only: FAG, NBC, SKF, Mitsuboshi, Gates, Unbrako, Festo, Janatics, L&T, Siemens, ABB, Taparia, Stanley, Sandvik and more. Polymatic Pneumatic distributor.'],
    [/bearing|ball|roller|ucp/i, 'Bearings in FAG, NBC, SKF, URB, INA, Asahi — ball, roller, pillow blocks, housings, sleeves. Tell me the number (like 6205) and I will check the shelf.'],
    [/belt|timing|v-?belt|pulley/i, 'V-belts A to E, HTD timing 3M to 14M, Poly-V from Mitsuboshi, Gates, Optibelt, Bando. Section and length ka photo bhej dijiye.'],
    [/pneumat|cylinder|frl|solenoid|valve|gripper|air/i, 'Full Polymatic line: cylinders ISO 6431, FRL units, solenoid valves, grippers, fittings, PU tubing. Series number share kijiye, rate check karta hoon.'],
    [/fastener|bolt|nut|screw|circlip|seal|o-?ring/i, 'Unbrako and TVS high tensile fasteners, SS304 Allen caps, circlips, oil seals, O-rings. Size and grade bataiye.'],
    [/electric|contactor|mcb|switch|relay/i, 'L&T, Siemens, ABB, BCH contactors, MCBs, overload relays, proximity switches. Rating likh dijiye.'],
    [/tool|drill|spanner|taparia|stanley/i, 'Taparia, Stanley, Sandvik — spanners, drills, cutting tools, machine tool accessories. Kya chahiye?'],
    [/thank|dhanyavad|shukriya|ok\b|great/i, 'Anytime. Line ruke to hum yaad hain. Anything else?'],
    [/hi|hello|namaste|hey|हेलो|नमस्ते/i, 'Namaste! Shyam Assist here. Part number, category ya requirement bataiye — main shelf check karta hoon.'],
  ];

  let open = false, busy = false;
  let el, log, inp;

  function build() {
    const fab = document.createElement('button');
    fab.className = 'botfab no-print';
    fab.setAttribute('aria-label', 'Open Shyam Assist');
    fab.innerHTML = '<i class="hgi-stroke hgi-sparkles"></i>';
    fab.onclick = toggle;

    const panel = document.createElement('div');
    panel.className = 'botpanel no-print';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Shyam Assist chat');
    panel.innerHTML =
      '<header><div><p class="spec" style="margin:0">Shyam Assist</p><h3 style="margin:2px 0 0;font-size:16px">Business help, 24x7</h3></div>' +
      '<button class="botclose" aria-label="Close chat"><i class="hgi-stroke hgi-cancel-01"></i></button></header>' +
      '<div class="botlog" id="botlog"></div>' +
      '<div class="botchips" id="botchips"></div>' +
      '<form class="botform" id="botform"><input id="botin" placeholder="Part number ya sawal likhiye…" autocomplete="off">' +
      '<button class="botsend" aria-label="Send"><i class="hgi-stroke hgi-sent"></i></button></form>' +
      '<p class="botfoot">Scripted assistant · <a href="' + WA + encodeURIComponent('Namaste, Shyam Assist se aaya hoon.') + '" target="_blank" rel="noopener">WhatsApp team</a> for anything deeper</p>';
    document.body.appendChild(fab);
    document.body.appendChild(panel);
    el = panel; log = panel.querySelector('#botlog'); inp = panel.querySelector('#botin');
    panel.querySelector('.botclose').onclick = toggle;
    panel.querySelector('#botform').addEventListener('submit', function (e) { e.preventDefault(); ask(inp.value); });
    chips(['Where is the shop?', 'Do you deliver today?', 'Share 6205 rate', 'Payment options']);
    greet();
  }
  function toggle() {
    open = !open;
    el.classList.toggle('open', open);
    if (open) { inp.focus(); log.scrollTop = log.scrollHeight; }
  }
  function bubble(who, html) {
    const d = document.createElement('div');
    d.className = 'botmsg ' + who;
    d.innerHTML = html;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }
  function chips(list) {
    const box = el.querySelector('#botchips');
    box.innerHTML = list.map(c => '<button type="button">' + c + '</button>').join('');
    box.querySelectorAll('button').forEach(b => b.onclick = () => ask(b.textContent));
  }
  function typing() { return bubble('bot t', '<span></span><span></span><span></span>'); }
  function greet() {
    bubble('bot', 'Namaste! Main <b>Shyam Assist</b> — Shree Shyam Enterprises ka counter saathi. Part number, category ya requirement likhiye, ya niche chips dabaiye.');
  }
  function search(q) {
    return SSE.all().then(all => {
      const hit = all.filter(p => (p.name + ' ' + p.brand + ' ' + p.id).toLowerCase().includes(q)).slice(0, 3);
      if (!hit.length) return null;
      return hit.map(p => {
        const rate = p.rate_retail ? SSE.fmt(p.rate_retail) : 'Rate on request';
        return '<b>' + SSE.esc(p.name) + '</b><span>' + SSE.esc(p.brand) + ' · ' + rate + (p.stock > 0 ? ' · in stock' : ' · made to order') + '</span>' +
          '<div class="botrow"><a href="shop.html">Open in shop</a><a href="' + WA + encodeURIComponent('Requirement: ' + p.name + ' (' + p.brand + ') — rate and lead time?') + '" target="_blank" rel="noopener">WhatsApp rate</a></div>';
      }).join('<hr style="border:0;border-top:1px dashed var(--line);margin:8px 0">');
    });
  }
  async function ask(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    busy = true; inp.value = '';
    bubble('me', SSE.esc(text));
    chips([]);
    const t = typing();
    const delay = ms => new Promise(r => setTimeout(r, ms));
    try {
      const q = text.toLowerCase();
      const m = q.match(/(\d{3,}[a-z0-9x.\-]*)|([a-z]{1,4}\d{2,})/); // part numbers like 6205, 8x5, TG25
      let answered = false;
      if (m) {
        const hits = await search(m[0]);
        if (hits) { t.remove(); bubble('bot', 'Shelf check:<div class="botcard">' + hits + '</div>Aur kuch?'); answered = true; }
      }
      if (!answered) {
        for (const [re, ans] of kb) {
          if (re.test(q)) {
            await delay(450); t.remove();
            bubble('bot', ans + '<div class="botrow"><a href="' + WA + encodeURIComponent('Namaste, ' + text) + '" target="_blank" rel="noopener">WhatsApp team</a><a href="shop.html">Browse catalogue</a></div>');
            answered = true; break;
          }
        }
      }
      if (!answered) {
        await delay(500); t.remove();
        bubble('bot', 'Ye mere script se bahar hai — team seedha jawaab degi.<div class="botrow"><a href="' + WA + encodeURIComponent('Namaste, ' + text) + '" target="_blank" rel="noopener">WhatsApp: ' + text.slice(0, 60) + '</a><a href="tel:+917240107540">Call 72401 07540</a></div>');
      }
      chips(['Where is the shop?', 'Delivery time?', 'Payment options', 'Show pneumatics']);
    } catch (e) {
      t.remove();
      bubble('bot', 'Connection issue — WhatsApp par seedha likhiye.');
    }
    busy = false;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
  window.SSE_BOT_PROMPT = PROMPT;
})();
