/*!
 * escape-hatch v0.1.0
 * Break out of in-app browsers (X, Instagram, Facebook, TikTok, LINE, ...) into
 * the user's real browser -- or, when the OS forbids that, show a one-tap card
 * with a working alternative.
 *
 * MIT License. https://github.com/OWNER/escape-hatch
 *
 * Usage (snippet mode, on your own page):
 *   <script src="https://unpkg.com/escape-hatch" data-auto></script>
 *
 * Usage (programmatic):
 *   EscapeHatch.init({ url: 'https://example.com/post', name: 'Example',
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
    { re: /FBAN|FBAV|FB_IAB|FBIOS|FB4A/i, key: 'facebook', name: 'Facebook' },
    { re: /\bMessenger\b/i,               key: 'facebook', name: 'Messenger' },
    { re: /musical_ly|Bytedance|TikTok/i, key: 'tiktok',   name: 'TikTok' },
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

  var IOS_HINTS = {
    x:        'Tap the share icon at the bottom of the screen, then “Open in Safari”.',
    instagram:'Tap ••• at the top-right, then “Open in external browser”.',
    facebook: 'Tap ••• at the top-right, then “Open in external browser”.',
    tiktok:   'Tap ••• at the top-right, then “Open in browser”.',
    menu:     'Open this page in your browser from the app’s menu (usually ••• or the share icon).'
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
    if (D.getElementById('escape-hatch-root')) return;

    var host = D.createElement('div');
    host.id = 'escape-hatch-root';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647';
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

    var appName = app ? app.name : 'this app';
    var hintKey = app ? app.key : 'menu';
    var deepLink = isIOS ? (cfg.app && cfg.app.ios)
                         : isAndroid ? (cfg.app && cfg.app.android) : null;

    var css = [
      ':host{all:initial}',
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
      '.dismiss{margin-top:14px;font-size:12px;opacity:.5;background:none;border:0;color:inherit;',
      '  width:100%;cursor:pointer}',
      '.ok{opacity:1;color:#128a4b;font-weight:600}'
    ].join('');

    var h = [];
    h.push('<div class="wrap"><div class="card" role="dialog" aria-modal="true">');
    h.push('<h1>Open in your browser</h1>');
    h.push('<p>You’re viewing this inside ' + esc(appName) +
           '. Some things (sign-in, extensions, saved passwords) only work in your real browser.</p>');

    if (deepLink) {
      h.push('<a class="btn primary" href="' + esc(deepLink) + '">Open in the app</a>');
    }

    if (isAndroid) {
      h.push('<button class="btn primary" id="eh-go">Open in browser</button>');
    } else if (isIOS) {
      // No reliable programmatic route to the default browser on iOS webviews.
      h.push('<a class="btn primary" id="eh-open" href="' + esc(cfg.url) +
             '" target="_blank" rel="noopener">Try to open</a>');
      h.push('<div class="chips">');
      h.push('<a class="btn ghost" href="' + esc(chromeUrl(cfg.url)) + '">Chrome</a>');
      h.push('<a class="btn ghost" href="' + esc(firefoxUrl(cfg.url)) + '">Firefox</a>');
      h.push('</div>');
    } else {
      h.push('<a class="btn primary" href="' + esc(cfg.url) +
             '" target="_blank" rel="noopener">Open in browser</a>');
    }

    h.push('<button class="btn ghost" id="eh-copy">Copy link</button>');

    var hint = isAndroid ? ANDROID_HINT : (IOS_HINTS[hintKey] || IOS_HINTS.menu);
    h.push('<div class="hint" id="eh-hint">' + esc(hint) + '</div>');
    h.push('<button class="dismiss" id="eh-x">Keep viewing here</button>');
    h.push('</div></div>');

    if (root === host) {
      var style = D.createElement('style'); style.textContent = css;
      D.head.appendChild(style);
    }
    var mk = root === host ? '' : '<style>' + css + '</style>';
    (root.innerHTML !== undefined) ? (root.innerHTML = mk + h.join(''))
                                   : (host.innerHTML = h.join(''));
    (D.body || D.documentElement).appendChild(host);

    var $ = function (id) { return (root.getElementById || D.getElementById).call(root, id); };

    var go = $('eh-go');
    if (go) go.addEventListener('click', function () { location.href = toIntent(cfg.url); });

    var copyBtn = $('eh-copy');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      copy(cfg.url, function (ok) {
        copyBtn.textContent = ok ? 'Link copied ✓' : 'Copy failed — long-press the link';
        if (ok) copyBtn.classList.add('ok');
      });
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
      if (!url) { if (W.console) console.warn('[escape-hatch] no valid http(s) url'); return; }
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

  W.EscapeHatch = API;

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
  if (W.EscapeHatchConfig) API.init(W.EscapeHatchConfig);
})();
