// content.js
(function () {
  const WIDGET_ID = 'atc-crm-widget';

  function ensureContainer() {
    let el = document.getElementById(WIDGET_ID);
    if (el) return el;

    // Try to find the "cards" container
    const cards = document.querySelector('.cards');
    el = document.createElement('div');
    el.id = WIDGET_ID;

    // Minimal styles that blend reasonably; we can tweak later
    el.style.borderRadius = '8px';
    el.style.border = '1px solid rgba(0,0,0,0.1)';
    el.style.padding = '16px';
    el.style.background = 'white';
    el.style.margin = '12px 0';

    el.innerHTML = `
      <div style="font-weight:700; font-size:18px; margin-bottom:8px;">ATC CRM</div>
      <div id="${WIDGET_ID}-body" style="color:#6b7280">Loading...</div>
    `;

    if (cards) {
      // Insert as the first card
      cards.prepend(el);
    } else {
      document.body.prepend(el);
    }
    return el;
  }

  function setBody(html) {
    const body = document.getElementById(`${WIDGET_ID}-body`);
    if (body) body.innerHTML = html;
  }

  function getConversationIdFromUrl() {
    // /inbox/thread/{conversationId}
    const m = location.pathname.match(/\/inbox\/thread\/([^/?#]+)/i);
    return m ? decodeURIComponent(m[1]) : null;
  }

  let lastConvoId = null;
  let inFlight = null;

  async function loadForCurrentPage() {
    const container = ensureContainer();
    const convoId = getConversationIdFromUrl();
    if (!convoId) {
      setBody('Not on a conversation page.');
      return;
    }
    if (convoId === lastConvoId && inFlight) return; // debounce
    lastConvoId = convoId;

    setBody('Loading...');
    try {
      inFlight = new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: 'ATC_FETCH_CONVO', conversationId: convoId },
          (resp) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (!resp?.ok) {
              reject(new Error(resp?.error || 'Unknown error'));
              return;
            }
            resolve(resp.data);
          }
        );
      });

      const data = await inFlight;
      const count = Array.isArray(data?.reservations) ? data.reservations.length : 0;
      setBody(`<div>Number of Reservations: <strong>${count}</strong></div>`);
      inFlight = null;
    } catch (err) {
      console.error('ATC error:', err);
      setBody('Error loading data.');
      inFlight = null;
    }
  }

  // React to SPA navigations (Angular/Router based)
  const navObserver = new MutationObserver(() => {
    // When URL changes but page doesn't reload
    const cid = getConversationIdFromUrl();
    if (cid && cid !== lastConvoId) {
      loadForCurrentPage();
    }
  });
  navObserver.observe(document.documentElement, { childList: true, subtree: true });

  // Initial load (DOM may populate late; retry a couple times)
  let tries = 0;
  const kick = () => {
    tries += 1;
    loadForCurrentPage();
    if (tries < 5) setTimeout(kick, 800);
  };
  kick();
})();
