// background.js (MV3)

// ---- Cognito config ----
const COGNITO = {
  domain: 'https://hospitable.auth.us-east-1.amazoncognito.com',
  clientId: '3fir1iq8um652rf9gv9t6bca7u',
  scopes: ['openid', 'email', 'phone', 'profile'],
  tokenEndpoint: 'https://hospitable.auth.us-east-1.amazoncognito.com/oauth2/token',
};

// ---- API config ----
const API_ORIGIN = 'https://n4kyd50ku7.execute-api.us-east-1.amazonaws.com';
const API_STAGE = 'v1';
const API_BASE = `${API_ORIGIN}/${API_STAGE}`; // e.g. https://.../v1

// ------------------------ utils ------------------------
function toQuery(params) {
  return new URLSearchParams(params).toString();
}

async function sha256base64url(str) {
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomHex(nBytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(nBytes)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function decodeJwtPayload(jwt) {
  try {
    const base64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(base64)));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// ------------------------ auth ------------------------
async function beginAuth() {
  const redirectUri = chrome.identity.getRedirectURL('callback'); // https://<id>.chromiumapp.org/callback
  const state = randomHex(12);
  const codeVerifier = randomHex(32);
  const codeChallenge = await sha256base64url(codeVerifier);

  const authorizeUrl = `${COGNITO.domain}/oauth2/authorize?${toQuery({
    response_type: 'code',
    client_id: COGNITO.clientId,
    redirect_uri: redirectUri,
    scope: COGNITO.scopes.join(' '),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  })}`;

  console.log('[ATC] Auth starting', { authorizeUrl, redirectUri });

  const redirectResponse = await chrome.identity.launchWebAuthFlow({
    url: authorizeUrl,
    interactive: true,
  });
  if (!redirectResponse) throw new Error('No redirect response from identity flow');

  const urlObj = new URL(redirectResponse);
  const code = urlObj.searchParams.get('code');
  const returnedState = urlObj.searchParams.get('state');
  if (!code) throw new Error('Authorization code missing');
  if (returnedState !== state) throw new Error('State mismatch');

  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: COGNITO.clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const tokenRes = await fetch(COGNITO.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '');
    throw new Error(`Token exchange failed: ${tokenRes.status} ${text}`);
  }

  const tokens = await tokenRes.json();
  await chrome.storage.local.set({ atcTokens: tokens, atcTokenSavedAt: Date.now() });

  const payload = decodeJwtPayload(tokens.id_token || '');
  console.log('[ATC] Received tokens; id_token token_use:', payload?.token_use, payload);
  return tokens;
}

// Return a valid **id_token** (what the API’s Cognito authorizer expects)
async function getValidIdToken() {
  const st = await chrome.storage.local.get(['atcTokens', 'atcTokenSavedAt']);
  let tokens = st.atcTokens;

  if (tokens?.id_token && tokens?.expires_in && st.atcTokenSavedAt) {
    const ageMs = Date.now() - st.atcTokenSavedAt;
    if (ageMs < (tokens.expires_in - 60) * 1000) return tokens.id_token;
  }

  const redirectUri = chrome.identity.getRedirectURL('callback');

  if (tokens?.refresh_token) {
    const form = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: COGNITO.clientId,
      refresh_token: tokens.refresh_token,
      redirect_uri: redirectUri,
    });
    const res = await fetch(COGNITO.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (res.ok) {
      const refreshed = await res.json();
      const merged = { ...tokens, ...refreshed, refresh_token: tokens.refresh_token || refreshed.refresh_token };
      await chrome.storage.local.set({ atcTokens: merged, atcTokenSavedAt: Date.now() });

      const payload = decodeJwtPayload(merged.id_token || '');
      console.log('[ATC] Refreshed tokens; id_token token_use:', payload?.token_use, payload);
      return merged.id_token;
    }
    console.warn('[ATC] Refresh failed, doing full auth');
  }

  tokens = await beginAuth();
  return tokens.id_token;
}

// If we ever get 401, clear tokens so the next call can re-auth
async function maybeResetAuthOn401(res) {
  if (res && res.status === 401) {
    await chrome.storage.local.remove(['atcTokens', 'atcTokenSavedAt']);
  }
}

// ------------------------ API calls ------------------------
async function apiFetchConversation(conversationId) {
  const idToken = await getValidIdToken();
  const url = `${API_BASE}/guests/by-conversation/${encodeURIComponent(conversationId)}`;
  console.log('[ATC] Fetching convo', conversationId);

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (!r.ok) {
    await maybeResetAuthOn401(r);
    const t = await r.text().catch(() => '');
    throw new Error(`API ${r.status}: ${t || r.statusText}`);
  }
  return r.json();
}

async function apiUpdateHostNotes(guestId, hostNotes) {
  const idToken = await getValidIdToken();
  const url = `${API_BASE}/guests/${encodeURIComponent(guestId)}/hostNotes`;

  const r = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ hostNotes }),
  });

  if (!r.ok) {
    await maybeResetAuthOn401(r);
    const t = await r.text().catch(() => '');
    throw new Error(`API ${r.status}: ${t || r.statusText}`);
  }
  return { ok: true };
}

// ------------------------ message router ------------------------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'ATC_FETCH_CONVO') {
        const data = await apiFetchConversation(msg.conversationId);
        sendResponse({ ok: true, data });
        return;
      }
      if (msg?.type === 'ATC_UPDATE_HOST_NOTES') {
        await apiUpdateHostNotes(msg.guestId, msg.hostNotes || '');
        sendResponse({ ok: true });
        return;
      }
      sendResponse({ ok: false, error: 'Unknown message type' });
    } catch (err) {
      console.error('[ATC] handler error:', err);
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();
  return true; // keep the channel open for async
});
