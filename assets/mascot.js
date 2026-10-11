/* ==========================================================
   SHREESHYAM ENTERPRISE - CARTOON MASCOT ("SHYAMU")
   Inspired by Strawberry Browser companion micro-interactions
   Desktop & Mobile compatible
   ========================================================== */

(function(){
  if(window.__SSE_MASCOT_INIT__) return;
  window.__SSE_MASCOT_INIT__ = true;

  const MASCOT_SVG = `
  <svg viewBox="0 0 100 110" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Character Drop Shadow / Ambient Glow -->
    <defs>
      <radialGradient id="helmetGrad" cx="40%" cy="30%" r="70%">
        <stop offset="0%" stop-color="#FEF08A"/>
        <stop offset="50%" stop-color="#FACC15"/>
        <stop offset="100%" stop-color="#CA8A04"/>
      </radialGradient>
      <radialGradient id="faceGrad" cx="45%" cy="40%" r="65%">
        <stop offset="0%" stop-color="#FFFBEB"/>
        <stop offset="60%" stop-color="#FEF3C7"/>
        <stop offset="100%" stop-color="#FDE68A"/>
      </radialGradient>
      <linearGradient id="wrenchGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#F1F5F9"/>
        <stop offset="50%" stop-color="#94A3B8"/>
        <stop offset="100%" stop-color="#475569"/>
      </linearGradient>
      <linearGradient id="vestGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2563EB"/>
        <stop offset="100%" stop-color="#1E3A8A"/>
      </linearGradient>
      <filter id="mascotGlow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#0F172A" flood-opacity="0.25"/>
      </filter>
    </defs>

    <!-- Body / Torso with Vest -->
    <g id="body" filter="url(#mascotGlow)">
      <ellipse cx="50" cy="84" rx="28" ry="20" fill="url(#vestGrad)"/>
      <!-- Reflective Safety Stripes on Vest -->
      <path d="M34 76 L34 94 M66 76 L66 94" stroke="#FDE047" stroke-width="3" stroke-linecap="round"/>
      <!-- White Collar -->
      <path d="M42 70 L50 78 L58 70" fill="#FFFFFF"/>
    </g>

    <!-- Head & Cheeks -->
    <g id="head">
      <ellipse cx="50" cy="56" rx="29" ry="26" fill="url(#faceGrad)" stroke="#B45309" stroke-width="1.2"/>
      
      <!-- Rosy Cheeks -->
      <circle cx="31" cy="62" r="5" fill="#FB7185" opacity="0.55"/>
      <circle cx="69" cy="62" r="5" fill="#FB7185" opacity="0.55"/>

      <!-- Expressive Blinking Eyes -->
      <g class="mascot-eye-blink">
        <!-- Left Eye -->
        <ellipse cx="38" cy="52" rx="5" ry="6.5" fill="#0F172A"/>
        <circle cx="36" cy="50" r="2.2" fill="#FFFFFF"/>
        <circle cx="40" cy="54" r="1.1" fill="#FFFFFF"/>

        <!-- Right Eye -->
        <ellipse cx="62" cy="52" rx="5" ry="6.5" fill="#0F172A"/>
        <circle cx="60" cy="50" r="2.2" fill="#FFFFFF"/>
        <circle cx="64" cy="54" r="1.1" fill="#FFFFFF"/>
      </g>

      <!-- Eyebrows (Cheerful) -->
      <path d="M33 43 Q38 40 43 43" stroke="#78350F" stroke-width="1.8" stroke-linecap="round" fill="none"/>
      <path d="M57 43 Q62 40 67 43" stroke="#78350F" stroke-width="1.8" stroke-linecap="round" fill="none"/>

      <!-- Happy Smile Mouth -->
      <path d="M44 63 Q50 70 56 63" stroke="#78350F" stroke-width="2.2" stroke-linecap="round" fill="#DC2626"/>
      <path d="M47 64 Q50 67 53 64" fill="#FDA4AF"/>
    </g>

    <!-- Industrial Safety Hardhat / Helmet -->
    <g id="helmet" filter="url(#mascotGlow)">
      <!-- Main Dome -->
      <path d="M21 44 C21 21 34 14 50 14 C66 14 79 21 79 44 Z" fill="url(#helmetGrad)" stroke="#A16207" stroke-width="1.5"/>
      <!-- Helmet Dome Ridge (Center Stripe) -->
      <path d="M47 14 C47 24 47 38 46 44 L54 44 C53 38 53 24 53 14 Z" fill="#FDE047" opacity="0.7"/>
      <!-- Reflective Safety Strip on Helmet -->
      <path d="M25 38 C32 35 68 35 75 38" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/>
      <!-- Helmet Brim -->
      <path d="M16 43 C26 40 74 40 84 43 C87 44 87 47 84 48 C74 51 26 51 16 48 C13 47 13 44 16 43 Z" fill="#EAB308" stroke="#854D0E" stroke-width="1.5"/>
      <!-- SSE Emblem on Helmet -->
      <circle cx="50" cy="27" r="5" fill="#1D4ED8" stroke="#FFFFFF" stroke-width="1"/>
      <text x="50" y="29.5" text-anchor="middle" fill="#FFFFFF" font-size="5" font-family="sans-serif" font-weight="900">S</text>
    </g>

    <!-- Left Hand Resting -->
    <g id="leftHand">
      <ellipse cx="22" cy="78" rx="5" ry="6" fill="#FDE68A" stroke="#B45309" stroke-width="1.2"/>
    </g>

    <!-- Right Hand Waving with Wrench -->
    <g id="rightHand" class="mascot-hand-wave">
      <!-- Cartoon Wrench -->
      <path d="M74 62 L88 44 C89 42 92 42 94 44 C95 45 95 47 93 49 L81 67 Z" fill="url(#wrenchGrad)" stroke="#334155" stroke-width="1.2"/>
      <circle cx="91" cy="44" r="4.5" fill="#64748B" stroke="#1E293B" stroke-width="1"/>
      <circle cx="91" cy="44" r="2.2" fill="#E2E8F0"/>
      <!-- Wrench head notch -->
      <path d="M89 42 L93 42" stroke="#0F172A" stroke-width="1.2"/>
      <!-- Hand / Glove -->
      <ellipse cx="74" cy="65" rx="6" ry="5.5" fill="#FDE68A" stroke="#B45309" stroke-width="1.2"/>
      <circle cx="77" cy="62" r="2.5" fill="#FDE68A"/>
    </g>
  </svg>
  `;

  const TIPS = [
    "Namaste! Need bulk industrial rates? 💬",
    "5,000+ items in stock with GST bill! ⚡",
    "SKF, FAG, Polymatic & Unbrako ready! 📦",
    "Same-day van dispatch in Neemrana! 🚚",
    "Tap me to send your requirement! 🔧"
  ];

  let currentTipIndex = 0;

  function createMascot() {
    if (document.getElementById('sseMascotWidget')) return;

    // 1. Create Floating Mascot Widget
    const widget = document.createElement('div');
    widget.id = 'sseMascotWidget';
    widget.className = 'sse-mascot-widget no-print';
    widget.innerHTML = `
      <div class="sse-mascot-bubble" id="mascotBubble" title="Tap to chat with Shyamu">
        <span class="bubble-text" id="mascotBubbleText">${TIPS[0]}</span>
        <button class="bubble-close" id="mascotBubbleClose" aria-label="Dismiss speech bubble">&times;</button>
      </div>
      <div class="sse-mascot-wrap" id="mascotAvatar" role="button" aria-label="Shyamu - Industrial Mascot">
        <div class="sse-mascot-art">${MASCOT_SVG}</div>
        <div class="sse-mascot-shadow"></div>
      </div>
    `;
    document.body.appendChild(widget);

    // 2. Create Modal Dialog with AI Live Chat
    const dialog = document.createElement('div');
    dialog.id = 'sseMascotDialog';
    dialog.className = 'sse-mascot-dialog no-print';
    dialog.innerHTML = `
      <div class="shyamu-chat-window">
        <div class="shyamu-chat-head">
          <div class="head-left">
            <div class="shyamu-mini-avatar">
              <svg viewBox="0 0 100 110" width="26" height="28">
                <ellipse cx="50" cy="56" rx="28" ry="25" fill="#FEF3C7"/>
                <path d="M22 43 C22 22 34 15 50 15 C66 15 78 22 78 43 Z" fill="#FACC15"/>
                <circle cx="50" cy="27" r="4.5" fill="#1D4ED8"/>
                <ellipse cx="38" cy="52" rx="4.5" ry="6" fill="#0F172A"/>
                <circle cx="36.5" cy="50.5" r="1.8" fill="#FFFFFF"/>
                <ellipse cx="62" cy="52" rx="4.5" ry="6" fill="#0F172A"/>
                <circle cx="60.5" cy="50.5" r="1.8" fill="#FFFFFF"/>
                <path d="M44 63 Q50 69 56 63" stroke="#DC2626" stroke-width="2" fill="none"/>
              </svg>
            </div>
            <div>
              <b class="head-title">Shyamu (Live AI Desk)</b>
              <small class="head-sub"><span class="dot-live"></span> 24/7 Industrial Assistant · RIICO Neemrana</small>
            </div>
          </div>
          <button class="sse-mascot-dialog-close" id="mascotDialogClose" aria-label="Close dialog">&times;</button>
        </div>

        <div class="shyamu-chat-body" id="shyamuChatBody">
          <div class="chat-msg bot">
            <div class="msg-bubble">
              Namaste! 🙏 I'm Shyamu, your 24/7 AI industrial assistant at Shree Shyam Enterprise. Ask me about SKF bearings, Polymatic valves, Mitsuboshi belts, GST tax bills, or same-day plant dispatch!
            </div>
            <span class="msg-time">Just now · Verified Desk</span>
          </div>
        </div>

        <!-- Quick Question Chips -->
        <div class="shyamu-quick-chips" id="shyamuQuickChips">
          <button type="button" data-q="What is the price of SKF 6205 bearing?">⚡ SKF 6205 Price</button>
          <button type="button" data-q="Do you have Polymatic 5/2 solenoid valve in stock?">💨 Polymatic 5/2 Valve</button>
          <button type="button" data-q="What is your dispatch lead time to Neemrana plants?">🚚 Neemrana Dispatch</button>
          <button type="button" data-q="Do you provide 100% GST tax invoices?">📄 GST & E-Way Bills</button>
        </div>

        <!-- Input Bar -->
        <form class="shyamu-input-bar" id="shyamuChatForm">
          <input type="text" id="shyamuChatInput" placeholder="Ask part number, size, or price..." autocomplete="off">
          <button type="submit" id="shyamuChatSendBtn" aria-label="Send message">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </form>

        <div class="shyamu-chat-actions">
          <a class="btn-wa-chip" href="https://wa.me/917240107540?text=Namaste%20Shyamu%2C%20mujhe%20industrial%20parts%20quote%20chahiye%3A%20" target="_blank" rel="noopener">
            <i class="hgi-stroke hgi-whatsapp"></i> Chat on WhatsApp Desk
          </a>
          <a class="btn-cat-chip" href="shop.html">
            <i class="hgi-stroke hgi-package"></i> Browse 5,000+ Parts
          </a>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);

    // 3. Attach Event Listeners
    const avatar = document.getElementById('mascotAvatar');
    const bubble = document.getElementById('mascotBubble');
    const bubbleText = document.getElementById('mascotBubbleText');
    const bubbleClose = document.getElementById('mascotBubbleClose');
    const dialogClose = document.getElementById('mascotDialogClose');
    const chatBody = document.getElementById('shyamuChatBody');
    const chatForm = document.getElementById('shyamuChatForm');
    const chatInput = document.getElementById('shyamuChatInput');
    const quickChips = document.getElementById('shyamuQuickChips');

    function toggleDialog(e) {
      if (e) e.stopPropagation();
      dialog.classList.toggle('active');
      if (dialog.classList.contains('active')) {
        chatInput.focus();
        chatBody.scrollTop = chatBody.scrollHeight;
      }
    }

    avatar.addEventListener('click', toggleDialog);
    bubble.addEventListener('click', function(e){
      if(e.target === bubbleClose) return;
      toggleDialog(e);
    });

    bubbleClose.addEventListener('click', function(e){
      e.stopPropagation();
      bubble.style.display = 'none';
    });

    dialogClose.addEventListener('click', function(){
      dialog.classList.remove('active');
    });

    document.addEventListener('click', function(e){
      if (!dialog.contains(e.target) && !widget.contains(e.target)) {
        dialog.classList.remove('active');
      }
    });

    // AI Chat Engine
    function getAiAnswer(q) {
      const query = q.toLowerCase();
      if (query.includes('6205') || query.includes('skf') || query.includes('bearing') || query.includes('fag') || query.includes('nbc')) {
        return "SKF & FAG deep groove ball bearings (including 6205-2RS, 6204, 6308) are stocked in ready shelf quantities. Genuine boxed with intact holographic tamper seals. Dispatched in 25 mins with GST Tax Invoice (HSN 8482).";
      }
      if (query.includes('polymatic') || query.includes('valve') || query.includes('solenoid') || query.includes('pneumatic') || query.includes('cylinder') || query.includes('frl')) {
        return "We are authorized Polymatic distributors. Ready stock of 5/2, 5/3, and 3/2 solenoid valves (1/8\" & 1/4\" BSP), PU tubing (4mm to 12mm), cylinders, and FRL modular units. Same-day delivery across Neemrana.";
      }
      if (query.includes('belt') || query.includes('mitsuboshi') || query.includes('timing') || query.includes('gates') || query.includes('v-belt')) {
        return "Mitsuboshi and Gates transmission belts available in all standard classical V-belts (A, B, C, D section), Poly-V (PK, PL), and HTD timing belts (5M, 8M, 14M). Instant matching on machine breakdown.";
      }
      if (query.includes('dispatch') || query.includes('neemrana') || query.includes('delivery') || query.includes('time') || query.includes('van') || query.includes('lead')) {
        return "Our dedicated delivery van provides same-day dispatch across RIICO Neemrana, Japanese Zone, Ghiloth, and Behror. Breakdown orders average 25-minute dispatch.";
      }
      if (query.includes('gst') || query.includes('tax') || query.includes('invoice') || query.includes('e-way') || query.includes('hsn') || query.includes('bill')) {
        return "100% of our sales include computerized GST Tax Invoices and E-Way bills. HSN codes (8482, 8481, 4010, 7318) strictly match for zero-error GSTR-1 audit reconciliation.";
      }
      if (query.includes('credit') || query.includes('payment') || query.includes('term') || query.includes('po')) {
        return "Approved corporate plant accounts in RIICO get 30-day revolving credit terms on formal Purchase Order (PO). Instant counter billing available via UPI or RTGS.";
      }
      return "Got it! For this specific plant BOM or breakdown requirement, send part photo or size to our WhatsApp desk (+91 72401 07540) and our engineers will reply with a stamped quote within 2 working hours.";
    }

    function appendMessage(sender, text) {
      const msgDiv = document.createElement('div');
      msgDiv.className = `chat-msg ${sender}`;
      msgDiv.innerHTML = `
        <div class="msg-bubble">${text}</div>
        <span class="msg-time">${sender === 'user' ? 'You' : 'Shyamu · Live'} · ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
      `;
      chatBody.appendChild(msgDiv);
      chatBody.scrollTop = chatBody.scrollHeight;
    }

    function handleUserSend(text) {
      if (!text || !text.trim()) return;
      appendMessage('user', text.trim());
      chatInput.value = '';

      // Typing indicator
      const typing = document.createElement('div');
      typing.className = 'chat-msg bot typing-ind';
      typing.innerHTML = `<div class="msg-bubble"><span class="dots"><span>.</span><span>.</span><span>.</span></span> Shyamu is checking stock...</div>`;
      chatBody.appendChild(typing);
      chatBody.scrollTop = chatBody.scrollHeight;

      setTimeout(function() {
        typing.remove();
        const ans = getAiAnswer(text);
        appendMessage('bot', ans);
      }, 700);
    }

    chatForm.addEventListener('submit', function(e) {
      e.preventDefault();
      handleUserSend(chatInput.value);
    });

    quickChips.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', function() {
        handleUserSend(btn.dataset.q);
      });
    });

    // 4. On scroll, immediately dismiss speech bubble so it never blocks content
    window.addEventListener('scroll', function(){
      if (bubble && bubble.style.display !== 'none') {
        bubble.style.display = 'none';
      }
    }, { passive: true });

    // On mobile screens, hide speech bubble after 3.5 seconds
    if (window.innerWidth < 1020) {
      setTimeout(function(){
        if(bubble) bubble.style.display = 'none';
      }, 3500);
    } else {
      // Rotating Speech Bubble Quotes on desktop
      setInterval(function(){
        if (bubble.style.display === 'none') return;
        currentTipIndex = (currentTipIndex + 1) % TIPS.length;
        bubble.style.animation = 'none';
        void bubble.offsetWidth; // trigger reflow
        bubbleText.textContent = TIPS[currentTipIndex];
        bubble.style.animation = 'bubblePop .4s cubic-bezier(0.34,1.56,0.64,1) both';
      }, 7000);
    }

    // 5. If Hero Mascot Badge exists, link it
    const heroBadge = document.getElementById('heroMascotBadge');
    if (heroBadge) {
      heroBadge.addEventListener('click', toggleDialog);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createMascot);
  } else {
    createMascot();
  }
})();
