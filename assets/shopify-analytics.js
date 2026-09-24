/* ===================================================================
   Asior — Shopify storefront analytics.

   Shopify sees this store's checkout traffic and nothing before it,
   because the storefront is served from Vercel on its own domain and
   Shopify only injects its own pixel on surfaces it renders itself
   (the Online Store theme and checkout). Without these beacons the
   funnel has no top: no sessions, no landing pages, no way to tell
   how many people saw a product before one of them bought.

   Shopify's own client sends these to Monorail, its event collector.
   @shopify/hydrogen-react's sendShopifyAnalytics is a thin wrapper
   over the same POST; this site has no build step and no React, so
   the request is made directly rather than pulling a framework in to
   make it.

   Deliberately standalone: no dependency on site.js, no exports, and
   nothing else on the page reads from it. Deleting the one <script>
   tag in scripts/build.js's HEAD_SHARED removes it completely.

   Every failure mode here is silent and local. A blocked request, a
   missing id, a browser with no crypto — all end in "send nothing",
   never in an exception that could interrupt a page the customer is
   trying to buy from. The beacon is fire-and-forget: nothing on the
   page waits for it or reads its response.
   =================================================================== */
(function () {
  'use strict';

  var ENDPOINT = 'https://monorail-edge.shopifysvc.com/v1/produce';

  /* Shopify's two schemas. The page-view one is what feeds the
     Sessions and Sessions-by-landing-page reports; the custom one
     carries product and cart events. Both names include the schema
     version and Monorail rejects anything it doesn't recognise, so
     these strings are not free-form. */
  var SCHEMA_PAGE_VIEW = 'trekkie_storefront_page_view/1.4';
  var SCHEMA_CUSTOM = 'custom_storefront_customer_tracking/1.2';

  function config() {
    return window.ASIOR_ANALYTICS || {};
  }

  /* Every beacon goes through this. Anything missing or withheld and
     the module does nothing at all — no partial events, no events
     with invented ids. */
  function allowed() {
    var c = config();
    if (!c.ENABLED) return false;
    if (!c.SHOP_ID || !c.STOREFRONT_ID) return false;

    var api = window.Shopify && window.Shopify.customerPrivacy;
    if (api && typeof api.analyticsProcessingAllowed === 'function') {
      try {
        return api.analyticsProcessingAllowed() === true;
      } catch (err) {
        return false;   // the API is there and unhappy: don't send
      }
    }
    // No consent API on this domain (expected — see promo-config.js).
    return !c.REQUIRE_CONSENT_API;
  }

  function uuid() {
    try {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
      if (window.crypto && window.crypto.getRandomValues) {
        var b = new Uint8Array(16);
        window.crypto.getRandomValues(b);
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        var h = [];
        for (var i = 0; i < 16; i++) h.push((b[i] + 0x100).toString(16).slice(1));
        return h.slice(0, 4).join('') + '-' + h.slice(4, 6).join('') + '-' +
               h.slice(6, 8).join('') + '-' + h.slice(8, 10).join('') + '-' +
               h.slice(10).join('');
      }
    } catch (err) { /* fall through */ }
    return null;
  }

  function readCookie(name) {
    try {
      var m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
      return m ? decodeURIComponent(m[2]) : null;
    } catch (err) { return null; }
  }

  function writeCookie(name, value, maxAgeSeconds) {
    try {
      document.cookie = name + '=' + encodeURIComponent(value) +
        '; path=/; max-age=' + maxAgeSeconds + '; SameSite=Lax' +
        (location.protocol === 'https:' ? '; Secure' : '');
    } catch (err) { /* cookies blocked: tokens stay per-pageview */ }
  }

  /* Shopify's own token names, so a visitor who later lands on a
     Shopify-rendered surface (checkout) is recognised as the same
     person rather than counted twice.
       _shopify_y — identifies the browser, one year
       _shopify_s — identifies the visit, 30 minutes, refreshed on use */
  function token(name, maxAge) {
    var existing = readCookie(name);
    if (existing) { writeCookie(name, existing, maxAge); return existing; }
    var fresh = uuid();
    if (fresh) writeCookie(name, fresh, maxAge);
    return fresh;
  }

  function uniqToken() { return token('_shopify_y', 60 * 60 * 24 * 365); }
  function visitToken() { return token('_shopify_s', 60 * 30); }

  /* Fire and forget. keepalive so an event sent as the customer
     navigates away still leaves the browser — the add-to-cart beacon
     is immediately followed by a redirect to checkout, which is
     exactly the case that would otherwise be dropped. */
  function send(schemaId, payload) {
    if (!allowed()) return;
    var body = JSON.stringify({
      schema_id: schemaId,
      payload: payload,
      metadata: { event_created_at_ms: Date.now() },
    });
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },  // avoids a CORS preflight
        body: body,
        keepalive: true,
        mode: 'no-cors',
        credentials: 'omit',
      }).catch(function () { /* analytics never surfaces an error */ });
    } catch (err) { /* analytics never throws */ }
  }

  /* Fields every event carries. appName 'headless' is what tells
     Shopify these came from a custom storefront rather than a theme. */
  function base() {
    var c = config();
    return {
      shopId: c.SHOP_ID,
      hydrogenSubchannelId: c.STOREFRONT_ID,
      isMerchantRequest: false,
      appName: 'headless',
      url: location.href,
      path: location.pathname,
      search: location.search,
      referrer: document.referrer || '',
      uniqToken: uniqToken(),
      visitToken: visitToken(),
      microSessionId: uuid(),
      microSessionCount: 1,
      isPersistentCookie: !!readCookie('_shopify_y'),
      navigationType: 'navigate',
      navigationApi: 'PerformanceNavigationTiming',
      eventType: 'page_view',
    };
  }

  function customBase(eventName) {
    var c = config();
    return {
      source: 'headless',
      shopId: c.SHOP_ID,
      hydrogenSubchannelId: c.STOREFRONT_ID,
      eventName: eventName,
      event_name: eventName,
      eventTime: Date.now(),
      eventId: uuid(),
      url: location.href,
      referrer: document.referrer || '',
      uniqToken: uniqToken(),
      visitToken: visitToken(),
      isPersistentCookie: !!readCookie('_shopify_y'),
      ccpaEnforced: false,
      gdprEnforced: false,
    };
  }

  /* --- public surface, attached to window rather than exported ----- */

  function pageView(pageType) {
    var p = base();
    p.pageType = pageType || 'index';
    send(SCHEMA_PAGE_VIEW, p);
  }

  function productView(product) {
    if (!product || !product.handle) return;
    var p = customBase('product_view');
    p.pageType = 'product';
    p.resourceId = product.resourceId || null;
    p.handle = product.handle;
    p.productTitle = product.name || null;
    if (typeof product.price === 'number' && isFinite(product.price)) {
      p.price = product.price;
      p.currency = product.currency || 'USD';
    }
    send(SCHEMA_CUSTOM, p);
  }

  function addToCart(item) {
    if (!item || !item.handle) return;
    var p = customBase('add_to_cart');
    p.pageType = 'product';
    p.handle = item.handle;
    p.productTitle = item.name || null;
    p.variantId = item.variantId || null;
    p.quantity = item.quantity || 1;
    if (typeof item.price === 'number' && isFinite(item.price)) {
      p.price = item.price;
      p.currency = item.currency || 'USD';
      p.totalValue = item.price * (item.quantity || 1);
    }
    send(SCHEMA_CUSTOM, p);
  }

  window.AsiorAnalytics = {
    pageView: pageView,
    productView: productView,
    addToCart: addToCart,
    // exposed for the test harness; not used by the site itself
    _allowed: allowed,
  };

  /* Page view fires on every page automatically. The product and cart
     events are called by the pages that can actually describe what was
     viewed or added — this file never guesses at product data. */
  try {
    var type = 'index';
    var path = location.pathname;
    if (/^\/products\//.test(path) || /product\.html$/.test(path) || /lanyard\.html$/.test(path)) type = 'product';
    else if (/shop\.html$/.test(path)) type = 'collection';
    else if (/cart\.html$/.test(path)) type = 'cart';
    pageView(type);
  } catch (err) { /* never block the page */ }
})();
