const cssUrl = chrome.runtime.getURL("inject.css");
const link = document.createElement("link");
link.rel = "stylesheet";
link.href = cssUrl;
document.documentElement.appendChild(link);

const SEL = {
  cardsRoot: "div.cards"
};

function getConversationIdFromUrl() {
  // URL pattern: https://my.hospitable.com/inbox/thread/{conversationId}
  const parts = window.location.pathname.split("/");
  const idx = parts.indexOf("thread");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return null;
}

function renderContainer() {
  // Reuse their look with minimal classes
  const container = document.createElement("ui-collapsible-card");
  container.className = "ng-star-inserted";
  container.innerHTML = `
    <div class="flex flex-col divider ng-star-inserted" style="gap:0px;">
      <div class="collapsible-card__header group">
        <div class="w-full">
          <h4 class="title" title="">ATC CRM</h4>
        </div>
      </div>
      <div class="ng-star-inserted">
        <div class="section ng-star-inserted">
          <ul class="atc-ul">
            <li class="atc-row" id="atc-status">Loading…</li>
          </ul>
        </div>
      </div>
    </div>
  `;
  return container;
}

function ensureInjected() {
  const root = document.querySelector(SEL.cardsRoot);
  if (!root) return null;

  // if already injected, reuse
  let existing = root.querySelector("ui-collapsible-card.atc-crm");
  if (existing) return existing;

  const card = renderContainer();
  card.classList.add("atc-crm");
  root.appendChild(card);
  return card;
}

function setStatus(text) {
  const el = document.getElementById("atc-status");
  if (el) el.textContent = text;
}

async function loadAndRender() {
  const conversationId = getConversationIdFromUrl();
  const target = ensureInjected();
  if (!target || !conversationId) return;

  try {
    setStatus("Loading…");
    const res = await chrome.runtime.sendMessage({
      type: "FETCH_GUEST_BY_CONVERSATION",
      conversationId
    });

    if (!res?.ok) {
      console.log("ATC CRM fetch error:", res);
      setStatus("Error loading data.");
      return;
    }

    const { data } = res;
    const count = Array.isArray(data?.reservations)
      ? data.reservations.length
      : 0;

    setStatus(`Number of Reservations: ${count}`);
  } catch (err) {
    console.log("ATC CRM runtime error:", err);
    setStatus("Error loading data.");
  }
}

// initial run (Angular may render async, so try a few times)
let attempts = 0;
const maxAttempts = 20;

const interval = setInterval(() => {
  attempts++;
  const root = document.querySelector(SEL.cardsRoot);
  if (root) {
    clearInterval(interval);
    loadAndRender();
  } else if (attempts >= maxAttempts) {
    clearInterval(interval);
  }
}, 500);

// also react to SPA navigations (Hospitable is an SPA)
let lastPath = location.pathname;
const obs = new MutationObserver(() => {
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    if (/^\/inbox\/thread\//.test(lastPath)) {
      loadAndRender();
    }
  }
});
obs.observe(document.body, { childList: true, subtree: true });
