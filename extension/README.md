# ImmigrationClock browser extension

A Manifest V3 Chrome extension. The person picks a green card category and
country once; the popup shows that cell's final action and filing dates from
the newest hand-checked bulletin, how each moved since the month before, and
links to the wait-time page and the official State Department bulletin.

Once a day it reads `https://immigrationclock.com/api/v1/visa-bulletin`
(served by `src/app/api/v1/visa-bulletin/route.ts`, built from
`src/lib/visa-bulletin/data.ts`). When that file holds a newer month than the
one the person last saw, the icon shows NEW and, unless they turned it off,
one notification is shown.

The feed only changes when a month is added to `data.ts` and the site is
deployed, so the extension can never be ahead of the site.

## Permissions

`storage`, `alarms`, `notifications`. No host permissions: the feed is served
with `Access-Control-Allow-Origin: *`. No content scripts, no remote code, no
analytics.

## Files

- `manifest.json`
- `background.js`: daily check, badge, notification
- `popup.html`, `popup.css`, `popup.js`: the popup
- `shared.js`: feed fetch and date formatting
- `icons/`: rendered from `brand/assets` (16 micro cut, 32 and 48 small cut, 128 badge with 16 px padding)
- `store/`: Chrome Web Store screenshots and promo tile
- `STORE-LISTING.md`: listing text and privacy answers

## Packaging

```
cd extension && zip -r ../immigrationclock-extension-1.0.0.zip manifest.json background.js shared.js popup.html popup.css popup.js icons
```

Bump `version` in `manifest.json` for every upload.

## Trying it locally

`chrome://extensions`, turn on Developer mode, Load unpacked, pick this
folder. The popup needs the feed to be live on immigrationclock.com.
