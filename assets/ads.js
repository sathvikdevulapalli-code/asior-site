/* ===================================================================
   Asior — advertising pixels, upper funnel only.

   Reads assets/ads-config.js and does nothing at all unless that file
   is explicitly enabled, verified, and (by default) consented to. See
   the long comment there for why this exists and for the
   deduplication rule: this file sends PageView, ViewContent,
   AddToCart and InitiateCheckout, and never Purchase.

   Standalone, like shopify-analytics.js: no dependency on site.js,
   nothing else reads from it, and every failure mode is silent and
   local. A blocked script, a missing id, an ad blocker — all end in
   "send nothing", never in an exception that could interrupt a page
   somebody is trying to buy from.
   =================================================================== */
(function () {
  'use strict';

  var cfg = window.ASIOR_ADS || {};
  var started = false;
  var lastView = null;

  /* Four independent gates, all of which must pass. Any one of them
     failing means this file is inert — which is its default state. */
  function allowed() {
    if (!cfg.ENABLED) return false;
    if (!cfg.VERIFIED) return false;              // nobody has checked it
    if (!cfg.META_PIXEL_ID && !cfg.TIKTOK_PIXEL_ID) return false;
    if (navigator.globalPrivacyControl === true) return false;
    if (cfg.REQUIRE_CONSENT && window.ASIOR_CONSENT !== true) return false;
    return true;
  }

  function start() {
    if (started || !allowed()) return;
    started = true;

  // ---- Meta ---------------------------------------------------------
  if (cfg.META_PIXEL_ID) {
    try {
      /* Meta's standard loader. Written out rather than pasted as an
         opaque minified blob so the next person can see exactly what
         is being loaded and from where. */
      (function (f, b, e, v, n, t, s) {
        if (f.fbq) return;
        n = f.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!f._fbq) f._fbq = n;
        n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
        t = b.createElement(e); t.async = true; t.src = v;
        s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
      })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', String(cfg.META_PIXEL_ID));
      window.fbq('set', 'autoConfig', false, String(cfg.META_PIXEL_ID));
      window.fbq('track', 'PageView');
    } catch (err) { /* never block the page */ }
  }

  // ---- TikTok -------------------------------------------------------
  if (cfg.TIKTOK_PIXEL_ID) {
    try {
      (function (w, d, t) {
        w.TiktokAnalyticsObject = t;
        var ttq = w[t] = w[t] || [];
        ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off',
                       'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
        ttq.setAndDefer = function (obj, m) {
          obj[m] = function () { obj.push([m].concat(Array.prototype.slice.call(arguments, 0))); };
        };
        for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
        ttq.load = function (id) {
          ttq._i = ttq._i || {}; ttq._i[id] = []; ttq._t = ttq._t || {}; ttq._t[id] = +new Date();
          ttq._o = ttq._o || {};
          var s = d.createElement('script');
          s.async = true; s.src = 'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=' + id + '&lib=' + t;
          var f = d.getElementsByTagName('script')[0];
          f.parentNode.insertBefore(s, f);
        };
        ttq.load(String(cfg.TIKTOK_PIXEL_ID));
        ttq.page();
      })(window, document, 'ttq');
    } catch (err) { /* never block the page */ }
  }
  }

  /* One send, fanned out to whichever pixels are configured. Event
     names differ between the two platforms, so both are passed in. */
  function send(metaEvent, tiktokEvent, props) {
    if (!allowed()) return;
    start();
    try { if (window.fbq && cfg.META_PIXEL_ID) window.fbq('track', metaEvent, props || {}); } catch (err) {}
    try { if (window.ttq && cfg.TIKTOK_PIXEL_ID) window.ttq.track(tiktokEvent, props || {}); } catch (err) {}
  }

  /* The public surface. Pages call these the same way they already
     call window.AsiorAnalytics — guarded, so a page works identically
     when this file is inert or blocked.

     There is no purchase() on purpose. See ads-config.js. */
  window.AsiorAds = {
    viewContent: function (item) {
      if (!item) return;
      lastView = item;
      send('ViewContent', 'ViewContent', {
        content_ids: [item.handle], content_type: 'product',
        content_name: item.name, value: item.price, currency: item.currency || 'USD',
      });
    },
    addToCart: function (item) {
      if (!item) return;
      send('AddToCart', 'AddToCart', {
        content_ids: [item.handle], content_type: 'product',
        content_name: item.name, value: item.price, currency: item.currency || 'USD',
        quantity: item.quantity || 1,
      });
    },
    beginCheckout: function (cart) {
      send('InitiateCheckout', 'InitiateCheckout', {
        value: cart && cart.value, currency: (cart && cart.currency) || 'USD',
        num_items: cart && cart.quantity,
      });
    },
  };

  // No advertising SDK or event is sent before an affirmative choice.
  // Store only the choice and its date; never email, phone, or cart data.
  var choiceKey = 'asior_ad_consent_v1';
  var panel;
  function applyChoice(yes) {
    var previouslyAllowed = window.ASIOR_CONSENT === true;
    window.ASIOR_CONSENT = yes === true && navigator.globalPrivacyControl !== true;
    try {
      if (window.fbq) window.fbq('consent', window.ASIOR_CONSENT ? 'grant' : 'revoke');
    } catch (err) {}
    if (window.ASIOR_CONSENT) {
      start();
      if (lastView && !previouslyAllowed) window.AsiorAds.viewContent(lastView);
    }
  }
  function saveChoice(yes) {
    try { localStorage.setItem(choiceKey, JSON.stringify({ allow: yes, at: Date.now() })); } catch (err) {}
    applyChoice(yes);
    if (panel) panel.hidden = true;
  }
  function preferences() {
    if (!panel) return;
    panel.hidden = false;
    panel.querySelector('button').focus();
  }
  function consentUI() {
    if (!cfg.ENABLED || !cfg.META_PIXEL_ID || !cfg.REQUIRE_CONSENT) { start(); return; }
    panel = document.createElement('section');
    panel.className = 'ad-consent';
    panel.setAttribute('aria-label', 'Advertising preferences');
    var optedOut = navigator.globalPrivacyControl === true;
    panel.innerHTML = '<p>Advertising preferences</p><p class="ad-consent-copy">'
      + (optedOut ? 'Your browser\'s advertising opt-out is respected.'
        : 'Allow Meta advertising cookies to measure visits, product views and cart activity, and help us show relevant ads? This is optional.')
      + ' <a href="/privacy-policy.html">Privacy policy</a>.</p><div class="ad-consent-actions"></div>';
    var actions = panel.querySelector('.ad-consent-actions');
    function button(label, accept) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.addEventListener('click', function () { saveChoice(accept); }); actions.appendChild(b);
    }
    if (!optedOut) button('Allow Meta ads', true);
    button(optedOut ? 'Close' : 'Reject', false);
    document.body.appendChild(panel);
    var reopen = document.createElement('button');
    reopen.type = 'button'; reopen.className = 'ad-preferences'; reopen.textContent = 'Ad preferences';
    reopen.addEventListener('click', preferences);
    (document.querySelector('footer') || document.body).appendChild(reopen);
    var saved;
    try { saved = JSON.parse(localStorage.getItem(choiceKey)); } catch (err) {}
    if (saved && typeof saved.allow === 'boolean' && saved.at <= Date.now()
        && Date.now() - saved.at < 180 * 86400000) {
      panel.hidden = true; applyChoice(saved.allow);
    } else { applyChoice(false); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', consentUI);
  else consentUI();
})();
