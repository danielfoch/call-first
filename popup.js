const s = await chrome.runtime.sendMessage({ type: 'stats' });
const el = document.getElementById('status');
if (s.unlockUntil && Date.now() < s.unlockUntil) {
  el.textContent = `Unlocked for ${Math.ceil((s.unlockUntil - Date.now()) / 60000)} more min. Unlocks today: ${s.unlocksToday}.`;
} else {
  el.textContent = `Locked. Make a call to unlock. Unlocks today: ${s.unlocksToday}.`;
}
