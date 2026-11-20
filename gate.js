const $ = id => document.getElementById(id);
let target = location.hash.slice(1) || '';
try { target = decodeURIComponent(target); } catch { /* keep raw */ }
const send = msg => chrome.runtime.sendMessage(msg);

function setMsg(text, cls = '') { $('msg').textContent = text; $('msg').className = 'msg ' + cls; }

function goBack() {
  if (/^https?:\/\//.test(target)) location.replace(target);
  else setMsg('Unlocked. Open any site you like.', 'ok');
}

async function refresh() {
  const s = await send({ type: 'stats' });
  if (s.unlockUntil && Date.now() < s.unlockUntil) return goBack();
  $('unlocksToday').textContent = s.unlocksToday ?? 0;
  if (s.today && typeof s.today.outboundToday === 'number') $('callsToday').textContent = s.today.outboundToday;
  else if (s.today && s.today.error) $('callsToday').textContent = '?';
  const base = (s.ghlAppUrl || 'https://app.gohighlevel.com').replace(/\/+$/, '');
  $('openGhl').href = s.locationId ? `${base}/v2/location/${encodeURIComponent(s.locationId)}/contacts/smart_list/All` : base;
  $('skip').hidden = !s.skipAvailable;
  if (!s.locationId) setMsg('Set up your GHL token and location ID in Settings first.', 'warn');
}

async function init() {
  const { gateShownAt } = await send({ type: 'gateShown' });
  $('since').textContent = `Only calls placed after ${new Date(gateShownAt).toLocaleTimeString()} count.`;
  if (target) $('from').textContent = `You were heading to: ${target}`;
  await refresh();
}

$('check').addEventListener('click', async () => {
  $('check').disabled = true; setMsg('Checking GHL…');
  try {
    const r = await send({ type: 'check' });
    if (r.ok) {
      const mins = Math.round((r.until - Date.now()) / 60000);
      setMsg(`✅ Call verified${r.call?.duration ? ` (${r.call.duration}s)` : ''}. Unlocked for ${mins} min.`, 'ok');
      setTimeout(goBack, 1200);
    } else if (r.error) {
      setMsg(r.error, 'err');
    } else {
      setMsg(r.pendingOutbound
        ? 'Found a call, but it does not meet your minimum (length/connected). Note: duration appears only after the call ends.'
        : 'No new outbound call found yet. Make the call, hang up, then check again.', 'warn');
    }
    if (r.today && typeof r.today.outboundToday === 'number') $('callsToday').textContent = r.today.outboundToday;
  } catch (e) { setMsg(e.message, 'err'); }
  $('check').disabled = false;
});

$('skip').addEventListener('click', async () => {
  if (!confirm('Use your one emergency skip for today?')) return;
  const r = await send({ type: 'skip' });
  if (r.ok) { setMsg('Skip used. Unlocked.', 'warn'); setTimeout(goBack, 800); }
  else setMsg(r.error, 'err');
});

init();
