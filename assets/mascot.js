/* ==========================================================
   SHREESHYAM ENTERPRISE - LIVE INDUSTRIAL COUNTER DESK
   Official Procurement & Technical Spares Support Desk
   Desktop & Mobile compatible — Zero AI slop / Zero cartoon emojis
   ========================================================== */

(function(){
  if(window.__SSE_MASCOT_INIT__) return;
  window.__SSE_MASCOT_INIT__ = true;

  const TIPS = [
    "Counter Desk: Fast part lookup",
    "10,000+ line items in shelf stock with GST bill",
    "SKF, FAG, Polymatic & Unbrako ready on shelf",
    "25-min breakdown van dispatch across Neemrana",
    "Tap here for immediate part availability"
  ];

  let currentTipIndex = 0;

  function createDeskWidget() {
    if (document.getElementById('sseMascotWidget')) return;

    // 1. Create Floating Counter Helpdesk Launcher
    const widget = document.createElement('div');
    widget.id = 'sseMascotWidget';
    widget.className = 'sse-mascot-widget no-print';
    widget.innerHTML = `
      <div class="sse-mascot-bubble" id="mascotBubble" title="Tap to chat with Counter Desk">
        <span class="bubble-text" id="mascotBubbleText">${TIPS[0]}</span>
        <button class="bubble-close" id="mascotBubbleClose" aria-label="Dismiss message">&times;</button>
      </div>
      <div class="sse-desk-launcher" id="mascotAvatar" role="button" aria-label="Open Counter Sales Desk">
        <div class="desk-launcher-icon">
          <i class="hgi-stroke hgi-headset"></i>
        </div>
        <span class="desk-launcher-pulse"></span>
      </div>
    `;
    document.body.appendChild(widget);

    // 2. Create Modal Dialog with Counter Live Desk
    const dialog = document.createElement('div');
    dialog.id = 'sseMascotDialog';
    dialog.className = 'sse-mascot-dialog no-print';
    dialog.innerHTML = `
      <div class="shyamu-chat-window">
        <div class="shyamu-chat-head">
          <div class="head-left">
            <div class="shyamu-mini-avatar">
              <i class="hgi-stroke hgi-headset" style="font-size:18px;color:#FFFFFF"></i>
            </div>
            <div>
              <b class="head-title">Shree Shyam Counter Desk</b>
              <small class="head-sub"><span class="dot-live"></span> Hanuman Market · RIICO Neemrana</small>
            </div>
          </div>
          <button class="sse-mascot-dialog-close" id="mascotDialogClose" aria-label="Close dialog">&times;</button>
        </div>

        <div class="shyamu-chat-body" id="shyamuChatBody">
          <div class="chat-msg bot">
            <div class="msg-bubble">
              Shree Shyam Enterprise Counter Desk. Check shelf availability, wholesale rates, and same-day van dispatch for SKF/FAG bearings, Polymatic pneumatics, Mitsuboshi belts, and Unbrako fasteners across RIICO Neemrana.
            </div>
            <span class="msg-time">Counter Online · Verified Stock</span>
          </div>
        </div>

        <!-- Quick Question Chips (Clean HugeIcons) -->
        <div class="shyamu-quick-chips" id="shyamuQuickChips">
          <button type="button" data-q="What is the price of SKF 6205 bearing?"><i class="hgi-stroke hgi-settings-01"></i> SKF 6205 Stock & Rate</button>
          <button type="button" data-q="Do you have Polymatic 5/2 solenoid valve in stock?"><i class="hgi-stroke hgi-wind-power-02"></i> Polymatic 5/2 Valve</button>
          <button type="button" data-q="What is your dispatch lead time to Neemrana plants?"><i class="hgi-stroke hgi-delivery-truck-01"></i> Neemrana Van Dispatch</button>
          <button type="button" data-q="Do you provide 100% GST tax invoices?"><i class="hgi-stroke hgi-document-validation"></i> GST & E-Way Bill</button>
        </div>

        <!-- Input Bar -->
        <form class="shyamu-input-bar" id="shyamuChatForm">
          <input type="text" id="shyamuChatInput" placeholder="Enter part number, size, or OEM brand..." autocomplete="off">
          <button type="submit" id="shyamuChatSendBtn" aria-label="Send inquiry">
            <i class="hgi-stroke hgi-arrow-right-01" style="font-size:16px"></i>
          </button>
        </form>

        <div class="shyamu-chat-actions">
          <a class="btn-wa-chip" href="https://wa.me/917240107540?text=Namaste%20Shree%20Shyam%2C%20mujhe%20industrial%20parts%20quote%20chahiye%3A%20" target="_blank" rel="noopener">
            <i class="hgi-stroke hgi-whatsapp"></i> WhatsApp Direct Desk
          </a>
          <a class="btn-cat-chip" href="shop.html">
            <i class="hgi-stroke hgi-package"></i> Browse 10,000+ Parts
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

    // Technical Inventory Response Engine
    function getDeskAnswer(q) {
      const query = q.toLowerCase();
      if (query.includes('6205') || query.includes('skf') || query.includes('bearing') || query.includes('fag') || query.includes('nbc')) {
        return "SKF & FAG deep groove ball bearings (including 6205-2RS, 6204, 6308) are stocked in shelf quantities. Genuine boxed with intact holographic seals. Dispatched in 25 mins with GST Tax Invoice (HSN 8482).";
      }
      if (query.includes('polymatic') || query.includes('valve') || query.includes('solenoid') || query.includes('pneumatic') || query.includes('cylinder') || query.includes('frl')) {
        return "Authorized Polymatic distributors: Ready stock of 5/2, 5/3, and 3/2 solenoid valves (1/8\" & 1/4\" BSP), PU tubing (4mm to 12mm), cylinders, and FRL modular units. Same day delivery across Neemrana.";
      }
      if (query.includes('belt') || query.includes('mitsuboshi') || query.includes('timing') || query.includes('gates') || query.includes('v-belt')) {
        return "Mitsuboshi and Gates transmission belts available in all standard classical V-belts (A, B, C, D section), Poly-V (PK, PL), and HTD timing belts (5M, 8M, 14M). Instant matching on machine breakdown.";
      }
      if (query.includes('fastener') || query.includes('bolt') || query.includes('unbrako') || query.includes('nut') || query.includes('screw')) {
        return "Unbrako high tensile Grade 12.9 socket head cap screws, button heads, counter-sunk, and grub screws in stock from M3 to M36 in metric and UNC/UNF threads.";
      }
      if (query.includes('gst') || query.includes('invoice') || query.includes('tax') || query.includes('hsn') || query.includes('eway')) {
        return "Every dispatch includes an authorized GST Tax Invoice with itemized 8 digit HSN codes and computer generated E-Way bill. Automatically maps to your GSTR-2B input credit.";
      }
      if (query.includes('dispatch') || query.includes('delivery') || query.includes('time') || query.includes('van') || query.includes('urgent')) {
        return "Dedicated van delivery to Neemrana Phase I, II, III, Japanese Zone, Ghiloth, and Behror industrial areas. Standard breakdown transit time is under 25 minutes from counter.";
      }
      return "Part logged at counter desk. We have 10,000+ items ready on shelf. For instant price quote and stock hold, click WhatsApp Direct Desk below or call +91 72401 07540.";
    }

    function appendMessage(sender, text) {
      const msgDiv = document.createElement('div');
      msgDiv.className = `chat-msg ${sender}`;
      msgDiv.innerHTML = `
        <div class="msg-bubble">${text}</div>
        <span class="msg-time">${sender === 'user' ? 'You' : 'Sales Desk'} · Just now</span>
      `;
      chatBody.appendChild(msgDiv);
      chatBody.scrollTop = chatBody.scrollHeight;
      return msgDiv;
    }

    // Smooth typewriter streaming output (no blinking)
    function streamBotMessage(fullText) {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'chat-msg bot';
      const bubbleEl = document.createElement('div');
      bubbleEl.className = 'msg-bubble';
      bubbleEl.textContent = '';
      const timeSpan = document.createElement('span');
      timeSpan.className = 'msg-time';
      timeSpan.textContent = 'Sales Desk · Just now';
      
      msgDiv.appendChild(bubbleEl);
      msgDiv.appendChild(timeSpan);
      chatBody.appendChild(msgDiv);

      let charIndex = 0;
      const speed = 14; // smooth typing ms
      const interval = setInterval(() => {
        if (charIndex < fullText.length) {
          bubbleEl.textContent += fullText.charAt(charIndex);
          charIndex++;
          chatBody.scrollTop = chatBody.scrollHeight;
        } else {
          clearInterval(interval);
        }
      }, speed);
    }

    function handleUserSend(text) {
      if (!text || !text.trim()) return;
      appendMessage('user', text.trim());
      chatInput.value = '';

      // Typing indicator
      const typing = document.createElement('div');
      typing.className = 'chat-msg bot typing-ind';
      typing.innerHTML = `<div class="msg-bubble"><span class="dots"><span>.</span><span>.</span><span>.</span></span> Checking shelf inventory...</div>`;
      chatBody.appendChild(typing);
      chatBody.scrollTop = chatBody.scrollHeight;

      setTimeout(function() {
        typing.remove();
        const ans = getDeskAnswer(text);
        streamBotMessage(ans);
      }, 500);
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

    // Dismiss bubble on scroll
    window.addEventListener('scroll', function(){
      if (bubble && bubble.style.display !== 'none') {
        bubble.style.display = 'none';
      }
    }, { passive: true });

    if (window.innerWidth < 1020) {
      setTimeout(function(){
        if(bubble) bubble.style.display = 'none';
      }, 3500);
    } else {
      setInterval(function(){
        if (bubble.style.display === 'none') return;
        currentTipIndex = (currentTipIndex + 1) % TIPS.length;
        bubbleText.textContent = TIPS[currentTipIndex];
      }, 7000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createDeskWidget);
  } else {
    createDeskWidget();
  }
})();
