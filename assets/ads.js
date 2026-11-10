/* ===================================================================
   Asior — advertising pixels, upper funnel only.

   Reads assets/ads-config.js and does nothing at all unless that file
   is enabled, the Meta ID exists, and the visitor has not opted out. See
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

  function asiorAdsAllowed() {
    var current = window.ASIOR_ADS || {};
    if (!current.ENABLED || !current.META_PIXEL_ID) return false;
    // GPC communicates the visitor's opt-out preference.
    if (window.navigator && window.navigator.globalPrivacyControl) return false;
    try {
      if (window.localStorage.getItem('asior_ads_optout') === '1') return false;
    } catch (err) { /* storage may be unavailable; do not break the page */ }
    return true;
  }

  // Preserve an earlier explicit rejection when migrating from the old
  // accept/reject banner to the persistent opt-out control.
  try {
    if (window.localStorage.getItem('asior_ads_optout') !== '1') {
      var legacyChoice = JSON.parse(window.localStorage.getItem('asior_ad_consent_v1'));
      if (legacyChoice && legacyChoice.allow === false) {
        window.localStorage.setItem('asior_ads_optout', '1');
      }
    }
  } catch (err) { /* storage may be unavailable */ }

  function allowed() { return asiorAdsAllowed(); }

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

  // A small informational notice does not gate tracking. An opt-out is
  // persisted locally, revokes the current SDK session, and reloads.
  var panel;
  function optOut() {
    try {
      window.localStorage.setItem('asior_ads_optout', '1');
    } catch (err) { /* still stop this page's sends if storage is blocked */ }
    try { if (window.fbq) window.fbq('consent', 'revoke'); } catch (err) {}
    window.location.reload();
  }
  function consentUI() {
    var footer = document.querySelector('footer.site-footer') || document.querySelector('footer');
    if (footer) {
      var privacyChoices = footer.querySelector('[data-asior-privacy-choices]');
      if (!privacyChoices) {
        privacyChoices = document.createElement('a');
        privacyChoices.href = '/privacy-policy.html#your-privacy-choices';
        privacyChoices.className = 'ad-preferences';
        privacyChoices.textContent = 'Your Privacy Choices';
        privacyChoices.setAttribute('data-asior-privacy-choices', '');
        footer.appendChild(privacyChoices);
      }
      privacyChoices.id = 'your-privacy-choices';
      privacyChoices.addEventListener('click', function (event) {
        event.preventDefault();
        optOut();
      });
    }

    try { if (window.sessionStorage.getItem('asior_ads_notice_dismissed') === '1') return; }
    catch (err) { /* show the notice if session storage is blocked */ }
    panel = document.createElement('section');
    panel.className = 'ad-consent';
    panel.setAttribute('aria-label', 'Cookie notice');
    panel.innerHTML = '<p class="ad-consent-copy">We use cookies for ads and analytics. You can '
      + '<a href="/privacy-policy.html">opt out</a> anytime.</p><div class="ad-consent-actions"></div>';
    var actions = panel.querySelector('.ad-consent-actions');
    function button(label, action) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.addEventListener('click', action); actions.appendChild(b);
    }
    button('OK', function () {
      panel.hidden = true;
      try { window.sessionStorage.setItem('asior_ads_notice_dismissed', '1'); } catch (err) {}
    });
    button('Opt out', optOut);
    document.body.appendChild(panel);
  }

  // The initial PageView starts immediately unless GPC or an opt-out is present.
  if (asiorAdsAllowed()) start();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', consentUI);
  else consentUI();
})();
