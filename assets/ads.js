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

  /* Four independent gates, all of which must pass. Any one of them
     failing means this file is inert — which is its default state. */
  function allowed() {
    if (!cfg.ENABLED) return false;
    if (!cfg.VERIFIED) return false;              // nobody has checked it
    if (!cfg.META_PIXEL_ID && !cfg.TIKTOK_PIXEL_ID) return false;
    if (cfg.REQUIRE_CONSENT && window.ASIOR_CONSENT !== true) return false;
    return true;
  }

  if (!allowed()) return;

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

  /* One send, fanned out to whichever pixels are configured. Event
     names differ between the two platforms, so both are passed in. */
  function send(metaEvent, tiktokEvent, props) {
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
})();
