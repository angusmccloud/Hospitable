// content.js
(() => {
  // Matches /inbox/thread/{conversationId}
  const ROUTE_REGEX_PATH = /^\/inbox\/thread\/([a-f0-9-]{6,})/i;

  let currentConversationId = null;
  let lastRenderedCid = null;
  let isFetching = false;
  let lastFetchTs = 0;

  // ---------------- DOM helpers ----------------
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

  function buildChevronSvg() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('data-testid', 'griddy-chevron-up');
    svg.setAttribute('style', 'min-width: 20px; height: 20px; width: 20px;');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute(
      'd',
      'M18.97 16.03 12 9.06l-6.97 6.97-1.06-1.06 7.145-7.145a1.26 1.26 0 0 1 1.77 0l7.145 7.145z'
    );
    svg.appendChild(path);
    return svg;
  }

  function createAtcCard() {
    const card = document.createElement('ui-collapsible-card');
    card.className = 'ng-star-inserted atc-atc-card';

    const outer = document.createElement('div');
    outer.className = 'flex flex-col divider ng-star-inserted';
    outer.setAttribute('style', 'gap: 0px;');

    // Header
    const header = document.createElement('div');
    header.className = 'collapsible-card__header group flex items-center justify-between';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'w-full';

    const h4 = document.createElement('h4');
    h4.setAttribute('title', '');
    h4.textContent = 'ATC CRM';

    titleWrap.appendChild(h4);

    const uiIcon = document.createElement('ui-icon');
    uiIcon.className =
      'mat-mdc-tooltip-trigger text-gray-500 group-hover:text-primary-600 ng-star-inserted open';
    uiIcon.setAttribute('aria-label', 'Collapse');
    uiIcon.appendChild(buildChevronSvg());

    header.appendChild(titleWrap);
    header.appendChild(uiIcon);

    // Body (collapsible content)
    const bodyBlock = document.createElement('div');
    bodyBlock.className = 'ng-star-inserted';
    bodyBlock.setAttribute('data-atc-body', '');

    const section = document.createElement('div');
    section.className = 'section ng-star-inserted';

    // Title row: "Reservations (#)"
    const titleRow = document.createElement('div');
    titleRow.className = 'label';
    titleRow.id = 'atc-res-title';
    titleRow.textContent = 'Reservations (—)';

    // Status line (errors / loading)
    const status = document.createElement('div');
    status.className = 'night-lighter text-sm';
    status.id = 'atc-status';
    status.textContent = 'Loading...';

    // The list
    const list = document.createElement('ul');
    list.id = 'atc-res-list';
    list.style.listStyle = 'none';
    list.style.padding = '0';
    list.style.margin = '8px 0 0 0';

    section.appendChild(titleRow);
    section.appendChild(status);
    section.appendChild(list);
    bodyBlock.appendChild(section);

    // collapse handling
    header.addEventListener('click', () => {
      const isOpen = uiIcon.classList.contains('open');
      if (isOpen) {
        uiIcon.classList.remove('open');
        bodyBlock.style.display = 'none';
      } else {
        uiIcon.classList.add('open');
        bodyBlock.style.display = '';
      }
    });

    outer.appendChild(header);
    outer.appendChild(bodyBlock);
    card.appendChild(outer);

    return card;
  }

  function ensureCard(container) {
    let card = qs('ui-collapsible-card.atc-atc-card', container);
    if (!card) {
      card = createAtcCard();
      // Insert directly before the "About ..." card to match the screenshot layout.
      const about = qsa('ui-collapsible-card h4').find(h =>
        /^About\b/i.test(h.textContent || '')
      )?.closest('ui-collapsible-card');
      if (about && about.parentElement) {
        about.parentElement.insertBefore(card, about);
      } else {
        container.prepend(card);
      }
    }
    return card;
  }

  function setTitleCount(card, count) {
    const t = qs('#atc-res-title', card);
    if (t) t.textContent = `Reservations (${count})`;
  }

  function setStatus(card, msg) {
    const s = qs('#atc-status', card);
    if (!s) return;
    s.textContent = msg || '';
    s.style.display = msg ? '' : 'none';
  }

  function renderLoading(container) {
    const card = ensureCard(container);
    setTitleCount(card, '—');
    setStatus(card, 'Loading...');
    const list = qs('#atc-res-list', card);
    if (list) list.innerHTML = '';
  }

  function renderError(container, err) {
    const card = ensureCard(container);
    setStatus(card, 'Error loading data.');
    console.log('[ATC] error:', err);
  }

  // Icon selection with cancelled override
  function iconForReservation(res) {
    const url = (name) => chrome.runtime.getURL(name);

    if (res?.reservation_status?.current?.category === 'cancelled') {
      return url('icon-cancelled.png');
    }
    switch ((res?.platform || '').toLowerCase()) {
      case 'airbnb':
        return url('icon-airbnb.png');
      case 'homeaway':
        return url('icon-vrbo.png');
      case 'direct':
        return url('icon-hospitable.png');
      case 'manual':
        return url('icon-direct.png');
      default:
        // fallback to direct-looking icon
        return url('icon-direct.png');
    }
  }

  function formatYearAndNights(res) {
    let year = '—';
    try {
      if (res?.arrival_date) {
        const d = new Date(res.arrival_date);
        if (!isNaN(d)) year = String(d.getFullYear());
      }
    } catch {}
    const nights = Number.isFinite(+res?.nights) ? +res.nights : 0;
    const nightsLabel = `${nights} night${nights === 1 ? '' : 's'}`;
    return `${year} - ${nightsLabel}`;
  }

  function hospitableThreadHref(conversationId) {
    return `https://my.hospitable.com/inbox/thread/${encodeURIComponent(conversationId)}`;
  }

 function renderData(container, data) {
  const card = ensureCard(container);
  const list = qs('#atc-res-list', card);
  if (!list) return;

  // Copy + sort by arrival_date DESC (most recent first)
  const reservations = Array.isArray(data?.reservations)
    ? [...data.reservations].sort((a, b) => {
        const ta = a?.arrival_date ? Date.parse(a.arrival_date) : -Infinity;
        const tb = b?.arrival_date ? Date.parse(b.arrival_date) : -Infinity;
        return tb - ta; // newer first
      })
    : [];

  setTitleCount(card, reservations.length);
  setStatus(card, '');

  list.innerHTML = '';

  reservations.forEach((res) => {
    const li = document.createElement('li');
    li.className = 'flex gap-2 items-center ng-star-inserted';
    li.style.padding = '6px 0';

    const img = document.createElement('img');
    img.src = iconForReservation(res);
    img.alt = res?.platform || 'reservation';
    img.style.width = '20px';
    img.style.height = '20px';
    img.style.minWidth = '20px';

    const text = formatYearAndNights(res);

    let textNode;
    if (res?.conversation_id) {
      const a = document.createElement('a');
      a.href = hospitableThreadHref(res.conversation_id);
      a.textContent = text;
      a.className = 'underline';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      textNode = a;
    } else {
      const span = document.createElement('span');
      span.textContent = text;
      textNode = span;
    }

    li.appendChild(img);
    li.appendChild(textNode);
    list.appendChild(li);
  });

  if (!reservations.length) {
    const empty = document.createElement('div');
    empty.className = 'night-lighter text-sm';
    empty.textContent = 'No reservations yet.';
    list.appendChild(empty);
  }
}

  // --------------- SPA / route handling ----------------

  function getConversationIdFromLocation() {
    const m = location.pathname.match(ROUTE_REGEX_PATH);
    return m ? m[1] : null;
  }

  function findCardsContainer() {
    return qs('div.cards') || qs('ui-collapsible-card')?.parentElement || null;
  }

  async function fetchOnce(conversationId) {
    const now = Date.now();
    if (now - lastFetchTs < 400) return;
    lastFetchTs = now;
    if (isFetching) return;
    isFetching = true;

    try {
      const res = await chrome.runtime.sendMessage({
        type: 'ATC_FETCH_CONVO',
        conversationId,
      });

      const container = findCardsContainer();
      if (!container) return;

      if (!res?.ok) throw new Error(res?.error || 'Unknown error');
      renderData(container, res.data);
    } catch (err) {
      const container = findCardsContainer();
      if (container) renderError(container, err);
    } finally {
      isFetching = false;
      lastRenderedCid = conversationId;
    }
  }

  function updateForRouteChange() {
    const cid = getConversationIdFromLocation();
    if (!cid) return;

    if (cid === currentConversationId && cid === lastRenderedCid) return;
    currentConversationId = cid;

    const container = findCardsContainer();
    if (!container) return;
    renderLoading(container);
    fetchOnce(cid);
  }

  const schedule = (() => {
    let raf = null;
    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = null;
        updateForRouteChange();
      });
    };
  })();

  document.addEventListener('readystatechange', () => {
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
      schedule();
    }
  });
  schedule();

  let lastHref = location.href;
  new MutationObserver(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      schedule();
    }
  }).observe(document, { subtree: true, childList: true });

  const rootObs = new MutationObserver(() => schedule());
  rootObs.observe(document.documentElement, { childList: true, subtree: true });
})();
