// content.js — robust SPA routing + early injection + light logs
(() => {
  // Only operate on /inbox/thread/<id> pages
  const ROUTE_REGEX_PATH = /^\/inbox\/thread\/([a-f0-9-]{6,})/i;

  // Timings
  const MIN_FETCH_INTERVAL_MS = 400;
  const CONTAINER_RETRY_MS = 400;
  const CONTAINER_RETRY_WINDOW_MS = 12000;
  const URL_POLL_MS = 500;

  // State
  let booted = false;
  let isFetching = false;
  let lastFetchTs = 0;
  let currentConversationId = null;
  let lastRenderedCid = null;
  let containerRetryTimer = null;
  let containerRetryEndTs = 0;
  let lastUrl = location.href;

  // --- tiny logger to help verify injection ---
  const log = (...a) => console.log("[ATC][content]", ...a);

  // DOM helpers
  const qs  = (sel, root = document) => root.querySelector(sel);
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
    path.setAttribute('d', 'M18.97 16.03 12 9.06l-6.97 6.97-1.06-1.06 7.145-7.145a1.26 1.26 0 0 1 1.77 0l7.145 7.145z');
    svg.appendChild(path);
    return svg;
  }

  function autosizeTA(el) {
    if (!el) return;
    el.style.height = 'auto';
    const h = Math.max(120, el.scrollHeight);
    el.style.height = `${h}px`;
  }

  // Minimal styles for textarea look
  function injectAtcStyles() {
    if (document.getElementById('atc-styles')) return;
    const css = `
    ui-collapsible-card.atc-atc-card .textarea-container { width: 100%; margin-top: 8px; }
    ui-collapsible-card.atc-atc-card textarea.cdk-textarea-autosize {
      display: block; width: 100%; min-height: 120px; line-height: 1.5; font-size: 16px;
      padding: 16px 18px; border: 1px solid #E4E2E8; border-radius: 8px; background: #fff;
      transition: border-color .15s ease, box-shadow .15s ease; box-sizing: border-box; resize: none;
    }
    ui-collapsible-card.atc-atc-card textarea.cdk-textarea-autosize:focus {
      outline: none; border-color: #C9C6D1; box-shadow: 0 0 0 3px rgba(83,60,184,.10);
    }`;
    const style = document.createElement('style');
    style.id = 'atc-styles';
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function createAtcCard() {
    injectAtcStyles();

    const card = document.createElement('ui-collapsible-card');
    card.className = 'ng-star-inserted atc-atc-card';

    const outer = document.createElement('div');
    outer.className = 'flex flex-col divider ng-star-inserted';
    outer.style.gap = '0px';

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
    uiIcon.className = 'mat-mdc-tooltip-trigger text-gray-500 group-hover:text-primary-600 ng-star-inserted open';
    uiIcon.setAttribute('aria-label', 'Collapse');
    uiIcon.appendChild(buildChevronSvg());

    header.appendChild(titleWrap);
    header.appendChild(uiIcon);

    // Body
    const bodyBlock = document.createElement('div');
    bodyBlock.className = 'ng-star-inserted';
    bodyBlock.setAttribute('data-atc-body', '');

    const section = document.createElement('div');
    section.className = 'section ng-star-inserted';

    const titleRow = document.createElement('div');
    titleRow.className = 'label';
    titleRow.id = 'atc-res-title';
    titleRow.textContent = 'Reservations (—)';

    const status = document.createElement('div');
    status.className = 'night-lighter text-sm';
    status.id = 'atc-status';
    status.textContent = 'Loading...';

    const list = document.createElement('ul');
    list.id = 'atc-res-list';
    list.style.listStyle = 'none';
    list.style.padding = '0';
    list.style.margin = '8px 0 0 0';

    // Notes
    const notesLabel = document.createElement('div');
    notesLabel.className = 'label';
    notesLabel.textContent = 'Notes';
    notesLabel.style.marginTop = '16px';

    const notesWrap = document.createElement('div');
    notesWrap.className = 'textarea-container';
    notesWrap.id = 'atc-notes-wrap';
    notesWrap.style.display = 'none';

    const ta = document.createElement('textarea');
    ta.id = 'atc-notes';
    ta.rows = 3;
    ta.placeholder = 'Add a note for this guest';
    ta.className = 'cdk-textarea-autosize ng-pristine ng-valid ng-touched';
    ta.style.minHeight = '120px';
    ta.style.height = '120px';
    ta.disabled = true;
    notesWrap.appendChild(ta);

    const saveHint = document.createElement('div');
    saveHint.id = 'atc-notes-save';
    saveHint.className = 'night-lighter text-sm';
    saveHint.style.marginTop = '6px';
    saveHint.style.display = 'none';
    notesWrap.appendChild(saveHint);

    section.appendChild(titleRow);
    section.appendChild(status);
    section.appendChild(list);
    section.appendChild(notesLabel);
    section.appendChild(notesWrap);
    bodyBlock.appendChild(section);

    // Collapse
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
      // Place before "About ..." card if present
      const about = qsa('ui-collapsible-card h4').find(h => /^About\b/i.test(h.textContent || ''))?.closest('ui-collapsible-card');
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
    const ta = qs('#atc-notes', card);
    const hint = qs('#atc-notes-save', card);
    if (ta) ta.disabled = true;
    if (hint) { hint.style.display = ''; hint.textContent = 'Loading…'; }
  }

  function renderError(container, err) {
    const card = ensureCard(container);
    setStatus(card, 'Error loading data.');
    const hint = qs('#atc-notes-save', card);
    if (hint) { hint.style.display = ''; hint.textContent = 'Error loading'; }
    console.error('[ATC] error:', err);
  }

  function iconForReservation(res) {
    const url = (name) => chrome.runtime.getURL(name);
    if (res?.reservation_status?.current?.category === 'cancelled') {
      return url('icon-cancelled.png');
    }
    switch ((res?.platform || '').toLowerCase()) {
      case 'airbnb':   return url('icon-airbnb.png');
      case 'homeaway': return url('icon-vrbo.png');
      case 'direct':   return url('icon-hospitable.png');
      case 'manual':   return url('icon-direct.png');
      default:         return url('icon-direct.png');
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

  // Payload helpers
  const extractGuestId = (data) => data?.guest?.guestId || null;
  const extractHostNotes = (data) => (data?.guest?.hostNotes == null ? '' : String(data.guest.hostNotes));

  function renderData(container, data) {
    const card = ensureCard(container);
    const list = qs('#atc-res-list', card);
    if (!list) return;

    const reservations = Array.isArray(data?.reservations)
      ? [...data.reservations].sort((a, b) => {
          const ta = a?.arrival_date ? Date.parse(a.arrival_date) : -Infinity;
          const tb = b?.arrival_date ? Date.parse(b.arrival_date) : -Infinity;
          return tb - ta;
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
      const node = res?.conversation_id
        ? Object.assign(document.createElement('a'), {
            href: hospitableThreadHref(res.conversation_id),
            textContent: text,
            className: 'underline',
            target: '_blank',
            rel: 'noopener noreferrer'
          })
        : Object.assign(document.createElement('span'), { textContent: text });

      li.appendChild(img);
      li.appendChild(node);
      list.appendChild(li);
    });

    if (!reservations.length) {
      const empty = document.createElement('div');
      empty.className = 'night-lighter text-sm';
      empty.textContent = 'No reservations yet.';
      list.appendChild(empty);
    }

    // Notes
    const guestId = extractGuestId(data);
    const currentNotes = extractHostNotes(data);

    const wrap = qs('#atc-notes-wrap', card);
    const ta = qs('#atc-notes', card);
    const hint = qs('#atc-notes-save', card);

    if (wrap && ta && hint) {
      wrap.style.display = '';
      ta.disabled = false;
      ta.value = currentNotes;
      autosizeTA(ta);

      if (!guestId) {
        ta.disabled = true;
        hint.style.display = '';
        hint.textContent = 'Notes unavailable (no guestId).';
        ta.oninput = null;
      } else {
        hint.style.display = 'none';
        let tId = null;
        let lastSent = currentNotes;
        const show = (m) => { hint.style.display = ''; hint.textContent = m; };
        const hide = () => { hint.style.display = 'none'; hint.textContent = ''; };

        ta.oninput = () => {
          autosizeTA(ta);
          if (tId) clearTimeout(tId);
          const val = ta.value;
          if (val === lastSent) { hide(); return; }
          show('Saving…');
          tId = setTimeout(async () => {
            try {
              const r = await chrome.runtime.sendMessage({
                type: 'ATC_UPDATE_HOST_NOTES',
                guestId,
                hostNotes: val,
              });
              if (!r?.ok) throw new Error(r?.error || 'Failed to save');
              lastSent = val;
              show('Saved'); setTimeout(hide, 1200);
            } catch (e) {
              console.error('[ATC] notes save error:', e);
              show('Error saving');
            }
          }, 600);
        };
      }
    }
  }

  function getConversationIdFromLocation() {
    const m = location.pathname.match(ROUTE_REGEX_PATH);
    return m ? m[1] : null;
  }

  function findCardsContainer() {
    return qs('div.cards') || qs('ui-collapsible-card')?.parentElement || null;
  }

  async function fetchOnce(conversationId) {
    const now = Date.now();
    if (now - lastFetchTs < MIN_FETCH_INTERVAL_MS) return;
    if (isFetching) return;
    lastFetchTs = now;
    isFetching = true;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'ATC_FETCH_CONVO', conversationId });
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

  function startContainerRetry(conversationId) {
    if (containerRetryTimer) clearInterval(containerRetryTimer);
    containerRetryEndTs = Date.now() + CONTAINER_RETRY_WINDOW_MS;
    containerRetryTimer = setInterval(() => {
      const container = findCardsContainer();
      if (container) {
        clearInterval(containerRetryTimer);
        containerRetryTimer = null;
        renderLoading(container);
        fetchOnce(conversationId);
      } else if (Date.now() > containerRetryEndTs) {
        clearInterval(containerRetryTimer);
        containerRetryTimer = null;
        log('container not found within window; giving up for now');
      }
    }, CONTAINER_RETRY_MS);
  }

  function onRouteMaybeChanged() {
    const cid = getConversationIdFromLocation();

    // Only run on thread pages
    if (!cid) return;

    if (cid === currentConversationId && cid === lastRenderedCid) return;
    currentConversationId = cid;

    const container = findCardsContainer();
    if (container) {
      renderLoading(container);
      fetchOnce(cid);
    } else {
      startContainerRetry(cid);
    }
  }

  // Patch history so SPA navigations always notify us
  function installHistoryHook() {
    if (history.___atcPatched) return;
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    const fire = () => window.dispatchEvent(new Event('atc:location-changed'));
    history.pushState = function(...args) { const r = origPush.apply(this, args); fire(); return r; };
    history.replaceState = function(...args) { const r = origReplace.apply(this, args); fire(); return r; };
    history.___atcPatched = true;
  }

  // Debounced scheduler
  const schedule = (() => {
    let raf = null;
    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { raf = null; onRouteMaybeChanged(); });
    };
  })();

  function boot() {
    if (booted) return;
    booted = true;
    log('boot');

    installHistoryHook();
    window.addEventListener('atc:location-changed', schedule);
    window.addEventListener('popstate', schedule);

    // Observe heavy DOM changes (Angular re-renders)
    const rootObs = new MutationObserver(schedule);
    rootObs.observe(document.documentElement, { childList: true, subtree: true });

    // Run when DOM is ready (we injected at document_start)
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      schedule();
    } else {
      document.addEventListener('readystatechange', () => {
        if (document.readyState === 'interactive' || document.readyState === 'complete') {
          schedule();
        }
      });
    }

    // URL poller as a last resort (some apps bypass pushState/replaceState helpers)
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        log('url poll detected change:', lastUrl);
        schedule();
      }
    }, URL_POLL_MS);

    // Kick a few times during slow boots
    let tries = 0;
    const kick = setInterval(() => {
      tries++; schedule();
      if (tries >= 10) clearInterval(kick);
    }, 300);
  }

  boot();
})();
