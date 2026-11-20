# Call First 📞

A Chrome extension (Manifest V3) that blocks distracting sites — X/Twitter, Reddit, LinkedIn, Facebook, Instagram, TikTok, plus anything you add — until you've made **one outbound call in GoHighLevel (GHL)**.

When you open a blocked site, you're sent to a gate page. Make a call from your GHL sub-account, click **"I made my call — check"**, and the extension confirms it through the GHL API. If a new outbound call shows up, every blocked site unlocks for a set window (default 30 minutes). After that, they lock again.

No bypass button. If you want one, there's an optional emergency skip, once per day, and it's off by default.

## How verification works

The extension calls the LeadConnector v2 API, which is **read-only**:

```
GET https://services.leadconnectorhq.com/conversations/messages/export
    ?locationId=<your location>&channel=Call&startDate=<gate time ISO>&sortBy=createdAt&sortOrder=desc&limit=100
Headers: Authorization: Bearer <token>, Version: 2021-07-28
```

A call unlocks your sites when all of these are true:

- `messageType` is `TYPE_CALL` and `direction` is `outbound`
- `dateAdded` is later than the moment the gate was first shown
- Optional: it was made by a specific GHL user ID
- Optional: its status is `completed` (the call connected)
- Optional: `meta.call.duration` is at least your minimum number of seconds

The gate page also shows how many outbound calls were made today and how many unlocks you've earned today.

The extension never sends messages, places calls or writes anything to GHL.

## Install (Load unpacked)

1. Download or clone this repo, or unzip the release zip.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the folder that contains `manifest.json`.
5. The Settings page opens. Enter your token and location ID, click **Test connection**, then **Save**.

## Getting a GHL Private Integration token

1. In your GHL **sub-account**, go to **Settings → Private Integrations → Create new integration**.
2. Give it a name, for example "Call First".
3. Select the read scopes:
   - `conversations/message.readonly` (required, used to read call messages)
   - `conversations.readonly` (recommended)
4. Copy the token (`pit-…`) and paste it into Call First → Settings.
5. **Location ID:** use the ID in your GHL URL after `/location/`, or find it under Settings → Business Profile.
6. **Optional user ID:** fill this in to count only your own calls in a shared sub-account. Leave it blank to count calls from any user.

If you use a white-label domain, put it in "GHL app URL" so the **Open GHL** button goes to your own domain.

## Settings

| Setting | Default |
|---|---|
| Blocked sites | x.com, twitter.com, reddit.com, linkedin.com, facebook.com, instagram.com, tiktok.com |
| Unlock window | 30 min |
| Minimum call length | 0 s (any outbound call, even no-answer) |
| Only connected calls | off |
| Emergency skip (1/day) | off |

Adding a custom site makes Chrome ask for permission to redirect that domain.

## Privacy

- Your token and location ID stay in `chrome.storage.local` on your machine. They are never synced, logged or sent anywhere except `services.leadconnectorhq.com`.
- There are no analytics and no third-party servers.
- The `tabs` permission is used only to send tabs that are already open on blocked sites to the gate when the lock comes back on.

## Limitations

- GHL fills in call duration only after the call ends. Hang up before you click "check".
- If a minimum length or "connected only" is set, a call that's still in progress won't count yet.
- With no user ID set, a teammate's call in the same sub-account can unlock your sites.
- Blocking covers top-level page loads. Embedded frames are not blocked.
- Developer mode and Load unpacked mean you can always turn the extension off yourself. It's a commitment device, not a lock.

## License

MIT
