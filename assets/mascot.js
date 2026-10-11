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

    // 2. Create Modal Dialog
    const dialog = document.createElement('div');
    dialog.id = 'sseMascotDialog';
    dialog.className = 'sse-mascot-dialog no-print';
    dialog.innerHTML = `
      <div class="sse-mascot-dialog-head">
        <span class="badge"><span class="dot"></span> Online Desk</span>
        <button class="sse-mascot-dialog-close" id="mascotDialogClose" aria-label="Close dialog">&times;</button>
      </div>
      <h4>Meet Shyamu 👷‍♂️</h4>
      <p>Your Shree Shyam Enterprise supply buddy. We quote, stock & dispatch 10,000+ genuine parts across RIICO Neemrana.</p>
      <div class="sse-mascot-actions">
        <a class="btn-wa" href="https://wa.me/917240107540?text=Namaste%20Shyamu%2C%20mujhe%20industrial%20parts%20quote%20chahiye%3A%20" target="_blank" rel="noopener">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/></svg>
          Quick Quote on WhatsApp
        </a>
        <a class="btn-shop" href="shop.html">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/></svg>
          Browse 5,000+ Catalogue
        </a>
      </div>
    `;
    document.body.appendChild(dialog);

    // 3. Attach Event Listeners
    const avatar = document.getElementById('mascotAvatar');
    const bubble = document.getElementById('mascotBubble');
    const bubbleText = document.getElementById('mascotBubbleText');
    const bubbleClose = document.getElementById('mascotBubbleClose');
    const dialogClose = document.getElementById('mascotDialogClose');

    function toggleDialog(e) {
      if (e) e.stopPropagation();
      dialog.classList.toggle('active');
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

    // 4. Rotating Speech Bubble Quotes every 6 seconds
    setInterval(function(){
      if (bubble.style.display === 'none') return;
      currentTipIndex = (currentTipIndex + 1) % TIPS.length;
      bubble.style.animation = 'none';
      void bubble.offsetWidth; // trigger reflow
      bubbleText.textContent = TIPS[currentTipIndex];
      bubble.style.animation = 'bubblePop .4s cubic-bezier(0.34,1.56,0.64,1) both';
    }, 6000);

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
