/* ===================================================================
   Asior — shared site behaviour.

   Loaded with `defer` on every page. Everything here used to be
   duplicated inline: shopifyFetch lived in three files, klaviyoSubscribe
   in two, getAnonId in two. One copy now, so a fix lands once.

   Both keys below are publishable by design and are safe in client
   code: the Shopify Storefront token is scoped to public storefront
   reads, and the Klaviyo key is their public Client API key meant for
   front-end forms. Never put a Shopify *Admin* token or a Klaviyo
   *private* key in here.
   =================================================================== */
(function () {
  'use strict';

  var SHOPIFY_DOMAIN = 'b0vvek-yz.myshopify.com';
  var SHOPIFY_STOREFRONT_TOKEN = '90d08a1b479f1a4245738f227c5c6749';
  var SHOPIFY_API_VERSION = '2024-10';

  var KLAVIYO_PUBLIC_KEY = 'QV7rBB';
  var KLAVIYO_EMAIL_LIST_ID = 'TFEDaD';
  var KLAVIYO_SMS_LIST_ID = 'UiFFMg';
  var KLAVIYO_REVISION = '2024-10-15';

  // -----------------------------------------------------------------
  // Shopify Storefront API
  // -----------------------------------------------------------------
  async function shopifyFetch(query, variables) {
    var res = await fetch('https://' + SHOPIFY_DOMAIN + '/api/' + SHOPIFY_API_VERSION + '/graphql.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN,
      },
      body: JSON.stringify({ query: query, variables: variables || {} }),
    });
    var json = await res.json();
    if (json.errors) throw new Error(json.errors.map(function (e) { return e.message; }).join(', '));
    return json.data;
  }

  /* The image fields every query should request. Shopify's CDN does the
     resizing and the WebP conversion for free, so asking for the ladder
     here is the whole of the image-optimisation story for catalog
     photos: no build step, no asset pipeline. `url` is kept as the
     non-WebP fallback for the `src` attribute. */
  var IMAGE_FIELDS = [
    'altText',
    'width',
    'height',
    'url',
    'w400: url(transform:{maxWidth:400, preferredContentType:WEBP})',
    'w800: url(transform:{maxWidth:800, preferredContentType:WEBP})',
    'w1200: url(transform:{maxWidth:1200, preferredContentType:WEBP})',
    'w2000: url(transform:{maxWidth:2000, preferredContentType:WEBP})',
  ].join(' ');

  function srcsetFor(img) {
    if (!img) return '';
    return [
      img.w400 ? img.w400 + ' 400w' : '',
      img.w800 ? img.w800 + ' 800w' : '',
      img.w1200 ? img.w1200 + ' 1200w' : '',
      img.w2000 ? img.w2000 + ' 2000w' : '',
    ].filter(Boolean).join(', ');
  }

  /* Build a complete <img> tag with srcset, intrinsic dimensions and the
     right loading hint. width/height are what stop the page shifting as
     each photo arrives (CLS); they're the real pixel dimensions from
     Shopify, and CSS still controls the displayed size.

     `eager` is for the LCP image only — the product hero and the first
     row of the shop grid. Never lazy-load the LCP image. */
  function imgTag(img, opts) {
    opts = opts || {};
    if (!img) return '';
    var attrs = [
      'src="' + (img.w1200 || img.url) + '"',
      srcsetFor(img) ? 'srcset="' + srcsetFor(img) + '"' : '',
      opts.sizes ? 'sizes="' + opts.sizes + '"' : '',
      'alt="' + escapeAttr(opts.alt || img.altText || '') + '"',
      img.width ? 'width="' + img.width + '"' : '',
      img.height ? 'height="' + img.height + '"' : '',
      opts.eager ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"',
      opts.id ? 'id="' + opts.id + '"' : '',
      opts.className ? 'class="' + opts.className + '"' : '',
    ].filter(Boolean).join(' ');
    return '<img ' + attrs + '>';
  }

  function escapeAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeHtml(s) {
    return escapeAttr(s).replace(/'/g, '&#39;');
  }

  // -----------------------------------------------------------------
  // Cart
  // -----------------------------------------------------------------
  async function getOrCreateCart() {
    var existingId = localStorage.getItem('shopify_cart_id');
    if (existingId) {
      var data = await shopifyFetch('query($id: ID!) { cart(id: $id) { id checkoutUrl totalQuantity } }', { id: existingId });
      if (data.cart) return data.cart;
    }
    var created = await shopifyFetch('mutation { cartCreate { cart { id checkoutUrl totalQuantity } } }');
    localStorage.setItem('shopify_cart_id', created.cartCreate.cart.id);
    return created.cartCreate.cart;
  }

  async function addToShopifyCart(variantId, qty) {
    var cart = await getOrCreateCart();
    var data = await shopifyFetch(
      'mutation($cartId: ID!, $lines: [CartLineInput!]!) {' +
      '  cartLinesAdd(cartId: $cartId, lines: $lines) { cart { id checkoutUrl totalQuantity } }' +
      '}',
      { cartId: cart.id, lines: [{ merchandiseId: variantId, quantity: qty }] }
    );
    var updated = data.cartLinesAdd.cart;
    renderCartCount(updated.totalQuantity);
    return updated;
  }

  /* Cart count in the header. Only rendered once the real number is
     known, and hidden at zero — an empty cart shouldn't wear a badge. */
  function renderCartCount(n) {
    document.querySelectorAll('.cart-count').forEach(function (el) {
      if (n > 0) { el.textContent = n; el.classList.add('show'); }
      else { el.textContent = ''; el.classList.remove('show'); }
    });
  }

  async function refreshCartCount() {
    var id = localStorage.getItem('shopify_cart_id');
    if (!id) return;
    try {
      var data = await shopifyFetch('query($id: ID!) { cart(id: $id) { totalQuantity } }', { id: id });
      if (data.cart) renderCartCount(data.cart.totalQuantity);
    } catch (err) { /* a badge is not worth an error state */ }
  }

  // -----------------------------------------------------------------
  // Klaviyo
  // -----------------------------------------------------------------
  async function klaviyoSubscribeToList(listId, profileAttributes) {
    var res = await fetch('https://a.klaviyo.com/client/subscriptions/?company_id=' + KLAVIYO_PUBLIC_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'revision': KLAVIYO_REVISION },
      body: JSON.stringify({
        data: {
          type: 'subscription',
          attributes: { profile: { data: { type: 'profile', attributes: profileAttributes } } },
          relationships: { list: { data: { type: 'list', id: listId } } },
        },
      }),
    });
    if (!res.ok) throw new Error('Klaviyo subscribe failed');
  }

  /* Verified directly against the live API: no "subscriptions" field
     exists on this endpoint's schema at all, it defaults to MARKETING
     consent for whichever contact field (email/phone_number) is present
     the moment you subscribe them to a list. Adding one 400s.

     Because that consent is real marketing consent, every form calling
     this with a phone number must show the SMS consent block first —
     see .consent in site.css and the copy in each form. */
  async function klaviyoSubscribe(email, phone) {
    // Email is the required, primary action. If this fails the whole
    // signup is treated as failed.
    await klaviyoSubscribeToList(KLAVIYO_EMAIL_LIST_ID, { email: email });

    // Phone is optional. A failure here (bad number, etc.) shouldn't
    // undo the email signup that already succeeded.
    if (phone) {
      try {
        await klaviyoSubscribeToList(KLAVIYO_SMS_LIST_ID, { email: email, phone_number: phone });
      } catch (err) { /* swallow, email subscribe already succeeded */ }
    }
  }

  async function klaviyoTrack(metricName, properties, profileAttributes) {
    try {
      await fetch('https://a.klaviyo.com/client/events/?company_id=' + KLAVIYO_PUBLIC_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'revision': KLAVIYO_REVISION },
        body: JSON.stringify({
          data: {
            type: 'event',
            attributes: {
              properties: properties || {},
              metric: { data: { type: 'metric', attributes: { name: metricName } } },
              profile: { data: { type: 'profile', attributes: profileAttributes || { anonymous_id: getAnonId() } } },
            },
          },
        }),
      });
    } catch (err) { /* tracking must never block a real user action */ }
  }

  /* Back-in-stock signup for a specific sold-out variant.

     The dedicated Klaviyo endpoint needs the variant to exist in
     Klaviyo's synced Shopify catalog, keyed as $shopify:::$default:::<id>.
     If that sync isn't set up the call fails — so on failure we fall
     back to subscribing them to the normal email list plus a "Back In
     Stock Requested" event carrying the product and size. Either way the
     signup is captured and nobody is silently dropped.

     Note for whoever runs Klaviyo: the flow message that sends these has
     to be Live or Manual. Left in Draft, subscribers are accepted here
     and then never messaged. */
  async function klaviyoBackInStock(email, variantGid, meta) {
    var numericId = String(variantGid || '').split('/').pop();
    try {
      var res = await fetch('https://a.klaviyo.com/client/back-in-stock-subscriptions/?company_id=' + KLAVIYO_PUBLIC_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'revision': KLAVIYO_REVISION },
        body: JSON.stringify({
          data: {
            type: 'back-in-stock-subscription',
            attributes: {
              channels: ['EMAIL'],
              profile: { data: { type: 'profile', attributes: { email: email } } },
            },
            relationships: {
              variant: { data: { type: 'catalog-variant', id: '$shopify:::$default:::' + numericId } },
            },
          },
        }),
      });
      if (!res.ok) throw new Error('back-in-stock endpoint rejected');
      await klaviyoTrack('Back In Stock Requested', meta, { email: email });
      return 'subscribed';
    } catch (err) {
      await klaviyoSubscribeToList(KLAVIYO_EMAIL_LIST_ID, { email: email });
      await klaviyoTrack('Back In Stock Requested', meta, { email: email });
      return 'fallback';
    }
  }

  // -----------------------------------------------------------------
  // Identity + lightweight A/B testing
  // -----------------------------------------------------------------
  function getAnonId() {
    var id = localStorage.getItem('asior_anon_id');
    if (!id) {
      id = 'anon-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      localStorage.setItem('asior_anon_id', id);
    }
    return id;
  }

  /* Sticky per-visitor variant, so somebody doesn't see the copy change
     under them on a second visit.

     Guarded, because this now gates copy that is actually visible on the
     drop page. Safari's private mode and "block all cookies" both make
     localStorage throw on plain access, and an unguarded read here would
     take the rest of the page script down with it. A visitor we cannot
     bucket durably is shown the control and simply never counted, which
     skews the sample slightly toward A but never shows a broken page.

     A page that must not flicker decides its variant inline in <head>
     and writes this same key before first paint — see index.html. This
     reads that decision back rather than re-rolling it, so the two never
     disagree. The stored value is validated rather than merely tested
     for presence: anything other than 'A' or 'B' is re-rolled. */
  function getVariant(testName) {
    var key = 'asior_ab_' + testName;
    try {
      var variant = localStorage.getItem(key);
      if (variant !== 'A' && variant !== 'B') {
        variant = Math.random() < 0.5 ? 'A' : 'B';
        localStorage.setItem(key, variant);
      }
      return variant;
    } catch (err) {
      return 'A';
    }
  }

  /* profileAttributes is optional: exposure events are anonymous (all we
     have at that point is the anon id), while a conversion can pass the
     email so Klaviyo ties the result to a real profile. */
  function trackABEvent(testName, variant, eventName, profileAttributes) {
    return klaviyoTrack('AB Test: ' + eventName, { test: testName, variant: variant }, profileAttributes);
  }

  // -----------------------------------------------------------------
  // Browsing history — the basis for every personalised surface on the
  // site. Real views only, most-recent-first, deduped and capped.
  // -----------------------------------------------------------------
  function getViewed() {
    try { return JSON.parse(localStorage.getItem('asior_viewed') || '[]'); }
    catch (err) { return []; }
  }

  function recordView(handle) {
    var history = [handle].concat(getViewed().filter(function (h) { return h !== handle; })).slice(0, 8);
    localStorage.setItem('asior_viewed', JSON.stringify(history));
    return history;
  }

  /* Sizes this visitor has actually picked, counted. Used to preselect
     their usual size on a product page — the single highest-value bit of
     personalisation on an apparel site, because it removes a step from
     the exact moment where fit anxiety causes drop-off. */
  function recordSizeChoice(size) {
    if (!size) return;
    var counts = {};
    try { counts = JSON.parse(localStorage.getItem('asior_sizes') || '{}'); } catch (err) { counts = {}; }
    counts[size] = (counts[size] || 0) + 1;
    localStorage.setItem('asior_sizes', JSON.stringify(counts));
  }

  function preferredSize() {
    var counts = {};
    try { counts = JSON.parse(localStorage.getItem('asior_sizes') || '{}'); } catch (err) { return null; }
    var best = null;
    Object.keys(counts).forEach(function (k) { if (!best || counts[k] > counts[best]) best = k; });
    return best;
  }

  function isReturningVisitor() {
    var seen = localStorage.getItem('asior_seen_before');
    localStorage.setItem('asior_seen_before', '1');
    return Boolean(seen);
  }

  // -----------------------------------------------------------------
  window.Asior = {
    shopifyFetch: shopifyFetch,
    IMAGE_FIELDS: IMAGE_FIELDS,
    srcsetFor: srcsetFor,
    imgTag: imgTag,
    escapeAttr: escapeAttr,
    escapeHtml: escapeHtml,
    getOrCreateCart: getOrCreateCart,
    addToShopifyCart: addToShopifyCart,
    renderCartCount: renderCartCount,
    refreshCartCount: refreshCartCount,
    klaviyoSubscribe: klaviyoSubscribe,
    klaviyoSubscribeToList: klaviyoSubscribeToList,
    klaviyoTrack: klaviyoTrack,
    klaviyoBackInStock: klaviyoBackInStock,
    getAnonId: getAnonId,
    getVariant: getVariant,
    trackABEvent: trackABEvent,
    getViewed: getViewed,
    recordView: recordView,
    recordSizeChoice: recordSizeChoice,
    preferredSize: preferredSize,
    isReturningVisitor: isReturningVisitor,
    KLAVIYO_EMAIL_LIST_ID: KLAVIYO_EMAIL_LIST_ID,
  };

  refreshCartCount();
})();
