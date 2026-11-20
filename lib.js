// Shared helpers. Read-only GoHighLevel (LeadConnector v2) API access only.
export const API_BASE = 'https://services.leadconnectorhq.com';
export const API_VERSION = '2021-07-28';

export const DEFAULT_SITES = ['x.com', 'twitter.com', 'reddit.com', 'linkedin.com', 'facebook.com', 'instagram.com', 'tiktok.com'];

export const DEFAULTS = {
  token: '',
  locationId: '',
  userId: '',            // optional: only count calls made by this GHL user
  sites: DEFAULT_SITES,
  unlockMinutes: 30,
  minCallSeconds: 0,     // 0 = any outbound call counts (even no-answer)
  requireConnected: false, // only count calls with status "completed"
  ghlAppUrl: 'https://app.gohighlevel.com',
  emergencySkip: false,  // one skip per day, off by default
  enabled: true
};

export async function getSettings() {
  const s = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...s };
}

export function normalizeDomain(d) {
  return String(d || '').trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
}

export function localMidnight(d = new Date()) {
  const m = new Date(d); m.setHours(0, 0, 0, 0); return m;
}

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function ghlGet(path, params, token) {
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Version: API_VERSION, Accept: 'application/json' }
  });
  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    const msg = body && (Array.isArray(body.message) ? body.message.join('; ') : body.message);
    const err = new Error(`GHL API ${res.status}${msg ? ': ' + msg : ''}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

/**
 * Lists call messages in the location since `since` (Date), newest first.
 * Uses GET /conversations/messages/export (scope: conversations/message.readonly).
 */
export async function listCallsSince(settings, since) {
  const out = [];
  let cursor;
  for (let page = 0; page < 5; page++) {
    const body = await ghlGet('/conversations/messages/export', {
      locationId: settings.locationId,
      channel: 'Call',
      limit: 100,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      startDate: since.toISOString(),
      cursor
    }, settings.token);
    out.push(...(body.messages || []));
    if (!body.nextCursor || !(body.messages || []).length) break;
    cursor = body.nextCursor;
  }
  return out;
}

export function isQualifyingCall(m, settings, since) {
  const type = m.messageType || m.type;
  if (type !== 'TYPE_CALL' && type !== 1) return false;
  if (m.direction !== 'outbound') return false;
  if (new Date(m.dateAdded).getTime() <= since.getTime()) return false;
  if (settings.userId && m.userId !== settings.userId) return false;
  const status = m.meta?.call?.status || m.status;
  if (settings.requireConnected && status !== 'completed') return false;
  const min = Number(settings.minCallSeconds) || 0;
  if (min > 0) {
    const dur = Number(m.meta?.call?.duration);
    if (!Number.isFinite(dur) || dur < min) return false;
  }
  return true;
}

export async function testConnection(settings) {
  if (!settings.token || !settings.locationId) throw new Error('Enter a token and location ID first.');
  const since = localMidnight();
  const calls = await listCallsSince(settings, since);
  const outbound = calls.filter(m => m.direction === 'outbound');
  return { callsToday: calls.length, outboundToday: outbound.length };
}
