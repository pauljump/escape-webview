# escape-hatch

Links opened inside the **X, Instagram, Facebook, TikTok, LINE, …** apps run in a
stripped-down in-app browser (a webview). Sign-in, browser extensions, saved
passwords and payment autofill often break there. `escape-hatch` detects that
situation and gets the user into their **real browser** — automatically where the
OS allows it, and with a clean one-tap card where it doesn't.

~4 KB, no dependencies, no build step, no tracking. MIT.

---

## Two ways to use it

### 1. Wrap your links (nothing to add to your site)

Deploy the [`interstitial/`](interstitial/) folder to any static host
(Cloudflare Pages, GitHub Pages, Netlify, Vercel). Then share links shaped like:

```
https://go.yoursite.com/?u=https://yoursite.com/the-real-page
```

Post *that* URL on X. When it opens in the in-app browser, the card appears.
In a normal browser it redirects straight through — the user sees nothing.

Optional query params: `&name=Your%20Site`, `&app_ios=…`, `&app_android=…`.

> **Open-redirect note:** a public `?u=` endpoint will forward to *any* https URL.
> Edit `ALLOW_HOSTS` in `interstitial/index.html` to whitelist your own domains.

### 2. One line on your own page

```html
<script src="https://unpkg.com/escape-hatch" data-auto></script>
```

It runs on page load, does nothing in a normal browser, and shows the card when
it detects an in-app browser. Optional attributes:

| Attribute | Purpose |
|---|---|
| `data-name="My Site"` | Label shown in the card |
| `data-app-ios="https://…"` | Universal link / scheme for your iOS app |
| `data-app-android="https://…"` | Universal link / scheme for your Android app |
| `data-force` | Also show in desktop browsers (for development) |
| `data-url="https://…"` | Escape to a different URL than the current page |

### Programmatic

```js
import 'escape-hatch'; // or a <script> tag without data-auto

if (EscapeHatch.isInApp()) {
  EscapeHatch.init({
    url: 'https://yoursite.com/post',
    name: 'Your Site',
    app: { ios: 'https://yoursite.com/post', android: 'https://yoursite.com/post' }
  });
}
```

---

## What actually happens per platform

| Situation | Behaviour |
|---|---|
| **Android** in-app browser | Auto-jumps to the default browser via an `intent://` URL. "Open in browser" button is the backup. |
| **iOS** in-app browser | iOS gives webviews **no** way to launch Safari programmatically. The card offers: **Copy link**, **Open in Chrome / Firefox** (if installed), a best-effort "Try to open", and app-specific instructions for the built-in "Open in browser" menu item. |
| **App installed** + `app` deep link configured | "Open in the app" button (universal link / custom scheme). |
| **Normal browser** | Snippet: nothing. Interstitial: instant redirect. |

The honest summary: **Android escape is automatic; iOS is assisted, not automatic.**
That's an Apple platform limitation, not something any library can work around.

---

## Detected apps

X (Twitter), Instagram, Facebook, Messenger, TikTok, LinkedIn, Pinterest,
Snapchat, LINE, WeChat, KakaoTalk, the Google app, Slack, Discord.

Detection is allowlist-based on the User-Agent string, so normal Safari / Chrome
users are never shown the overlay by mistake. Add more in `APPS` in
[`src/escape-hatch.js`](src/escape-hatch.js).

---

## Develop

```
npm run serve   # http://localhost:8080/examples/snippet.html
```

Test on a phone by opening the served URL from a DM to yourself in the target app.

## Contributing

Issues and PRs welcome — especially new in-app browser fingerprints and better
per-app iOS instructions. No CLA.
