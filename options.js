import { getSettings, normalizeDomain, DEFAULT_SITES } from './lib.js';
const $ = id => document.getElementById(id);
const setMsg = (el, t, c = '') => { $(el).textContent = t; $(el).className = 'msg ' + c; };

async function load() {
  const s = await getSettings();
  $('token').value = s.token; $('locationId').value = s.locationId; $('userId').value = s.userId;
  $('ghlAppUrl').value = s.ghlAppUrl; $('sites').value = (s.sites || DEFAULT_SITES).join('\n');
  $('unlockMinutes').value = s.unlockMinutes; $('minCallSeconds').value = s.minCallSeconds;
  $('requireConnected').checked = !!s.requireConnected; $('emergencySkip').checked = !!s.emergencySkip; $('enabled').checked = !!s.enabled;
}

const DEFAULT_HOSTS = new Set(DEFAULT_SITES);

async function save() {
  const sites = [...new Set($('sites').value.split(/\s+/).map(normalizeDomain).filter(Boolean))];
  const custom = sites.filter(d => !DEFAULT_HOSTS.has(d));
  if (custom.length) {
    const origins = custom.flatMap(d => [`*://${d}/*`, `*://*.${d}/*`]);
    const granted = await chrome.permissions.request({ origins }).catch(() => false);
    if (!granted) return setMsg('msg', 'Chrome needs permission to redirect the custom sites. Not saved.', 'err');
  }
  await chrome.storage.local.set({
    token: $('token').value.trim(),
    locationId: $('locationId').value.trim(),
    userId: $('userId').value.trim(),
    ghlAppUrl: $('ghlAppUrl').value.trim() || 'https://app.gohighlevel.com',
    sites,
    unlockMinutes: Math.max(1, parseInt($('unlockMinutes').value, 10) || 30),
    minCallSeconds: Math.max(0, parseInt($('minCallSeconds').value, 10) || 0),
    requireConnected: $('requireConnected').checked,
    emergencySkip: $('emergencySkip').checked,
    enabled: $('enabled').checked
  });
  await chrome.runtime.sendMessage({ type: 'applyRules' });
  $('sites').value = sites.join('\n');
  setMsg('msg', 'Saved.', 'ok');
}

$('save').addEventListener('click', save);
$('test').addEventListener('click', async () => {
  await save();
  setMsg('testMsg', 'Testing…');
  const r = await chrome.runtime.sendMessage({ type: 'test' });
  if (r.ok) setMsg('testMsg', `Connected. Calls in this location today: ${r.callsToday} (${r.outboundToday} outbound).`, 'ok');
  else setMsg('testMsg', r.error, 'err');
});
$('relock').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'relockNow' });
  setMsg('msg', 'Locked.', 'ok');
});
load();
