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
  // Plain fetch() never times out on its own -- a stalled request (cold
  // connection, flaky cellular, an ad-network in-app browser's own
  // proxy hanging) just sits forever. A page that shows nothing until
  // this resolves then looks permanently blank, not slow. 12s is
  // generous for a real but poor connection while still failing fast
  // enough to show the existing "couldn't load" states instead of
  // hanging indefinitely.
  var SHOPIFY_FETCH_TIMEOUT_MS = 12000;

  async function shopifyFetch(query, variables) {
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, SHOPIFY_FETCH_TIMEOUT_MS);
    var res;
    try {
      res = await fetch('https://' + SHOPIFY_DOMAIN + '/api/' + SHOPIFY_API_VERSION + '/graphql.json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN,
        },
        body: JSON.stringify({ query: query, variables: variables || {} }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') throw new Error('Request timed out');
      throw err;
    } finally {
      clearTimeout(timeout);
    }
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
  /* onerror fallback: a browser picks exactly one candidate out of
     srcset by viewport width and device pixel ratio, and if that one
     specific Shopify CDN transform 404s or errors, <img srcset> has no
     built-in retry — it just fails, silently, as a blank box. Desktop
     and mobile tend to land on different candidates (desktop usually
     wants a narrower one per `sizes`, a high-DPR phone often wants the
     widest), so a single broken transform size reads as "broken on
     desktop, fine on mobile" or vice versa even though every candidate
     came from the same real image. Falling back to the plain,
     untransformed `url` (which Shopify always returns for a real
     image) once, on error, means one bad transform can't blank the
     whole photo. data-fallback carries the URL instead of embedding it
     in the onerror string, so no attribute-escaping gymnastics. */
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
      img.url ? 'data-fallback="' + escapeAttr(img.url) + '"' : '',
      img.url ? 'onerror="var f=this.dataset.fallback; if (f &amp;&amp; this.src !== f) { this.onerror=null; this.removeAttribute(\'srcset\'); this.removeAttribute(\'sizes\'); this.src=f; }"' : '',
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

  /* Buy Now: a throwaway cart holding exactly this one line.

     Deliberately does NOT touch the persisted cart. Buy Now used to add
     to the saved cart and redirect, which meant buying, going back, and
     buying again appended a second line — checkout then showed two
     polos for what the shopper thought was one purchase. Real shoppers
     do exactly that, and it was the reported bug.

     A fresh cart per press fixes it without the other trap: clearing or
     reusing the saved cart would silently throw away whatever the
     shopper had already quick-added from the grid. Their saved cart is
     left exactly as it was, so the header badge stays truthful — which
     is why this doesn't call renderCartCount.

     Same shape as Shopify's own "Buy it now". */
  async function createBuyNowCart(variantId, qty) {
    var data = await shopifyFetch(
      'mutation($lines: [CartLineInput!]!) {' +
      '  cartCreate(input: { lines: $lines }) { cart { id checkoutUrl totalQuantity } }' +
      '}',
      { lines: [{ merchandiseId: variantId, quantity: qty || 1 }] }
    );
    return data.cartCreate.cart;
  }

  /* Apply discount codes to the saved cart — or clear them, with [].

     The shopper types a code; Shopify decides whether it counts. We
     hand back its own read-back of discountCodes[].applicable and
     never make that call ourselves, because the only number we are
     allowed to show struck through is one Shopify has agreed to
     charge. A code that comes back applicable:false discounts nothing
     and must leave the displayed price exactly as it was.

     Nothing here auto-applies a code. Codes go out by email and SMS to
     subscribers; the site never types one in on a shopper's behalf.

     Discount codes live on the cart itself, so whatever applies here
     carries through to Shopify's hosted checkout unchanged. */
  async function applyDiscountCodes(cartId, codes) {
    var data = await shopifyFetch(
      'mutation($cartId: ID!, $codes: [String!]!) {' +
      '  cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $codes) {' +
      '    cart { id discountCodes { code applicable } }' +
      '    userErrors { field message }' +
      '  }' +
      '}',
      { cartId: cartId, codes: codes || [] }
    );
    var res = (data && data.cartDiscountCodesUpdate) || {};
    if (res.userErrors && res.userErrors.length) {
      throw new Error(res.userErrors[0].message || 'Could not apply that code.');
    }
    return (res.cart && res.cart.discountCodes) || [];
  }

  /* Total cart-level discount, summed from Shopify's own allocations.

     cost.subtotalAmount is documented as the amount BEFORE cart-level
     discounts, so it does not move when a code applies — reading it
     alone would show the shopper an unchanged price on a cart that is
     genuinely discounted. The allocations are the real money off, so
     the discounted subtotal is derived from them rather than assumed
     of any single cost field. */
  function cartDiscountTotal(cart) {
    var allocs = (cart && cart.discountAllocations) || [];
    return allocs.reduce(function (sum, a) {
      var amt = a && a.discountedAmount && parseFloat(a.discountedAmount.amount);
      return sum + (isFinite(amt) ? amt : 0);
    }, 0);
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
    // Stitch the onsite cookie to this email before anything else.
    // Every signup form on the site funnels through here, so doing it
    // in one place covers all of them — and it is what turns the
    // anonymous browsing this visitor has already done into events a
    // flow can actually send mail about.
    klaviyoIdentify(email, { phone: phone });

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

  /* ---- Klaviyo onsite (klaviyo.js) ----------------------------------
     The tag is injected into every page's <head> by scripts/build.js.
     It loads async, so it is usually NOT ready when these are called —
     pushing onto the array is the documented way to queue work for it,
     and the real object replays the queue once it boots. That means
     these never need to wait for it and never throw if it is blocked
     by an ad blocker, which a meaningful share of visitors run.

     This is separate from klaviyoTrack() below, which posts to
     Klaviyo's server-side Client API under an anonymous_id we invent.
     Only the onsite script sets the __kla_id cookie that Browse
     Abandonment and Abandoned Cart key off, so the flows need this
     path specifically. Both run: server-side for our own metrics,
     onsite for the flows. */
  function klaviyoOnsite() {
    window._klOnsite = window._klOnsite || [];
    return window._klOnsite;
  }

  /* Fires the onsite event that Klaviyo's Browse Abandonment flow
     triggers on. Klaviyo expects this exact metric name and this
     property shape — renaming either silently stops the flow. */
  function klaviyoViewedProduct(product) {
    if (!product || !product.handle) return;
    var item = {
      ProductName: product.name,
      ProductID: product.handle,
      URL: product.url,
      ImageURL: product.image || undefined,
    };
    if (typeof product.price === 'number' && isFinite(product.price)) {
      item.Price = product.price;
    }
    try {
      klaviyoOnsite().push(['track', 'Viewed Product', item]);
      // Populates Klaviyo's "recently viewed" block in flow emails.
      klaviyoOnsite().push(['trackViewedItem', {
        Title: item.ProductName,
        ItemId: item.ProductID,
        Url: item.URL,
        ImageUrl: item.ImageURL,
        Metadata: item.Price === undefined ? {} : { Price: item.Price },
      }]);
    } catch (err) { /* tracking must never block a real user action */ }
  }

  /* Onsite counterpart to the Added To Cart event we already post
     server-side. Abandoned Cart keys off this one. */
  function klaviyoAddedToCart(item) {
    if (!item || !item.handle) return;
    try {
      var payload = {
        ProductName: item.name,
        ProductID: item.handle,
        URL: item.url,
        Quantity: item.quantity || 1,
      };
      if (typeof item.price === 'number' && isFinite(item.price)) {
        payload.Price = item.price;
        payload.$value = item.price * (item.quantity || 1);
      }
      if (item.size) payload.Size = item.size;
      klaviyoOnsite().push(['track', 'Added to Cart', payload]);
    } catch (err) { /* never block the add */ }
  }

  /* Stitches this browser to a real profile. Until this runs, onsite
     events sit on an anonymous cookie and no flow can email anyone —
     so every signup form calls it on submit. */
  function klaviyoIdentify(email, extra) {
    if (!email) return;
    try {
      var attrs = { $email: email };
      if (extra && extra.phone) attrs.$phone_number = extra.phone;
      klaviyoOnsite().push(['identify', attrs]);
    } catch (err) { /* never block the signup */ }
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

  /* First-touch UTM capture, persisted across pages/sessions the same
     way getAnonId is. If the current URL carries any of the three
     standard params, that's the freshest touch and overwrites whatever
     was stored before; otherwise this returns the last touch this
     browser had, if any. Deliberately not wired into klaviyoSubscribe
     or klaviyoSubscribeToList — that endpoint's schema was only just
     confirmed correct after a real production incident, and adding an
     unverified field to that specific request is exactly the kind of
     unproven change that caused it. Attribution rides on klaviyoTrack's
     event properties instead, which already accepts arbitrary keys. */
  function getUTMParams() {
    var utm = {};
    try {
      var params = new URLSearchParams(location.search);
      ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (k) {
        var v = params.get(k);
        if (v) utm[k] = v;
      });
      if (Object.keys(utm).length) {
        localStorage.setItem('asior_utm', JSON.stringify(utm));
        return utm;
      }
      var stored = localStorage.getItem('asior_utm');
      return stored ? JSON.parse(stored) : {};
    } catch (err) {
      return utm;
    }
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
  // site. Real views only, most-recent-first, deduped and capped, and
  // aged out after RECENT_VIEW_MAX_AGE_MS: without an expiry, a device
  // that only ever viewed products once, testing the site weeks ago,
  // would show "Pick Up Where You Left Off" forever after — technically
  // real history, but not "recent" by any reasonable reading, and not
  // what that section is for.
  // -----------------------------------------------------------------
  var RECENT_VIEW_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

  function getViewedRaw() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem('asior_viewed') || '[]'); }
    catch (err) { return []; }
    var now = Date.now();
    // Entries from before this timestamp existed are bare handle
    // strings with no way to know their age — treat them as expired
    // rather than showing indefinitely-old history as "recent".
    return raw.filter(function (entry) {
      return entry && typeof entry === 'object' && typeof entry.ts === 'number' && (now - entry.ts) < RECENT_VIEW_MAX_AGE_MS;
    });
  }

  function getViewed() {
    return getViewedRaw().map(function (entry) { return entry.handle; });
  }

  function recordView(handle) {
    var history = [{ handle: handle, ts: Date.now() }]
      .concat(getViewedRaw().filter(function (entry) { return entry.handle !== handle; }))
      .slice(0, 8);
    localStorage.setItem('asior_viewed', JSON.stringify(history));
    return history.map(function (entry) { return entry.handle; });
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

  /* Tasteful, honest low-stock copy — one place, used by both the Fall
     grid cards (assets/fall-grid.js) and the product page's per-size
     stock note (product.html), so the thresholds and wording can't
     drift apart between the two.

     qty must be Shopify's own quantityAvailable — never inferred,
     never derived from availableForSale alone, never reduced or
     invented to manufacture urgency. Storefront API only returns this
     field when the store has "show inventory quantity" turned on for
     the sales channel; when it hasn't, qty is null/undefined here and
     this returns null, meaning: don't show a number, because we don't
     honestly have one. availableForSale alone still drives "sold out"
     independently of this function. */
  function stockLabel(qty) {
    if (qty == null || typeof qty !== 'number' || isNaN(qty)) return null;
    if (qty <= 0) return 'sold out';
    if (qty === 1) return 'last one';
    if (qty <= 3) return 'only ' + qty + ' left';
    if (qty <= 5) return qty + ' left';
    return null; // healthy stock — no label needed
  }

  /* -----------------------------------------------------------------
     Shipping copy, from one source.

     Every shipping promise on the site comes through here so the words
     can't drift apart across pages — the PDP saying one thing and the
     cart another is how a customer ends up feeling misled at checkout.
     Reads assets/promo-config.js.

     The honesty rule: a free-shipping claim only appears when
     ASIOR_SHIPPING.VERIFIED is filled in, meaning someone actually
     checked Shopify's shipping settings. Unverified, it falls back to
     the always-safe "calculated at checkout" line rather than
     promising something Shopify might charge for.

     Fulfilment and transit are deliberately never merged. "Ships in
     1-2 business days" is how long before it leaves; transit is how
     long it then takes to arrive. Stating one number invites the
     reader to hear the other. */
  function shippingConfig() {
    return window.ASIOR_SHIPPING || {};
  }

  function freeShippingActive() {
    var s = shippingConfig();
    return Boolean(s.VERIFIED) && typeof s.FREE_THRESHOLD === 'number';
  }

  /* The one-line shipping promise shown next to the buy button.

     The free-shipping branches only fire when freeShippingActive() —
     i.e. a real, verified rate exists. With no free shipping the line
     states the real starting price instead, which is the honest
     version of the same reassurance: it tells a shopper the cost
     exists and roughly what it is, on the product page, rather than
     letting them discover it at checkout.

     No region claim. Shopify ships internationally with calculated
     rates, so naming the US price is accurate while "US only" was
     not — it was turning away buyers the store can serve. */
  /* The international promise, rendered under the shipping line.

     Only claims what Managed Markets actually does: a country count
     that lives in one place in the config, and duties/taxes included
     in the checkout total. Says nothing at all unless INTERNATIONAL is
     on and a real country count exists, so a config that hasn't been
     filled in renders nothing rather than a vague claim. */
  function internationalLine() {
    var s = shippingConfig();
    if (!s.INTERNATIONAL) return null;
    var n = s.INTERNATIONAL_COUNTRIES;
    if (typeof n !== 'number' || !(n > 0)) return null;
    var line = 'Ships worldwide to ' + n + ' countries.';
    if (s.INTERNATIONAL_DUTIES_INCLUDED) {
      line += ' Rates, duties and taxes are calculated at checkout and'
        + " included in the total, so there's nothing to pay on delivery.";
    } else {
      line += ' Rates are calculated at checkout.';
    }
    return line;
  }

  /* The part of international checkout people get surprised by. Stated
     plainly, not dressed up as optional — the carrier requires the
     phone number and Chinese customs requires the ID. */
  function internationalCheckoutNote() {
    var s = shippingConfig();
    if (!s.INTERNATIONAL) return null;
    var parts = [];
    if (s.INTERNATIONAL_PHONE_REQUIRED) {
      parts.push('International orders ask for a phone number because the carrier requires one');
    }
    if (s.INTERNATIONAL_CHINA_RESIDENT_ID) {
      parts.push('orders to mainland China also ask for a Resident ID number for customs');
    }
    if (!parts.length) return null;
    return parts.join(', and ') + '.';
  }

  function shippingLine() {
    var s = shippingConfig();
    var fulfil = s.FULFILMENT || '1-2 business days';
    var region = s.REGION ? ', ' + s.REGION : '';
    if (freeShippingActive() && s.FREE_THRESHOLD === 0) {
      return 'Free shipping on every order, no minimum. Ships in ' + fulfil + region + '.';
    }
    if (freeShippingActive() && s.FREE_THRESHOLD > 0) {
      return 'Free shipping over $' + s.FREE_THRESHOLD + '. Ships in ' + fulfil + region + '.';
    }
    if (typeof s.FROM_PRICE === 'number') {
      return 'Ships in ' + fulfil + '. Shipping from $' + s.FROM_PRICE.toFixed(2)
        + ' in the US, calculated at checkout.';
    }
    return 'Ships in ' + fulfil + '. Shipping calculated at checkout'
      + (s.REGION ? ' — ' + s.REGION : '') + '.';
  }

  /* Short badge for the announcement bar and shop grid. Null when
     there's nothing verified to claim. */
  function freeShippingBadge() {
    var s = shippingConfig();
    if (!freeShippingActive()) return null;
    if (s.FREE_THRESHOLD === 0) return 'free shipping on every order';
    return 'free shipping over $' + s.FREE_THRESHOLD;
  }

  /* Cart progress toward free shipping. Returns null when there is no
     verified threshold to measure against — better to say nothing than
     to count someone toward a number that might not be real. Never
     returns a negative amount. */
  function freeShippingProgress(subtotal) {
    var s = shippingConfig();
    if (!freeShippingActive()) return null;
    if (s.FREE_THRESHOLD === 0) return { unlocked: true, text: 'free shipping applied' };
    var amount = parseFloat(subtotal);
    if (isNaN(amount)) return null;
    var away = s.FREE_THRESHOLD - amount;
    if (away <= 0) return { unlocked: true, text: 'free shipping unlocked' };
    return { unlocked: false, away: away, text: '$' + away.toFixed(2) + ' away from free shipping' };
  }

  // -----------------------------------------------------------------
  window.Asior = {
    shopifyFetch: shopifyFetch,
    IMAGE_FIELDS: IMAGE_FIELDS,
    shippingLine: shippingLine,
    internationalLine: internationalLine,
    internationalCheckoutNote: internationalCheckoutNote,
    freeShippingBadge: freeShippingBadge,
    freeShippingProgress: freeShippingProgress,
    srcsetFor: srcsetFor,
    imgTag: imgTag,
    escapeAttr: escapeAttr,
    escapeHtml: escapeHtml,
    getOrCreateCart: getOrCreateCart,
    addToShopifyCart: addToShopifyCart,
    createBuyNowCart: createBuyNowCart,
    applyDiscountCodes: applyDiscountCodes,
    cartDiscountTotal: cartDiscountTotal,
    renderCartCount: renderCartCount,
    refreshCartCount: refreshCartCount,
    klaviyoSubscribe: klaviyoSubscribe,
    klaviyoViewedProduct: klaviyoViewedProduct,
    klaviyoAddedToCart: klaviyoAddedToCart,
    klaviyoIdentify: klaviyoIdentify,
    klaviyoSubscribeToList: klaviyoSubscribeToList,
    klaviyoTrack: klaviyoTrack,
    klaviyoBackInStock: klaviyoBackInStock,
    getAnonId: getAnonId,
    getUTMParams: getUTMParams,
    getVariant: getVariant,
    trackABEvent: trackABEvent,
    getViewed: getViewed,
    recordView: recordView,
    recordSizeChoice: recordSizeChoice,
    preferredSize: preferredSize,
    isReturningVisitor: isReturningVisitor,
    stockLabel: stockLabel,
    KLAVIYO_EMAIL_LIST_ID: KLAVIYO_EMAIL_LIST_ID,
  };

  /* Give the fixed header something solid behind it the moment the page
     scrolls, so content stops showing through the nav. Passive listener:
     this never calls preventDefault, and marking it so keeps it off the
     scrolling critical path. */
  function wireHeaderScrollState() {
    var header = document.querySelector('header');
    if (!header) return;
    var scrolled = null;
    function sync() {
      var next = window.scrollY > 8;
      if (next === scrolled) return;   // only touch the DOM on a real change
      scrolled = next;
      header.classList.toggle('is-scrolled', next);
    }
    sync();
    window.addEventListener('scroll', sync, { passive: true });
  }

  wireHeaderScrollState();
  refreshCartCount();
  // Capture on every page load, not just at submit time — a visitor
  // can land on one page carrying UTM params and convert on a
  // different one, and by then the params that mattered are gone from
  // the URL bar. This is what makes getUTMParams() called later, from
  // a form on any page, actually see the first touch.
  getUTMParams();
})();
