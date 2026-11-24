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

  /* EVENT IDS (2026-11-24). Every browser event carries an eventID so
     Meta can deduplicate it against the same event sent server-side
     (Conversions API, Shopify's app). Before this, nothing here had
     one, so any CAPI coverage added later would have double-counted.
     Unique per send; PageView's is per document. */
  function eid(name) {
    var r = Math.random().toString(36).slice(2, 10);
    return 'asior.' + name + '.' + Date.now().toString(36) + '.' + r;
  }

  /* ADVANCED MATCHING. Meta's event match quality read 0.0/10: every
     browser event went out with no customer identifier at all. The one
     identifier this site legitimately holds is an email the visitor
     typed into one of its own signup forms (Klaviyo popup, gate,
     footer), kept in this browser only. fbevents.js normalises and
     SHA-256 hashes it before sending. Never read from anywhere else,
     never sent when GPC or the opt-out is on (start() checks). */
  var KNOWN_EMAIL_KEYS = ['asior_known_email', 'asior_gate_email'];
  function knownEmail() {
    try {
      for (var i = 0; i < KNOWN_EMAIL_KEYS.length; i++) {
        var v = window.localStorage.getItem(KNOWN_EMAIL_KEYS[i]);
        if (v && /@/.test(v)) return String(v).trim().toLowerCase();
      }
    } catch (err) {}
    return '';
  }
  function matchData(extra) {
    var d = {};
    var em = String((extra && extra.em) || knownEmail()).trim().toLowerCase();
    if (em) d.em = em;
    if (extra && extra.ph) d.ph = String(extra.ph).replace(/[^0-9]/g, '');
    return d;
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
      window.fbq('init', String(cfg.META_PIXEL_ID), matchData());
      window.fbq('set', 'autoConfig', false, String(cfg.META_PIXEL_ID));
      window.fbq('track', 'PageView', {}, { eventID: eid('PageView') });
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
  function send(metaEvent, tiktokEvent, props, custom) {
    if (!allowed()) return;
    start();
    var id = eid(metaEvent);
    try {
      if (window.fbq && cfg.META_PIXEL_ID) {
        window.fbq(custom ? 'trackCustom' : 'track', metaEvent, props || {}, { eventID: id });
      }
    } catch (err) {}
    try { if (tiktokEvent && window.ttq && cfg.TIKTOK_PIXEL_ID) window.ttq.track(tiktokEvent, props || {}, { event_id: id }); } catch (err) {}
    return id;
  }

  /* Identify after a real signup: remember the address in this browser
     and re-init with it so every later event on this page and the next
     ones carries it. */
  function identify(email, phone) {
    if (email) {
      try { window.localStorage.setItem('asior_known_email', String(email).trim().toLowerCase()); } catch (err) {}
    }
    if (!allowed()) return;
    start();
    try { if (window.fbq && cfg.META_PIXEL_ID) window.fbq('init', String(cfg.META_PIXEL_ID), matchData({ em: email, ph: phone })); } catch (err) {}
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
    /* A signup that actually happened (called on success, never on
       click). One Lead per address per browser session, whichever form
       it came through, so the popup's two steps cannot count twice. */
    lead: function (info) {
      info = info || {};
      if (info.email) identify(info.email, info.phone);
      var key = 'asior_lead_' + (info.email || '').toLowerCase();
      try { if (window.sessionStorage.getItem(key)) return; window.sessionStorage.setItem(key, '1'); }
      catch (err) { /* cannot dedupe: still send once for this page */ }
      send('Lead', 'SubmitForm', { content_name: info.source || 'signup' });
    },
    smsOptIn: function (info) {
      info = info || {};
      identify(info.email, info.phone);
      send('SMSOptIn', null, { content_name: info.source || 'signup' }, true);
    },
    /* InitiateCheckout, from every local exit into Shopify's checkout:
       the cart page, the cart drawer, product-page Buy it now and the
       lanyard's Buy.

       ONE PER CHECKOUT CART PER SESSION. Keyed on the Storefront cart
       id, so a shopper who presses Checkout, comes back and presses it
       again is still one checkout start, while a new Buy-now cart (a
       new id) is a new one. The eventID is fixed per cart, so even a
       second send that slipped past the guard would be deduplicated by
       Meta. Without an id it is once per page.

       Returns a promise that settles within 150ms, so a caller about to
       leave the page can give the pixel request a moment to go out.
       Callers race it against their own redirect; it never rejects and
       never holds checkout longer than that. */
    beginCheckout: function (cart) {
      cart = cart || {};
      var key = 'asior_ic_' + (cart.id || location.pathname + ':' + Date.now());
      try {
        if (cart.id && window.sessionStorage.getItem(key)) return Promise.resolve(false);
        if (cart.id) window.sessionStorage.setItem(key, '1');
      } catch (err) { /* storage refused: Meta still dedupes on the fixed eventID */ }
      if (!allowed()) return Promise.resolve(false);
      start();
      var id = cart.id ? 'asior.InitiateCheckout.' + String(cart.id).split('/').pop().split('?')[0] : eid('InitiateCheckout');
      var props = {
        value: cart.value, currency: cart.currency || 'USD',
        num_items: cart.quantity,
      };
      if (cart.contentIds && cart.contentIds.length) {
        props.content_ids = cart.contentIds; props.content_type = 'product';
      }
      try { if (window.fbq && cfg.META_PIXEL_ID) window.fbq('track', 'InitiateCheckout', props, { eventID: id }); } catch (err) {}
      try { if (window.ttq && cfg.TIKTOK_PIXEL_ID) window.ttq.track('InitiateCheckout', props, { event_id: id }); } catch (err) {}
      return new Promise(function (res) { setTimeout(function () { res(true); }, 150); });
    },
  };

  /* KLAVIYO'S POPUP (UJE57B) IS THE SIGNUP, so its outcomes are read
     from Klaviyo's own documented `klaviyoForms` window event rather
     than by scraping the form. Klaviyo already counts the form's views
     and submits in its own form analytics; this only forwards the two
     conversions an ad platform needs. `submit` carries the email,
     `stepSubmit` the optional phone. */
  window.addEventListener('klaviyoForms', function (e) {
    try {
      var d = (e && e.detail) || {};
      var meta = d.metaData || {};
      var email = meta.$email || meta.email || '';
      var phone = meta.$phone_number || meta.phone_number || '';
      var source = 'klaviyo_form_' + (d.formId || 'unknown');
      if ((d.type === 'submit' || d.type === 'stepSubmit') && email) {
        window.AsiorAds.lead({ email: email, phone: phone, source: source });
      }
      if (d.type === 'stepSubmit' && phone) {
        var k = 'asior_sms_' + phone;
        try { if (window.sessionStorage.getItem(k)) return; window.sessionStorage.setItem(k, '1'); } catch (x) {}
        window.AsiorAds.smsOptIn({ email: email, phone: phone, source: source });
      }
    } catch (err) { /* never break a signup over a count */ }
  });

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
