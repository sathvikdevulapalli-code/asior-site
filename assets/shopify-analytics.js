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

  /* ---- the wire format: Shopify Hydrogen's own, exactly ------------

     Rewritten 2026-11-27. Shopify Analytics showed 19 sessions in two
     weeks and none on drop day: the previous version posted single
     events to /v1/produce with a page-view payload Hydrogen never sends
     (no appClientId, no title/currency/contentLanguage, extra keys) and
     camelCase custom events, and Monorail validates every payload
     against its schema. With mode 'no-cors' the rejections were
     invisible. This now mirrors @shopify/hydrogen-react's
     sendShopifyAnalytics: a batch to /unstable/produce_batch, the
     trekkie page view (appClientId 6167201 is Hydrogen's) plus the
     snake_case custom events, which is what feeds Sessions, Online
     store visitors and "added to cart" in Shopify Analytics. */
  var BATCH = 'https://monorail-edge.shopifysvc.com/unstable/produce_batch';

  function sendBatch(events) {
    if (!allowed() || !events.length) return;
    var now = Date.now();
    var body = JSON.stringify({
      events: events.map(function (e) {
        return { schema_id: e.schema, payload: e.payload, metadata: { event_created_at_ms: now } };
      }),
      metadata: { event_sent_at_ms: now },
    });
    try {
      fetch(BATCH, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },  // no CORS preflight
        body: body,
        keepalive: true,
        mode: 'no-cors',
        credentials: 'omit',
      }).catch(function () { /* analytics never surfaces an error */ });
    } catch (err) { /* analytics never throws */ }
  }

  function lang() {
    var l = (document.documentElement.lang || navigator.language || 'en').slice(0, 2);
    return l.toUpperCase();
  }

  /* trekkie_storefront_page_view/1.4 -- the session event. */
  function pageViewPayload(pageType, resourceId) {
    var c = config();
    var p = {
      appClientId: '6167201',
      isMerchantRequest: false,
      hydrogenSubchannelId: String(c.STOREFRONT_ID || '0'),
      isPersistentCookie: true,
      uniqToken: uniqToken(),
      visitToken: visitToken(),
      microSessionId: uuid(),
      microSessionCount: 1,
      url: location.href,
      path: location.pathname,
      search: location.search,
      referrer: document.referrer || '',
      title: document.title || '',
      shopId: Number(c.SHOP_ID),
      currency: 'USD',
      contentLanguage: lang(),
    };
    if (pageType) p.pageType = pageType;
    if (resourceId) { p.resourceType = 'product'; p.resourceId = resourceId; }
    return p;
  }

  /* custom_storefront_customer_tracking/1.2 -- the funnel events. */
  function customPayload(eventName, extra) {
    var c = config();
    var p = {
      source: 'hydrogen',
      asset_version_id: '2024.10.0',
      hydrogenSubchannelId: String(c.STOREFRONT_ID || '0'),
      is_persistent_cookie: true,
      deprecated_visit_token: visitToken(),
      unique_token: uniqToken(),
      event_time: Date.now(),
      event_id: uuid(),
      event_source_url: location.href,
      referrer: document.referrer || '',
      user_agent: navigator.userAgent,
      navigation_type: 'navigate',
      navigation_api: 'PerformanceNavigationTiming',
      shop_id: Number(c.SHOP_ID),
      currency: 'USD',
      ccpa_enforced: false,
      gdpr_enforced: false,
      gdpr_enforced_as_string: 'false',
      analytics_allowed: true,
      marketing_allowed: true,
      sale_of_data_allowed: true,
      is_merchant_request: false,
      event_name: eventName,
    };
    for (var k in (extra || {})) p[k] = extra[k];
    return p;
  }

  function gid(kind, v) {
    if (!v) return null;
    v = String(v);
    return v.indexOf('gid://') === 0 ? v : 'gid://shopify/' + kind + '/' + v;
  }

  function productJSON(item) {
    return JSON.stringify({
      product_gid: gid('Product', item.resourceId) || '',
      variant_gid: gid('ProductVariant', item.variantId) || '',
      name: item.name || item.handle,
      variant: item.variantTitle || '',
      brand: 'Asior',
      price: typeof item.price === 'number' ? String(item.price) : '',
      quantity: item.quantity || 1,
      category: '',
      sku: '',
    });
  }

  /* --- public surface, attached to window rather than exported ----- */
  var PAGE_EVENT = { index: 'page_rendered', collection: 'collection_page_rendered', product: 'page_rendered', cart: 'page_rendered' };
  function pageView(pageType) {
    sendBatch([
      { schema: SCHEMA_PAGE_VIEW, payload: pageViewPayload(pageType || 'index') },
      { schema: SCHEMA_CUSTOM, payload: customPayload(PAGE_EVENT[pageType] || 'page_rendered', { page_type: pageType || 'index' }) },
    ]);
  }
  function productView(product) {
    if (!product || !product.handle) return;
    sendBatch([{ schema: SCHEMA_CUSTOM, payload: customPayload('product_page_rendered', {
      page_type: 'product', products: [productJSON(product)],
    }) }]);
  }
  function addToCart(item) {
    if (!item || !item.handle) return;
    var qty = item.quantity || 1;
    var cart = null;
    try { cart = localStorage.getItem('shopify_cart_id'); } catch (e) {}
    sendBatch([{ schema: SCHEMA_CUSTOM, payload: customPayload('product_added_to_cart', {
      page_type: 'product',
      products: [productJSON(item)],
      total_value: typeof item.price === 'number' ? item.price * qty : 0,
      cart_token: cart ? String(cart).split('/').pop().split('?')[0] : '',
    }) }]);
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
