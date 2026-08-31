/*!
 * escape-webview v0.1.0
 * Break out of in-app browsers (X, Instagram, Facebook, TikTok, LINE, ...) into
 * the user's real browser -- or, when the OS forbids that, show a one-tap card
 * with a working alternative.
 *
 * MIT License. https://github.com/pauljump/escape-webview
 *
 * Usage (snippet mode, on your own page):
 *   <script src="/escape-webview.js" data-auto></script>
 *
 * Usage (programmatic):
 *   EscapeWebview.init({ url: 'https://example.com/post', name: 'Example',
 *                      app: { ios: 'https://...', android: 'https://...' } });
 */
(function () {
  'use strict';

  var W = window, D = document, UA = navigator.userAgent || '';

  /* ---- in-app browser fingerprints ---------------------------------------- */
  /* Only known tokens are matched, so a normal Safari/Chrome user is never
     shown the overlay by accident. */
  var APPS = [
    { re: /Twitter/i,                     key: 'x',        name: 'X' },
    { re: /Instagram/i,                   key: 'instagram', name: 'Instagram' },
    { re: /Messenger(?:ForiOS|Lite)|\bMessenger\b/i,
                                          key: 'facebook', name: 'Messenger' },
    { re: /FBAN|FBAV|FB_IAB|FBIOS|FB4A/i, key: 'facebook', name: 'Facebook' },
    { re: /musical_ly|Bytedance|TikTok/i, key: 'tiktok',   name: 'TikTok' },
    { re: /Barcelona/i,                   key: 'instagram', name: 'Threads' },
    { re: /Reddit\//i,                    key: 'menu',     name: 'Reddit' },
    { re: /WhatsApp/i,                    key: 'menu',     name: 'WhatsApp' },
    { re: /LinkedInApp/i,                 key: 'menu',     name: 'LinkedIn' },
    { re: /Pinterest/i,                   key: 'menu',     name: 'Pinterest' },
    { re: /Snapchat/i,                    key: 'menu',     name: 'Snapchat' },
    { re: /\bLine\//i,                    key: 'menu',     name: 'LINE' },
    { re: /MicroMessenger/i,              key: 'menu',     name: 'WeChat' },
    { re: /KAKAOTALK/i,                   key: 'menu',     name: 'KakaoTalk' },
    { re: /GSA\//i,                       key: 'menu',     name: 'the Google app' },
    { re: /\bSlack\b/i,                   key: 'menu',     name: 'Slack' },
    { re: /Discord/i,                     key: 'menu',     name: 'Discord' }
  ];

  // Steps for the host app's own "open externally" menu item. This is the only
  // route out of an iOS webview that reliably works, so it is shown as the
  // primary instruction. Pipe-separated; each segment renders as one <li>.
  var IOS_HINTS = {
    x:        'Tap the share icon <b>↑</b> in the bottom bar|Choose <b>Open in Safari</b>',
    instagram:'Tap <b>•••</b> at the top right|Choose <b>Open in external browser</b>',
    facebook: 'Tap <b>•••</b> at the top right|Choose <b>Open in external browser</b>',
    tiktok:   'Tap <b>•••</b> at the top right|Choose <b>Open in browser</b>',
    menu:     'Open the app’s menu (usually <b>•••</b> or the share icon)|Choose <b>Open in browser</b>'
  };
  var ANDROID_HINT =
    'Tap ⋮ at the top-right, then “Open in browser” or “Open in Chrome”.';

  function detect() {
    for (var i = 0; i < APPS.length; i++) {
      if (APPS[i].re.test(UA)) return APPS[i];
    }
    return null;
  }

  var isIOS = /iPhone|iPod|iPad/i.test(UA) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/i.test(UA);

  /* ---- helpers ----------------------------------------------------------- */
  function safeHttp(u) {
    try {
      var p = new URL(u, location.href);
      if (p.protocol === 'http:' || p.protocol === 'https:') return p.href;
    } catch (e) {}
    return null;
  }

  // Deep links legitimately use custom schemes (myapp://) or https universal
  // links, so safeHttp() is too strict here. Deny the script-bearing schemes
  // instead: esc() stops attribute breakout but would happily emit
  // href="javascript:...", which fires on tap.
  var BAD_SCHEME = /^(?:javascript|data|vbscript|file|blob):/i;
  function safeDeepLink(u) {
    if (!u || typeof u !== 'string') return null;
    // Browsers ignore control characters and whitespace when resolving a URL,
    // so "java\tscript:alert(1)" still executes. Normalise before testing.
    var clean = u.replace(/[\u0000-\u0020]/g, '');
    return BAD_SCHEME.test(clean) ? null : u;
  }

  // Android: an intent:// URL asks the OS to hand the link to a real browser
  // instead of re-opening it inside the current app's webview.
  function toIntent(url) {
    var rest = url.replace(/^https?:\/\//i, '').split('#')[0];
    return 'intent://' + rest +
      '#Intent;scheme=https;action=android.intent.action.VIEW;' +
      'category=android.intent.category.BROWSABLE;' +
      'S.browser_fallback_url=' + encodeURIComponent(url) + ';end';
  }

  function chromeUrl(u) {
    return u.replace(/^https:/i, 'googlechromes:').replace(/^http:/i, 'googlechrome:');
  }

  // Ask the OS to handle a custom scheme from a subframe. Webviews that block
  // top-level scheme navigation sometimes still honour this; the iframe is torn
  // down either way so nothing is left behind.
  function iframeHit(href) {
    try {
      var f = D.createElement('iframe');
      f.setAttribute('aria-hidden', 'true');
      f.style.display = 'none';
      f.style.width = f.style.height = '0';
      f.style.border = '0';
      (D.body || D.documentElement).appendChild(f);
      try { f.contentWindow.location.href = href; } catch (e) { f.src = href; }
      setTimeout(function () { f.parentNode && f.parentNode.removeChild(f); }, 2000);
    } catch (e) {}
  }
  function firefoxUrl(u) {
    return 'firefox://open-url?url=' + encodeURIComponent(u);
  }

  function copy(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); },
                                              function () { done(false); });
      return;
    }
    try {
      var ta = D.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      D.body.appendChild(ta); ta.select();
      var ok = D.execCommand('copy');
      D.body.removeChild(ta); done(ok);
    } catch (e) { done(false); }
  }

  /* ---- overlay UI ------------------------------------------------------- */
  function render(cfg, app) {
    if (D.getElementById('escape-webview-root')) return;

    var host = D.createElement('div');
    host.id = 'escape-webview-root';
    var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : null;
    var root = shadow || host;

    var appName = app ? app.name : 'this app';
    var hintKey = app ? app.key : 'menu';
    var deepLink = safeDeepLink(isIOS ? (cfg.app && cfg.app.ios)
                                      : isAndroid ? (cfg.app && cfg.app.android) : null);

    var css = [
      ':host{all:initial;position:fixed;inset:0;z-index:2147483647}',
      '*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
      '.wrap{position:fixed;inset:0;display:flex;align-items:flex-end;justify-content:center;',
      '  background:rgba(0,0,0,.55);backdrop-filter:blur(2px)}',
      '@media(min-width:560px){.wrap{align-items:center}}',
      '.card{width:100%;max-width:420px;margin:12px;padding:22px;border-radius:18px;',
      '  background:#fff;color:#0b0b0c;box-shadow:0 20px 60px rgba(0,0,0,.35)}',
      '@media(prefers-color-scheme:dark){.card{background:#161618;color:#f4f4f5}}',
      'h1{margin:0 0 6px;font-size:17px;font-weight:650;letter-spacing:-.01em}',
      'p{margin:0 0 16px;font-size:13.5px;line-height:1.45;opacity:.72}',
      'a.btn,button.btn{display:block;width:100%;margin:8px 0 0;padding:13px 16px;border:0;',
      '  border-radius:12px;font-size:15px;font-weight:600;text-align:center;text-decoration:none;',
      '  cursor:pointer;-webkit-tap-highlight-color:transparent}',
      '.primary{background:#0b0b0c;color:#fff}',
      '@media(prefers-color-scheme:dark){.primary{background:#f4f4f5;color:#0b0b0c}}',
      '.ghost{background:transparent;color:inherit;border:1px solid rgba(128,128,128,.35)}',
      '.chips{display:flex;gap:8px;margin-top:10px}',
      '.chips .btn{margin:0}',
      '.hint{margin-top:16px;padding:11px 13px;border-radius:11px;font-size:12.5px;line-height:1.4;',
      '  background:rgba(128,128,128,.12)}',
      '.hint[hidden]{display:none}',
      // The step list is the thing that actually works on iOS, so it gets the
      // visual weight a primary action would normally get.
      'ol.steps{margin:0 0 18px;padding:14px 16px 14px 34px;border-radius:12px;',
      '  background:rgba(128,128,128,.12);font-size:14px;line-height:1.5}',
      'ol.steps li{margin:2px 0}',
      'ol.steps b{font-weight:680}',
      'p.or{margin:14px 0 0;font-size:12px;text-align:center;opacity:.5}',
      '.dismiss{margin-top:14px;font-size:12px;opacity:.5;background:none;border:0;color:inherit;',
      '  width:100%;cursor:pointer}',
      '.ok{opacity:1;color:#128a4b;font-weight:600}'
    ].join('');

    var h = [];
    h.push('<div class="wrap"><div class="card" role="dialog" aria-modal="true">');
    h.push('<h1>Open in your browser</h1>');
    h.push('<p>You’re viewing ' + (cfg.name ? esc(cfg.name) : 'this page') +
           ' inside ' + esc(appName) +
           '. Some things (sign-in, extensions, saved passwords) only work in your real browser.</p>');

    if (deepLink) {
      h.push('<a class="btn primary" href="' + esc(deepLink) + '">Open in the app</a>');
    }

    if (isAndroid) {
      h.push('<button class="btn primary" id="eh-go">Open in browser</button>');
      h.push('<button class="btn ghost" id="eh-copy">Copy link</button>');
      h.push('<div class="hint">' + esc(ANDROID_HINT) + '</div>');

    } else if (isIOS) {
      // iOS gives a webview no way to hand a URL to Safari. target="_blank" just
      // re-opens in the same in-app webview, and x-safari-https:// is blocked in
      // current iOS. The only thing that always works is the host app's own
      // "Open in Safari" menu item -- so that is the headline, not a footnote.
      // The scheme buttons stay as quick wins, but they fail *silently* when the
      // browser isn't installed, so each one self-reports (see wireEscape).
      //
      // Measured in X for iPhone 12.21 / iOS 26.6: every custom scheme is
      // blocked (googlechromes, x-safari-https, firefox, x-web-search,
      // x-callback, shortcuts, and the same via hidden iframe -- 11 of 11).
      // window.open is the only call that hands the URL off, so it leads.
      h.push('<button class="btn primary" id="eh-open">Open in browser</button>');

      // NOT escaped, deliberately: IOS_HINTS values are trusted literals defined
      // above and carry intentional <b> markup. No caller input reaches them.
      h.push('<p class="or">if that doesn’t leave the app</p>');
      h.push('<ol class="steps">' + (IOS_HINTS[hintKey] || IOS_HINTS.menu)
        .split('|').map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>');
      h.push('<button class="btn ghost" id="eh-copy">Copy link</button>');
      h.push('<div class="chips">');
      h.push('<a class="btn ghost" id="eh-chrome" href="' + esc(chromeUrl(cfg.url)) + '">Chrome</a>');
      h.push('<a class="btn ghost" id="eh-firefox" href="' + esc(firefoxUrl(cfg.url)) + '">Firefox</a>');
      h.push('</div>');
      h.push('<div class="hint" id="eh-note" hidden></div>');

    } else {
      h.push('<a class="btn primary" href="' + esc(cfg.url) +
             '" target="_blank" rel="noopener">Open in browser</a>');
      h.push('<button class="btn ghost" id="eh-copy">Copy link</button>');
      // Same trusted literal, flattened to one sentence. "Choose X" reads wrong
      // after "then", so drop the verb on the trailing segments.
      h.push('<div class="hint">' + IOS_HINTS.menu.split('|')
        .map(function (s, i) { return i ? s.replace(/^Choose /, '') : s; })
        .join(', then ') + '.</div>');
    }

    h.push('<button class="dismiss" id="eh-x">Keep viewing here</button>');
    h.push('</div></div>');

    // Style via a constructable stylesheet: not subject to style-src CSP, so the
    // card renders even on sites with a strict `style-src 'self'` policy.
    var styled = false;
    if (shadow) {
      try {
        var sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        shadow.adoptedStyleSheets = [sheet];
        styled = true;
      } catch (e) {}
    }
    var markup = h.join('');
    if (!styled) {
      // Fallback for engines without constructable sheets (iOS Safari < 16.4).
      // The injected <style> is subject to style-src, so a strict CSP will drop
      // it -- position the host inline regardless, so the card is still a modal
      // rather than unstyled text at the foot of the page.
      markup = '<style>' + css + '</style>' + markup;
      host.style.position = 'fixed'; host.style.top = 0; host.style.left = 0;
      host.style.right = 0; host.style.bottom = 0; host.style.zIndex = 2147483647;
    }
    root.innerHTML = markup;
    (D.body || D.documentElement).appendChild(host);

    // querySelector works on both a ShadowRoot and a plain Element host.
    var $ = function (id) { return root.querySelector('#' + id); };

    var go = $('eh-go');
    if (go) go.addEventListener('click', function () { location.href = toIntent(cfg.url); });

    var copyBtn = $('eh-copy');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      copy(cfg.url, function (ok) {
        copyBtn.textContent = ok ? 'Link copied ✓ — now paste it in your browser'
                                 : 'Copy failed — long-press the link instead';
        if (ok) copyBtn.classList.add('ok');
      });
    });

    // Tapping a custom scheme for an app that isn't installed does nothing at
    // all on iOS -- no error, no navigation, no way to feature-detect first.
    // That reads as "the button is broken". So: watch for the page going
    // hidden (which is what a successful hand-off looks like) and if it hasn't
    // happened shortly after the tap, say so instead of leaving them guessing.
    function wireEscape(id, label, scheme) {
      var el = $(id), note = $('eh-note');
      if (!el || !note) return;
      el.addEventListener('click', function () {
        var left = false;
        var onLeave = function () { left = true; };
        D.addEventListener('visibilitychange', onLeave);
        W.addEventListener('pagehide', onLeave);
        W.addEventListener('blur', onLeave);

        // The anchor's own href is the top-level attempt. Some in-app browsers
        // refuse top-level custom-scheme navigation but still let a subframe
        // reach the OS handler, so race a hidden iframe against it. Whichever
        // the host app permits wins; if it forbids both, nothing happens and
        // the timeout below explains why.
        setTimeout(function () { if (!left && !D.hidden) iframeHit(scheme); }, 120);

        setTimeout(function () {
          D.removeEventListener('visibilitychange', onLeave);
          W.removeEventListener('pagehide', onLeave);
          W.removeEventListener('blur', onLeave);
          if (left || D.hidden) return;          // hand-off worked; nothing to say
          note.hidden = false;
          note.textContent = label + ' didn’t open. ' + esc(appName) +
            ' blocks apps from launching other apps, so use the steps above ' +
            '— or copy the link and paste it in ' + label + '.';
        }, 1800);
      });
    }
    wireEscape('eh-chrome', 'Chrome', chromeUrl(cfg.url));
    wireEscape('eh-firefox', 'Firefox', firefoxUrl(cfg.url));

    // The only route out of X's webview that the OS actually honours. A
    // returned Window means the host app kept it in-context (a tab inside the
    // same in-app browser), which is not an escape -- so say so rather than
    // claim success.
    var openBtn = $('eh-open');
    if (openBtn) openBtn.addEventListener('click', function () {
      var note = $('eh-note'), w = null, inContext = false;
      try { w = W.open(cfg.url, '_blank'); } catch (e) {}
      if (w) { inContext = true; try { w.focus(); } catch (e) {} }
      setTimeout(function () {
        if (D.hidden) return;                    // left the app; nothing to say
        if (!note) return;
        note.hidden = false;
        note.textContent = inContext
          ? 'That opened a new tab inside ' + appName +
            ', not your browser. Use the steps above.'
          : appName + ' blocked that. Use the steps above, or copy the link.';
      }, 1800);
    });

    var x = $('eh-x');
    if (x) x.addEventListener('click', function () {
      host.parentNode && host.parentNode.removeChild(host);
    });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---- public API ------------------------------------------------------ */
  var API = {
    isInApp: function () { return !!detect(); },
    app: detect,

    init: function (opts) {
      opts = opts || {};
      var url = safeHttp(opts.url || location.href);
      if (!url) { if (W.console) console.warn('[escape-webview] no valid http(s) url'); return; }
      var cfg = { url: url, name: opts.name || null, app: opts.app || null };
      var app = detect();

      if (!app && !opts.force) return;               // normal browser: do nothing

      // Android can usually leave silently -- try once, then show the card as backup.
      if (app && isAndroid && opts.auto !== false) {
        try { location.href = toIntent(url); } catch (e) {}
      }
      var show = function () { render(cfg, app || { name: 'this app', key: 'menu' }); };
      if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', show);
      else show();
    }
  };

  W.EscapeWebview = API;

  /* ---- auto-init from the <script> tag -------------------------------- */
  var cs = D.currentScript;
  if (cs && cs.dataset && !('manual' in cs.dataset)) {
    var d = cs.dataset;
    if ('auto' in d || 'url' in d || 'appIos' in d || 'appAndroid' in d) {
      API.init({
        url: d.url || location.href,
        name: d.name,
        force: d.force === '' || d.force === 'true',
        auto: d.auto !== 'false',
        app: (d.appIos || d.appAndroid) ? { ios: d.appIos, android: d.appAndroid } : null
      });
    }
  }
  if (W.EscapeWebviewConfig) API.init(W.EscapeWebviewConfig);
})();
