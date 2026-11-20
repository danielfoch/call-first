import { getSettings, normalizeDomain, listCallsSince, isQualifyingCall, localMidnight, todayKey, testConnection } from './lib.js';

const RULE_BASE = 1000;
const RELOCK_ALARM = 'relock';

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function isUnlocked() {
  const { unlockUntil = 0 } = await chrome.storage.local.get('unlockUntil');
  return Date.now() < unlockUntil;
}

async function applyRules() {
  const settings = await getSettings();
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map(r => r.id);
  const addRules = [];
  const unlocked = await isUnlocked();
  if (settings.enabled && !unlocked) {
    const gate = chrome.runtime.getURL('gate.html');
    const domains = [...new Set((settings.sites || []).map(normalizeDomain).filter(Boolean))];
    domains.forEach((d, i) => {
      addRules.push({
        id: RULE_BASE + i,
        priority: 1,
        action: { type: 'redirect', redirect: { regexSubstitution: `${gate}#\\0` } },
        condition: {
          regexFilter: `^https?://([^/]*\\.)?${escapeRe(d)}(:[0-9]+)?(/.*)?$`,
          resourceTypes: ['main_frame']
        }
      });
    });
  }
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
  return { locked: addRules.length > 0 };
}

async function sendOpenTabsToGate() {
  const settings = await getSettings();
  const domains = (settings.sites || []).map(normalizeDomain).filter(Boolean);
  const tabs = await chrome.tabs.query({});
  const gate = chrome.runtime.getURL('gate.html');
  for (const t of tabs) {
    if (!t.url) continue;
    let host;
    try { host = new URL(t.url).hostname.replace(/^www\./, ''); } catch { continue; }
    if (domains.some(d => host === d || host.endsWith('.' + d))) {
      chrome.tabs.update(t.id, { url: `${gate}#${t.url}` }).catch(() => {});
    }
  }
}

async function unlock(minutes, reason) {
  const unlockUntil = Date.now() + minutes * 60 * 1000;
  await chrome.storage.local.set({ unlockUntil, gateShownAt: 0, lastUnlockReason: reason });
  await chrome.alarms.create(RELOCK_ALARM, { when: unlockUntil });
  await applyRules();
  return unlockUntil;
}

async function relock() {
  await chrome.storage.local.set({ unlockUntil: 0 });
  await applyRules();
  await sendOpenTabsToGate();
}

async function gateShown() {
  // Record the moment the gate first appeared since the last unlock; only calls after this count.
  const { gateShownAt = 0 } = await chrome.storage.local.get('gateShownAt');
  if (await isUnlocked()) return gateShownAt || Date.now();
  if (!gateShownAt) {
    const now = Date.now();
    await chrome.storage.local.set({ gateShownAt: now });
    return now;
  }
  return gateShownAt;
}

async function statsToday(settings) {
  const calls = await listCallsSince(settings, localMidnight());
  const mine = calls.filter(m => isQualifyingCall(m, { ...settings, minCallSeconds: 0, requireConnected: false }, localMidnight()));
  return { outboundToday: mine.length };
}

async function checkCall() {
  const settings = await getSettings();
  if (!settings.token || !settings.locationId) return { ok: false, error: 'Set your GHL token and location ID in Options first.' };
  const gateShownAt = await gateShown();
  const since = new Date(gateShownAt);
  const calls = await listCallsSince(settings, since);
  const hit = calls.find(m => isQualifyingCall(m, settings, since));
  const today = await statsToday(settings).catch(() => null);
  if (hit) {
    const { unlockCount = {} } = await chrome.storage.local.get('unlockCount');
    const k = todayKey();
    unlockCount[k] = (unlockCount[k] || 0) + 1;
    await chrome.storage.local.set({ unlockCount, lastVerifiedCall: { at: hit.dateAdded, duration: hit.meta?.call?.duration ?? null, status: hit.meta?.call?.status || hit.status } });
    const until = await unlock(Number(settings.unlockMinutes) || 30, 'call');
    return { ok: true, until, call: { at: hit.dateAdded, duration: hit.meta?.call?.duration ?? null }, today };
  }
  const pending = calls.filter(m => m.direction === 'outbound' && new Date(m.dateAdded) > since).length;
  return { ok: false, gateShownAt, pendingOutbound: pending, today };
}

async function emergencySkip() {
  const settings = await getSettings();
  if (!settings.emergencySkip) return { ok: false, error: 'Emergency skip is disabled in Options.' };
  const { lastSkipDay } = await chrome.storage.local.get('lastSkipDay');
  if (lastSkipDay === todayKey()) return { ok: false, error: 'Already used today.' };
  await chrome.storage.local.set({ lastSkipDay: todayKey() });
  const until = await unlock(Number(settings.unlockMinutes) || 30, 'skip');
  return { ok: true, until };
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await applyRules();
  if (reason === 'install') chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(applyRules);

chrome.alarms.onAlarm.addListener(a => { if (a.name === RELOCK_ALARM) relock(); });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.sites || changes.enabled)) applyRules();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg && msg.type) {
        case 'gateShown': return { gateShownAt: await gateShown() };
        case 'check': return await checkCall();
        case 'stats': {
          const s = await getSettings();
          const { unlockUntil = 0, unlockCount = {}, gateShownAt = 0, lastSkipDay } = await chrome.storage.local.get(['unlockUntil', 'unlockCount', 'gateShownAt', 'lastSkipDay']);
          let today = null;
          if (s.token && s.locationId) today = await statsToday(s).catch(e => ({ error: e.message }));
          return { unlockUntil, unlocksToday: unlockCount[todayKey()] || 0, gateShownAt, skipAvailable: s.emergencySkip && lastSkipDay !== todayKey(), today, ghlAppUrl: s.ghlAppUrl, locationId: s.locationId };
        }
        case 'test': return { ok: true, ...(await testConnection(await getSettings())) };
        case 'skip': return await emergencySkip();
        case 'relockNow': await relock(); return { ok: true };
        case 'applyRules': return await applyRules();
        default: return { error: 'unknown message' };
      }
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  })().then(sendResponse);
  return true;
});
