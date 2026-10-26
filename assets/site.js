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
  /* "Fall Early Access" (double opt-in). Confirmed against the live
     account on 2026-10-21, along with the flow hanging off it: a live
     "Early Access" flow triggered by Added to List.

     The waitlist form used to post to KLAVIYO_EMAIL_LIST_ID, whose
     flow is "Email Welcome Series with Discount" -- so someone joining
     a waitlist for early access was put in the general welcome series
     and never entered the early-access flow that exists for them. A
     form names its own list with data-klaviyo-list; everything else
     keeps the general list. */
  var KLAVIYO_EARLY_ACCESS_LIST_ID = 'TN58zR';
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

  /* First-touch attribution, carried into the cart itself.

     Until now the UTMs lived on the Klaviyo profile and on analytics
     events, which answers "where did this subscriber come from" but
     not "where did this ORDER come from" -- the order lands in Shopify
     with nothing on it, so a creator who drove a sale cannot be paid
     for a sale. Cart attributes ride through checkout and show up on
     the order in Shopify Admin, which is the one place the founder
     actually reconciles revenue.

     getUTMParams() is first-touch and already bounded to 200
     characters per value. Shopify caps attributes, so this takes the
     keys that carry attribution and stops: no phone number, no email,
     nothing that is not already in the URL the visitor arrived on. */
  function cartAttributes() {
    try {
      var utm = getUTMParams();
      return Object.keys(utm)
        .filter(function (k) { return utm[k]; })
        .slice(0, 8)
        .map(function (k) { return { key: k, value: String(utm[k]).slice(0, 200) }; });
    } catch (err) {
      return [];   // attribution is never worth failing a cart over
    }
  }

  async function createCart(attributes) {
    var mutation = 'mutation($attributes: [AttributeInput!]) {'
      + '  cartCreate(input: { attributes: $attributes }) { cart { id checkoutUrl totalQuantity } }'
      + '}';
    try {
      var data = await shopifyFetch(mutation, { attributes: attributes || [] });
      return data.cartCreate.cart;
    } catch (err) {
      if (!attributes || !attributes.length) throw err;   // not the attributes' fault
      if (window.console && console.info) {
        console.info('[asior] cartCreate rejected the attributes input; creating the cart without attribution.');
      }
      var bare = await shopifyFetch('mutation { cartCreate { cart { id checkoutUrl totalQuantity } } }');
      return bare.cartCreate.cart;
    }
  }

  async function getOrCreateCart() {
    var existingId = localStorage.getItem('shopify_cart_id');
    if (existingId) {
      var data = await shopifyFetch('query($id: ID!) { cart(id: $id) { id checkoutUrl totalQuantity } }', { id: existingId });
      if (data.cart) return data.cart;
    }
    /* Attributes go on at creation. They cannot be added later without
       a second round trip on every add-to-cart, and the first touch is
       already known by the time a cart exists.

       Attribution never costs a sale. shopifyFetch throws on any
       GraphQL error, so if this store's API version rejected the
       attributes input, every add-to-cart on the site would throw and
       nobody could buy anything -- which is a failure this storefront
       has had before, from a different confident assumption about the
       API. The retry drops the attributes and keeps the cart. */
    var created = await createCart(cartAttributes());
    localStorage.setItem('shopify_cart_id', created.id);
    return created;
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

  /* Change the quantity of a line already in the saved cart.

     This did not exist. The cart page rendered quantity as read-only
     text and the only edit available was removing the line, so a
     shopper who wanted two had to go back to the product page. Setting
     a quantity of 0 is how Shopify removes a line, so the caller is
     responsible for not sending one by accident -- the steppers clamp
     at 1 and removal goes through cartLinesRemove. */
  async function updateCartLine(lineId, quantity) {
    var cart = await getOrCreateCart();
    var data = await shopifyFetch(
      'mutation($cartId: ID!, $lines: [CartLineUpdateInput!]!) {' +
      '  cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { id checkoutUrl totalQuantity } }' +
      '}',
      { cartId: cart.id, lines: [{ id: lineId, quantity: quantity }] }
    );
    var updated = data.cartLinesUpdate.cart;
    renderCartCount(updated.totalQuantity);
    trackCart('Cart Quantity Changed', { quantity: quantity, cart_quantity: updated.totalQuantity });
    return updated;
  }

  /* Remove a line outright. */
  async function removeCartLine(lineId) {
    var cart = await getOrCreateCart();
    var data = await shopifyFetch(
      'mutation($cartId: ID!, $lineIds: [ID!]!) {' +
      '  cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { id checkoutUrl totalQuantity } }' +
      '}',
      { cartId: cart.id, lineIds: [lineId] }
    );
    var updated = data.cartLinesRemove.cart;
    renderCartCount(updated.totalQuantity);
    trackCart('Cart Item Removed', { cart_quantity: updated.totalQuantity });
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
    var lines = [{ merchandiseId: variantId, quantity: qty || 1 }];
    var withAttrs = 'mutation($lines: [CartLineInput!]!, $attributes: [AttributeInput!]) {'
      + '  cartCreate(input: { lines: $lines, attributes: $attributes })'
      + '    { cart { id checkoutUrl totalQuantity } }'
      + '}';
    var attributes = cartAttributes();
    try {
      var data = await shopifyFetch(withAttrs, { lines: lines, attributes: attributes });
      return data.cartCreate.cart;
    } catch (err) {
      // Buy it now goes straight to checkout, so this is the least
      // forgiving path on the site. Same rule: keep the sale.
      if (!attributes.length) throw err;
      var bare = await shopifyFetch(
        'mutation($lines: [CartLineInput!]!) {' +
        '  cartCreate(input: { lines: $lines }) { cart { id checkoutUrl totalQuantity } }' +
        '}',
        { lines: lines }
      );
      return bare.cartCreate.cart;
    }
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

  /* The header reads "Cart (0)" in words now, so the count is always
     rendered -- an empty cart says it is empty instead of showing
     nothing and leaving the visitor to guess. .show only changes its
     colour; it no longer controls whether the number exists. */
  var lastCartQty = 0;

  /* The cart's real quantity, as last read from Shopify. Every path
     that changes the cart already funnels through renderCartCount --
     add, update, remove and the page-load refresh -- so this is the
     same number the header shows and costs no extra request. */
  function cartQuantity() { return lastCartQty; }

  function renderCartCount(n) {
    var q = n > 0 ? n : 0;
    lastCartQty = q;
    document.querySelectorAll('.cart-count').forEach(function (el) {
      el.textContent = String(q);
      // The icon alone says nothing, so the count rides on the link's
      // accessible name as well as in the bubble.
      var link = el.closest('.cart-link');
      if (link) link.setAttribute('aria-label', q === 1 ? 'Cart, 1 item' : 'Cart, ' + q + ' items');
      if (q > 0) el.classList.add('show'); else el.classList.remove('show');
    });
    /* Anything that wants to say something different depending on
       what is in the cart -- the product page's 2-piece line -- listens
       for this rather than asking Shopify again. */
    try {
      document.dispatchEvent(new CustomEvent('asior:cartqty', { detail: { quantity: q } }));
    } catch (err) { /* no CustomEvent constructor; the line just won't move */ }
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

  /* ---- Native SMS signup -------------------------------------------

     Phone only, straight to the SMS list. Deliberately NOT
     klaviyoSubscribe(): that one requires an email and treats the
     number as an optional extra, which is the exact barrier this is
     meant to remove. Requiring an email to join an SMS list defeats
     the point of the SMS list.

     UiFFMg is double opt-in (confirmed against the live account: its
     opt_in_process is "double_opt_in"). A 202 means Klaviyo accepted
     the number and will text a confirmation. It does NOT mean
     subscribed, nothing is on the list until they reply, and no flow
     fires until then. Every caller's success copy has to say so.
  */

  /* US/CA mobile -> E.164, or null.

     Beyond the ten-digit rule this also enforces NANP's own: area code
     and exchange both start 2-9. That rejects 000/111 style junk that
     would otherwise be accepted here and bounce inside Klaviyo, and it
     cannot reject a real US or Canadian number, because no real one
     starts either group with 0 or 1. */
  function toE164(raw) {
    var digits = String(raw == null ? '' : raw).replace(/\D/g, '');
    if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);
    if (digits.length !== 10) return null;
    if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
    return '+1' + digits;
  }

  function smsSubscribeBody(phone, withConsentBlock, location) {
    var profile = { phone_number: phone };

    /* First-touch attribution on the profile.

       The subscription carried the number and nothing else, so every
       SMS signup landed in Klaviyo indistinguishable from every other
       one: a launch seeded through five creators produced one
       undifferentiated list, and the question the founder actually has
       -- which seeding grew the list -- was unanswerable. getUTMParams()
       returns the FIRST touch, so a creator keeps the credit even if
       the signup happens on a later visit through a branded search.

       Profile properties, not event properties, and the phone number
       goes nowhere near a URL or an analytics event -- that constraint
       is unchanged. These are plain custom properties; nothing here
       asks Klaviyo for a field that has to exist first. */
    var utm = getUTMParams();
    var props = {};
    Object.keys(utm).forEach(function (k) { props[k] = utm[k]; });
    if (location) props.signup_location = location;
    if (Object.keys(props).length) profile.properties = props;

    if (withConsentBlock) {
      profile.subscriptions = { sms: { marketing: { consent: 'SUBSCRIBED' } } };
    }
    return {
      data: {
        type: 'subscription',
        attributes: { profile: { data: { type: 'profile', attributes: profile } } },
        relationships: { list: { data: { type: 'list', id: KLAVIYO_SMS_LIST_ID } } },
      },
    };
  }

  function postSmsSubscription(phone, withConsentBlock, location) {
    return fetch('https://a.klaviyo.com/client/subscriptions/?company_id=' + KLAVIYO_PUBLIC_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'revision': KLAVIYO_REVISION },
      body: JSON.stringify(smsSubscribeBody(phone, withConsentBlock, location)),
    });
  }

  /* Two payload shapes, because the record disagrees with itself.

     The brief for this build specifies an explicit subscriptions block
     and says it was verified on the live account. The comment on
     klaviyoSubscribe() above records the opposite from an earlier live
     test: that this endpoint has no subscriptions field and 400s if you
     send one. Both cannot be true, and neither can be checked from the
     build sandbox, which has no outbound network at all.

     So: send the specified shape. If Klaviyo rejects it as malformed,
     send the shape this repo has already watched work. One of the two
     is right, the visitor is subscribed either way, and the console
     line says which — delete the loser once someone has seen a real
     202 in production.

     This is the only path that makes a second request, it only runs on
     an explicit 400, and it never runs on success, on a network error,
     or from a second click. */
  async function klaviyoSubscribeSms(phone, location) {
    var res = await postSmsSubscription(phone, true, location);
    if (res.ok) return res.status;
    if (res.status === 400) {
      var fallback = await postSmsSubscription(phone, false, location);
      if (fallback.ok) {
        if (window.console && console.info) {
          console.info('[asior] SMS subscribe: consent-block payload 400d, bare payload accepted.');
        }
        return fallback.status;
      }
    }
    throw new Error('Klaviyo SMS subscribe failed: ' + res.status);
  }

  /* Wires every <form data-sms-signup> on the page: the PDP block, the
     footer block and /text all share this, so the validation, the
     in-flight lock and the wording of success stay in one place.

     Nothing here submits on blur or on load, and no consent box is
     ever pre-checked — pressing the button IS the consent, which is
     why the consent sentence sits next to it rather than behind a
     link. */
  function wireSmsSignup(scope) {
    var forms = (scope || document).querySelectorAll('form[data-sms-signup]');
    Array.prototype.forEach.call(forms, function (form) {
      if (form.getAttribute('data-sms-wired')) return;   // idempotent
      form.setAttribute('data-sms-wired', '1');

      var input = form.querySelector('input[type="tel"]');
      var button = form.querySelector('button');
      var msg = form.querySelector('[data-sms-msg]');
      var inFlight = false;

      function say(text, isError) {
        if (!msg) return;
        msg.textContent = text;
        msg.classList.toggle('is-error', !!isError);
        msg.classList.add('show');
      }

      input.addEventListener('input', function () {
        input.removeAttribute('aria-invalid');
        if (msg) { msg.classList.remove('show', 'is-error'); msg.textContent = ''; }
      });

      form.addEventListener('submit', async function (e) {
        e.preventDefault();

        // Set before any await, so a second click during the same tick
        // is already locked out rather than racing the first request.
        if (inFlight) return;

        var phone = toE164(input.value);
        if (!phone) {
          // Rejected here means no request at all, not a request that
          // fails later.
          input.setAttribute('aria-invalid', 'true');
          say('Enter a 10-digit US or Canadian mobile number.', true);
          input.focus();
          return;
        }

        inFlight = true;
        button.disabled = true;
        input.disabled = true;
        var label = button.textContent;
        button.textContent = 'Sending';

        try {
          /* Which block on which page produced the signup. The PDP's
             copy, the footer's and /text's are the same offer in three
             very different contexts, and without this they are one
             number. */
          var where = form.closest('[data-sms-location]');
          await klaviyoSubscribeSms(phone, where ? where.getAttribute('data-sms-location') : null);
          // Double opt-in: accepted, not subscribed. Saying "you're in"
          // here would be a lie until they reply.
          form.classList.add('is-done');
          say('Almost done. Check your texts and reply YES to confirm.', false);
          input.value = '';
          /* An event as well as the subscription, so the signup shows
             up in Klaviyo's stream against the same first touch and can
             be segmented on. Deliberately carries NO phone number: the
             standing rule is that the number never reaches a URL, a
             query string or an analytics event, and this is an
             analytics event. It rides on the anonymous id instead. */
          var ev = {};
          var u = getUTMParams();
          Object.keys(u).forEach(function (k) { ev[k] = u[k]; });
          if (where) ev.signup_location = where.getAttribute('data-sms-location');
          klaviyoTrack('SMS Signup', ev);
        } catch (err) {
          say("That didn't go through. Try again in a moment.", true);
          inFlight = false;
          button.disabled = false;
          input.disabled = false;
          button.textContent = label;
        }
      });
    });
  }

  /* The footer email form has its own explicit submit action and clear
     consent sentence. It writes only the email list; an address is never
     sent until the visitor presses Join. */
  function wireEmailSignup(scope) {
    var forms = (scope || document).querySelectorAll('form[data-email-signup]');
    Array.prototype.forEach.call(forms, function (form) {
      if (form.getAttribute('data-email-wired')) return;
      form.setAttribute('data-email-wired', '1');

      var input = form.querySelector('input[type="email"]');
      var button = form.querySelector('button');
      var msg = form.querySelector('[data-email-msg]');
      var inFlight = false;

      function say(text, isError) {
        if (!msg) return;
        msg.textContent = text;
        msg.classList.toggle('is-error', !!isError);
        msg.classList.add('show');
      }

      input.addEventListener('input', function () {
        input.removeAttribute('aria-invalid');
        if (msg) { msg.classList.remove('show', 'is-error'); msg.textContent = ''; }
      });

      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (inFlight) return;

        var email = input.value.trim();
        if (!email || !input.validity.valid) {
          input.setAttribute('aria-invalid', 'true');
          say('Enter a valid email address.', true);
          input.focus();
          return;
        }

        inFlight = true;
        button.disabled = true;
        input.disabled = true;
        var label = button.textContent;
        button.textContent = 'Sending';

        try {
          var listId = form.getAttribute('data-klaviyo-list') || KLAVIYO_EMAIL_LIST_ID;
          klaviyoIdentify(email, {});
          await klaviyoSubscribeToList(listId, { email: email });
          form.classList.add('is-done');
          /* Both lists this form can reach are double opt-in except the
             general one, so the wording has to be honest about what
             happens next rather than implying it is finished. */
          say(listId === KLAVIYO_EMAIL_LIST_ID
            ? 'Thanks. Check your inbox if confirmation is needed.'
            : 'Almost there. Check your inbox and confirm to finish joining.', false);
          input.value = '';
          var where = form.closest('[data-email-location]');
          klaviyoTrack('Email Signup', {
            signup_location: where ? where.getAttribute('data-email-location') : null,
          });
        } catch (err) {
          say("That didn't go through. Try again in a moment.", true);
          inFlight = false;
          button.disabled = false;
          input.disabled = false;
          button.textContent = label;
        }
      });
    });
  }

  /* Markup for the SMS block that product.html renders inside its buy
     box. The footer's and /text's copies are generated by
     smsSignupBlock() in scripts/build.js; this is the third, and it
     lives here because the PDP builds its whole body client-side. The
     consent sentence must stay identical to that one.

     No discount is mentioned, because there is no signup code. */
  function smsSignupHTML() {
    return '<div class="sms-signup sms-signup--pdp" data-sms-location="pdp">'
      + '<p class="sms-signup-title">Stay connected with ASIOR.</p>'
      + '<p class="sms-signup-body">Occasional messages about new collections and what is behind them. No daily blasts.</p>'
      + '<form class="sms-form" data-sms-signup novalidate>'
      + '<label class="sr-only" for="sms-pdp">Mobile number</label>'
      + '<input class="field" type="tel" id="sms-pdp" name="phone" placeholder="Mobile number" '
      + 'autocomplete="tel" inputmode="tel" maxlength="20" required>'
      + '<button type="submit">Sign up</button>'
      + '<p class="sms-msg" data-sms-msg role="status" aria-live="polite"></p>'
      + '</form>'
      + '<p class="consent">By signing up you agree to receive recurring automated marketing '
      + 'texts from ASIOR at the number provided. Consent is not a condition of purchase. '
      + 'Message frequency varies. Message and data rates may apply. Reply STOP to cancel, '
      + 'HELP for help. See our <a href="/terms-of-service.html">Terms</a> and '
      + '<a href="/privacy-policy.html">Privacy Policy</a>.</p>'
      + '</div>';
  }

  /* ---- cart drawer -------------------------------------------------

     Until now the product page had no add-to-cart at all: its one
     button created a single-line cart and went straight to Shopify's
     checkout, so there was no way to buy two pieces in one order. The
     header has carried a cart icon and a count the whole time.

     This is the missing half. It reads the saved cart (the same one
     cart.html reads and the same one addToShopifyCart writes), shows
     it, and offers the two exits: the full cart page, or checkout.

     Checkout here is the cart's own checkoutUrl, exactly as cart.html
     and the Buy Now path already use it. Nothing about where checkout
     lives is decided or rewritten in this file. */
  var drawerEl = null;
  var drawerBusy = false;

  async function fetchCartForDrawer() {
    var id = localStorage.getItem('shopify_cart_id');
    if (!id) return null;
    var data = await shopifyFetch(
      'query($id: ID!) {' +
      '  cart(id: $id) {' +
      '    id checkoutUrl totalQuantity' +
      '    cost { subtotalAmount { amount currencyCode } }' +
      '    lines(first: 50) { edges { node { id quantity merchandise {' +
      /* featuredImage as well as the variant's own image. Measured
         against the live catalogue on 2026-10-26: all but three
         variants in the shop have image: null, because the photograph
         is attached to the product, not the variant. This asked only
         for the variant's, so nearly every line rendered the grey
         placeholder. cart.html had the same query and the same bug --
         it is not drawer-specific. */
      '      ... on ProductVariant { title price { amount currencyCode }' +
      '        image { url } product { title handle featuredImage { url } } } } } } }' +
      '  }' +
      '}', { id: id });
    return data.cart || null;
  }

  function money(n, currency) {
    var v = parseFloat(n);
    if (!isFinite(v)) return '';
    return (currency === 'USD' || !currency ? '$' : '') + v.toFixed(2);
  }

  function ensureDrawer() {
    if (drawerEl) return drawerEl;
    drawerEl = document.createElement('div');
    drawerEl.className = 'cart-drawer';
    drawerEl.setAttribute('hidden', '');
    drawerEl.innerHTML =
      '<div class="cart-drawer-scrim" data-cart-close></div>' +
      '<aside class="cart-drawer-panel" role="dialog" aria-modal="true" aria-label="Cart">' +
      '  <div class="cart-drawer-head">' +
      '    <span class="cart-drawer-title">Cart</span>' +
      '    <button type="button" class="cart-drawer-close" data-cart-close aria-label="Close cart">&times;</button>' +
      '  </div>' +
      '  <div class="cart-drawer-body" data-cart-body></div>' +
      '  <div class="cart-drawer-foot" data-cart-foot></div>' +
      '</aside>';
    document.body.appendChild(drawerEl);

    /* One delegated handler, because the body is re-rendered on every
       change and per-button listeners would be rebound each time.
       drawerBusy is a lock: two taps on + before the first mutation
       lands would both read quantity 1 and both write 2. */
    drawerEl.addEventListener('click', async function (e) {
      if (e.target.closest('[data-cart-close]')) { closeCartDrawer(); return; }

      // The drawer's Checkout is an <a> and stays one -- it navigates on
      // its own, with or without this listener. Nothing is intercepted
      // and no href is rewritten.
      if (e.target.closest('.cart-drawer-checkout')) {
        trackCart('Begin Checkout', { source: 'cart_drawer' });
        return;
      }

      /* The suggestion's + opens its size row, the same gesture the
         grid cards use. Kept here rather than borrowing the grid's
         reveal, because that one hides .product until an
         IntersectionObserver has seen it and a card inside a sliding
         drawer would stay invisible. */
      var sugToggle = e.target.closest('.cart-suggest-add');
      if (sugToggle) {
        var sug = sugToggle.closest('.cart-suggest');
        var sugRow = sug && sug.querySelector('.cart-suggest-row');
        if (!sugRow) return;
        var opening = sugRow.hidden;
        sugRow.hidden = !opening;
        sug.classList.toggle('is-picking', opening);
        sugToggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
        if (opening) {
          var firstSize = sugRow.querySelector('.cart-suggest-size');
          if (firstSize) firstSize.focus();
        }
        return;
      }

      /* Adding one goes through addToShopifyCart, the same function
         every other add on the site uses -- nothing about the cart
         mutation or the checkout url is special here. */
      var chip = e.target.closest('.cart-suggest-size');
      if (chip) {
        if (drawerBusy || chip.disabled) return;
        var variantId = chip.getAttribute('data-variant-id');
        if (!variantId) return;
        var chipMsg = chip.closest('.cart-suggest').querySelector('.cart-suggest-msg');
        drawerBusy = true;
        chip.disabled = true;
        if (chipMsg) chipMsg.textContent = 'adding\u2026';
        try {
          recordSizeChoice(chip.getAttribute('data-size'));
          await addToShopifyCart(variantId, 1);
          renderDrawer(await fetchCartForDrawer());
        } catch (err) {
          if (chipMsg) chipMsg.textContent = "that didn't go through. try again.";
          chip.disabled = false;
        } finally {
          drawerBusy = false;
        }
        return;
      }

      var step = e.target.closest('.cart-drawer-qty-up, .cart-drawer-qty-down');
      if (!step || drawerBusy) return;
      var lineId = step.getAttribute('data-line');
      var row = step.closest('.cart-drawer-line-qty');
      var current = parseInt(row.querySelector('.cart-drawer-qty-val').textContent, 10);
      if (!lineId || !isFinite(current)) return;
      var next = step.classList.contains('cart-drawer-qty-up') ? current + 1 : current - 1;

      drawerBusy = true;
      row.classList.add('busy');
      try {
        // Below one is a removal, not a quantity of zero.
        if (next < 1) await removeCartLine(lineId);
        else await updateCartLine(lineId, next);
        renderDrawer(await fetchCartForDrawer());
      } catch (err) {
        row.classList.remove('busy');
      } finally {
        drawerBusy = false;
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !drawerEl.hasAttribute('hidden')) closeCartDrawer();
    });
    return drawerEl;
  }

  /* ---- the second piece ----------------------------------------
     "Add any second piece for 15% off" is a sentence that is easy to
     read past. At exactly one item in the cart, the drawer offers two
     real pieces that could be the second one.

     Everything here is live Shopify data: the catalogue from the same
     fetchCatalog() the search panel uses, the numbers from the same
     fetchStock(). If either fails, or nothing qualifies, nothing is
     drawn -- suggesting something that cannot be bought is worse than
     suggesting nothing.

     Only products whose single option is Size are offered, because a
     suggestion has to be addable from inside the drawer. A Color +
     Size product needs the choice the quick view gives it, and there
     is no quick view in here. */
  var suggestToken = 0;

  function suggestionCandidates(catalog, stock, inCart) {
    var out = [];
    for (var i = 0; i < catalog.length && out.length < 2; i++) {
      var p = catalog[i];
      if (!p || p.soldOut || p.needsChoice) continue;
      if (!p.sizes || !p.sizes.length) continue;
      if (inCart.indexOf(p.handle) !== -1) continue;
      var entry = stock[p.handle];
      var sellable = p.sizes.filter(function (s) {
        if (!s.available) return false;
        /* availableForSale is Shopify's own answer to "can this be
           bought", and a quantity may only veto it where there is one
           for that variant. The lanyard sits at -5 and is still
           buyable, so a missing or negative number must never hide a
           sellable size. */
        if (!entry || !entry.known) return true;
        var q = entry.byVariant[s.variantId];
        return typeof q !== 'number' || q > 0;
      });
      if (!sellable.length) continue;
      out.push({ product: p, sizes: sellable });
    }
    return out;
  }

  function suggestionHTML(pick) {
    var p = pick.product;
    var mine = preferredSize();
    return '<div class="cart-suggest" data-handle="' + escapeAttr(p.handle) + '">'
      + '<a class="cart-suggest-img" href="/products/' + encodeURIComponent(p.handle) + '.html"'
      + ' tabindex="-1" aria-hidden="true">'
      + (p.image ? imgTag(p.image, { alt: '', sizes: '80px' }) : '<span class="cart-drawer-ph"></span>')
      + '</a>'
      + '<div class="cart-suggest-meta">'
      + '<a class="cart-suggest-name" href="/products/' + encodeURIComponent(p.handle) + '.html">'
      + escapeHtml(p.name) + '</a>'
      + '<div class="cart-suggest-price">' + p.priceLabel + '</div>'
      + '<div class="cart-suggest-row" hidden>'
      + pick.sizes.map(function (sz) {
          return '<button type="button" class="cart-suggest-size' + (sz.size === mine ? ' mine' : '') + '"'
            + ' data-variant-id="' + escapeAttr(sz.variantId) + '"'
            + ' data-size="' + escapeAttr(sz.size) + '"'
            + ' aria-label="Add size ' + escapeAttr(sz.size) + ' of ' + escapeAttr(p.name) + ' to cart">'
            + escapeHtml(sz.size) + '</button>';
        }).join('')
      + '</div>'
      + '<p class="cart-suggest-msg" role="status" aria-live="polite"></p>'
      + '</div>'
      + '<button type="button" class="cart-suggest-add" aria-expanded="false"'
      + ' aria-label="Choose a size for ' + escapeAttr(p.name) + '"></button>'
      + '</div>';
  }

  function renderCartSuggestions(cart) {
    /* Gated on the offer itself: with MULTI_BUY null there is no
       reason to ask anyone for a second piece. */
    var o = multiBuy();
    if (!o || !cart || cart.totalQuantity !== 1) return;
    var body = drawerEl && drawerEl.querySelector('[data-cart-body]');
    if (!body) return;

    var inCart = ((cart.lines && cart.lines.edges) || []).map(function (e) {
      var m = e.node && e.node.merchandise;
      return m && m.product && m.product.handle;
    }).filter(Boolean);

    // The drawer re-renders on every change; a response that lands
    // after the next render belongs to a cart that no longer exists.
    var token = ++suggestToken;
    Promise.all([fetchCatalog(), fetchStock()]).then(function (res) {
      if (token !== suggestToken) return;
      var catalog = res[0];
      var stock = res[1];
      if (!catalog || !catalog.length || !stock) return;
      var picks = suggestionCandidates(catalog, stock, inCart);
      if (!picks.length) return;
      var el = drawerEl.querySelector('[data-cart-body]');
      if (!el) return;
      el.insertAdjacentHTML('beforeend',
        '<div class="cart-suggests">'
        /* The offer is already stated once, right under the shipping
           bar. This heading labels the list instead of saying it
           again. */
        + '<p class="cart-suggests-head">Pair it with</p>'
        + picks.map(suggestionHTML).join('')
        + '</div>');
    }).catch(function () { /* no data, no suggestions */ });
  }

  function renderDrawer(cart) {
    var body = drawerEl.querySelector('[data-cart-body]');
    var foot = drawerEl.querySelector('[data-cart-foot]');
    var lines = (cart && cart.lines && cart.lines.edges) || [];

    if (!lines.length) {
      /* A way out, not just a statement. An empty drawer with no link
         made the close button the only thing to press. */
      body.innerHTML = '<div class="cart-drawer-empty">'
        + '<p>nothing in here yet.</p>'
        + '<a class="cart-drawer-shop" href="/shop.html">Shop all</a>'
        + '</div>';
      foot.innerHTML = '<a class="cart-drawer-secondary" href="/shop.html">Back to Shop All</a>';
      return;
    }

    body.innerHTML = lines.map(function (e) {
      var l = e.node, m = l.merchandise || {};
      var name = (m.product && m.product.title) || '';
      // "Default Title" is Shopify's placeholder for a product with no
      // options; showing it would read as a size nobody chose.
      var variant = m.title && m.title !== 'Default Title' ? m.title : '';
      var unit = parseFloat((m.price && m.price.amount) || 0) || 0;
      return '<div class="cart-drawer-line">'
        + (function () {
            var src = (m.image && m.image.url)
              || (m.product && m.product.featuredImage && m.product.featuredImage.url);
            return src
              ? '<img src="' + escapeAttr(src) + '" alt="" width="60" height="80" loading="lazy" decoding="async">'
              : '<div class="cart-drawer-ph"></div>';
          })()
        + '<div class="cart-drawer-line-meta">'
        + '  <div class="cart-drawer-line-name">' + escapeHtml(name) + '</div>'
        + (variant ? '<div class="cart-drawer-line-variant">' + escapeHtml(variant) + '</div>' : '')
        + '  <div class="cart-drawer-line-qty" data-line="' + escapeAttr(l.id) + '">'
        + '    <button type="button" class="cart-drawer-qty-down" data-line="' + escapeAttr(l.id) + '" aria-label="Decrease quantity">&minus;</button>'
        + '    <span class="cart-drawer-qty-val">' + l.quantity + '</span>'
        + '    <button type="button" class="cart-drawer-qty-up" data-line="' + escapeAttr(l.id) + '" aria-label="Increase quantity">+</button>'
        + '  </div>'
        + '</div>'
        // Line total, not unit price. With a stepper beside it, a unit
        // price next to "2" reads as the cost of the line and is wrong.
        + '<div class="cart-drawer-line-price tnum">'
        + money(unit * l.quantity, m.price && m.price.currencyCode) + '</div>'
        + '</div>';
    }).join('');

    var sub = cart.cost && cart.cost.subtotalAmount;

    /* Free-shipping progress, from the real Storefront subtotal
       against the real FREE_THRESHOLD in promo-config.js. Both come
       from Shopify; nothing here is estimated. freeShippingProgress
       returns null when the rate is not active, and then no bar is
       drawn at all rather than one showing a rule that does not
       apply. */
    var prog = freeShippingProgress(sub && sub.amount);
    var bar = '';
    if (prog) {
      var threshold = shippingConfig().FREE_THRESHOLD;
      var pct = prog.unlocked ? 100
        : Math.max(0, Math.min(100, ((threshold - prog.away) / threshold) * 100));
      bar = '<div class="cart-ship-bar' + (prog.unlocked ? ' is-unlocked' : '') + '">'
        + '<p class="cart-ship-text">'
        + (prog.unlocked
            ? "You've got free shipping"
            : "You're " + escapeHtml(money(prog.away, sub && sub.currencyCode)) + ' away from free shipping')
        + '</p>'
        + '<div class="cart-ship-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"'
        + ' aria-valuenow="' + Math.round(pct) + '"'
        + ' aria-label="Progress towards free shipping">'
        + '<span class="cart-ship-fill" style="width:' + pct.toFixed(1) + '%"></span>'
        + '</div></div>';
    }

    /* The 2-piece offer, from ASIOR_OFFERS.MULTI_BUY, which mirrors a
       real Shopify automatic discount. One line, under the bar. */
    var qty = (cart.lines && cart.lines.edges || []).reduce(function (n, e) {
      return n + ((e.node && e.node.quantity) || 0); }, 0);
    /* The same sentence the product page uses, so the offer is not
       worded two ways in two places. */
    var mb = multiBuyOfferLine(qty);
    if (mb) bar += '<p class="cart-multibuy">' + escapeHtml(mb) + '</p>';

    var head = drawerEl.querySelector('.cart-drawer-head');
    var existing = drawerEl.querySelector('.cart-ship-bar');
    var existingMb = drawerEl.querySelector('.cart-multibuy');
    if (existingMb) existingMb.remove();
    if (existing) existing.remove();
    if (bar && head) head.insertAdjacentHTML('afterend', bar);

    foot.innerHTML =
      '<div class="cart-drawer-sub"><span>Subtotal</span>'
      + '<span class="tnum">' + money(sub && sub.amount, sub && sub.currencyCode) + '</span></div>'
      // Subtotal only. Shipping and any discount are Shopify's to
      // calculate at checkout, and a number we invent here would be one
      // we cannot charge.
      + '<p class="cart-drawer-note">US shipping is calculated from your address at checkout.'
      + ' Discounts are applied there too.</p>'
      + '<a class="cart-drawer-checkout" href="' + escapeAttr(cart.checkoutUrl || '/cart.html') + '">Checkout</a>'
      + '<a class="cart-drawer-secondary" href="/cart.html">View cart</a>';

    renderCartSuggestions(cart);
  }

  async function openCartDrawer(source) {
    trackCart('Cart Drawer Opened', { source: source || 'header' });
    ensureDrawer();
    drawerEl.removeAttribute('hidden');
    // Next frame, so the transition has a start state to animate from.
    requestAnimationFrame(function () { drawerEl.classList.add('open'); });
    document.documentElement.classList.add('cart-drawer-locked');
    drawerEl.querySelector('[data-cart-body]').innerHTML = '<p class="cart-drawer-empty">Loading…</p>';
    var btn = drawerEl.querySelector('.cart-drawer-close');
    if (btn) btn.focus();
    try {
      renderDrawer(await fetchCartForDrawer());
    } catch (err) {
      drawerEl.querySelector('[data-cart-body]').innerHTML =
        '<p class="cart-drawer-empty">Couldn\'t load your cart. <a href="/cart.html">Open the cart page</a>.</p>';
    }
  }

  function closeCartDrawer() {
    if (!drawerEl) return;
    drawerEl.classList.remove('open');
    document.documentElement.classList.remove('cart-drawer-locked');
    // Match the panel transition before hiding, so it slides out.
    setTimeout(function () { if (!drawerEl.classList.contains('open')) drawerEl.setAttribute('hidden', ''); }, 260);
  }

  /* ---- cart funnel events -------------------------------------------

     The journey was instrumented at its ends -- Viewed Product and
     Added to Cart -- and nowhere in between, so the questions the
     launch actually raises could not be answered: how many adds reach
     the drawer, how many carts get edited rather than abandoned, how
     many reach checkout. These are the missing steps.

     No PII anywhere in them. Line ids and handles only, on the
     anonymous id, which is what klaviyoTrack falls back to. Nothing
     here blocks the action it describes -- klaviyoTrack already
     swallows its own failures. */
  function trackCart(metric, props) {
    try {
      var out = props || {};
      var utm = getUTMParams();
      // First touch travels with every funnel step, so revenue can be
      // attributed to the creator who actually started the journey.
      Object.keys(utm).forEach(function (k) { if (!(k in out)) out[k] = utm[k]; });
      klaviyoTrack(metric, out);
    } catch (err) { /* instrumentation is never load-bearing */ }
  }

  /* ---- drop state ----------------------------------------------------

     A drop is an event, and the storefront is supposed to know which
     part of it we are in. Four states, every one of them derived --
     never configured as a mood:

       pre-drop   PUBLIC_LAUNCH_TIME is set and still in the future.
       live       that instant has passed and something is buyable.
       sold-out   it has passed and every Fall piece is sold out, as
                  the live Shopify catalogue reports it.
       evergreen  no launch instant is configured at all.

     The first, second and fourth are answerable from
     assets/launch-config.js alone and are therefore known before the
     catalogue request finishes, so the opening does not flash. Only
     sold-out needs the catalogue, and it is an upgrade applied once
     the real data lands.

     Nothing here can invent scarcity. "Sold out" requires every piece
     in FALL_PRODUCTS to come back from Shopify unavailable; a launch
     date is only shown when one is really configured and really still
     ahead. There is no low-stock state on purpose -- Shopify's
     quantities are not reliable enough across this catalogue to make a
     claim like that, and a wrong one costs more than a missing one. */
  function dropState(catalog) {
    var cfg = window.ASIOR_LAUNCH || {};
    var at = cfg.PUBLIC_LAUNCH_TIME ? Date.parse(cfg.PUBLIC_LAUNCH_TIME) : NaN;

    if (isFinite(at) && Date.now() < at) return { state: 'pre-drop', at: at };
    if (!isFinite(at)) return { state: 'evergreen', at: null };

    // Needs the catalogue. Until it arrives, a launched drop is live.
    if (!catalog || !catalog.length) return { state: 'live', at: at };

    var handles = (cfg.FALL_PRODUCTS || []).map(function (p) { return p.handle; });
    var fall = catalog.filter(function (p) { return handles.indexOf(p.handle) !== -1; });
    // No Fall pieces in the catalogue at all is not the same as all of
    // them being sold out, and must not be reported as one.
    if (!fall.length) return { state: 'live', at: at };
    var allGone = fall.every(function (p) { return p.soldOut; });
    return { state: allGone ? 'sold-out' : 'live', at: at };
  }

  /* The launch instant in the visitor's own timezone, which is the only
     one they can act on. Returns null rather than a guess when the
     configured value will not parse. */
  function launchDateLabel(at) {
    if (!isFinite(at)) return null;
    try {
      var d = new Date(at);
      var opts = {
        weekday: 'long', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      };
      // The year only when it is not this one. "Friday, March 5" is how
      // a person says a date a few weeks out; "Friday, March 5, 2027" is
      // how they say one that is further away, and leaving the year off
      // that one is ambiguous rather than clean.
      if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
      return d.toLocaleString(undefined, opts);
    } catch (err) { return null; }
  }

  /* ---- mobile menu panel -------------------------------------------
     The phone header used to hold all four nav links in a strip
     clipped to calc(100vw - 130px) with the overflow scrollable and
     the scrollbar hidden, so MANUFACTURING was off-screen with nothing
     to say it was there. The links now open as a full-screen panel
     behind one MENU button.

     The <nav> keeps the real anchors in the served HTML, so with
     JavaScript off the panel is simply not openable rather than the
     navigation being gone. Nothing here runs at desktop widths, where
     .nav-toggle is display:none and the links sit inline. */
  function wireNav() {
    var toggle = document.getElementById('navToggle');
    var nav = document.getElementById('siteNav');
    if (!toggle || !nav) return;

    /* moveFocus is false when the panel is closing because a link in
       it was followed: the cart link opens the drawer in place (see
       wireCartLinks) and pulling focus back to the MENU button would
       take it straight out of the dialog that just opened. */
    /* The drawer slides in from the left [spec section 11]. A scrim is
       created lazily rather than shipped in every page's markup: it
       exists only once a menu has actually been opened, and clicking it
       closes the drawer, which is the behaviour people expect of an
       overlay and which keyboard users get from Escape. */
    var scrim = null;
    function ensureScrim() {
      if (scrim) return scrim;
      scrim = document.createElement('div');
      scrim.className = 'nav-scrim';
      scrim.addEventListener('click', function () { setOpen(false); });
      document.body.appendChild(scrim);
      return scrim;
    }

    function setOpen(open, moveFocus) {
      moveFocus = moveFocus !== false;
      document.body.classList.toggle('nav-open', open);
      nav.classList.toggle('is-open', open);
      ensureScrim().classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      // Scrolling the page behind an open full-screen panel is how you
      // end up somewhere else when you close it.
      document.documentElement.style.overflow = open ? 'hidden' : '';
      if (!moveFocus) return;
      if (open) {
        var first = nav.querySelector('a');
        if (first) first.focus();
      } else {
        toggle.focus();
      }
    }

    toggle.addEventListener('click', function () {
      setOpen(!document.body.classList.contains('nav-open'));
    });

    var close = document.getElementById('navClose');
    if (close) close.addEventListener('click', function () { setOpen(false); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('nav-open')) setOpen(false);
    });

    /* Same-page links (the cart link, or Shop while already on Shop)
       leave the panel open over the page they land on, because no
       navigation happens. Close on any link tap -- through setOpen, so
       the scroll lock comes off with it. Dropping the class alone left
       <html> at overflow:hidden and the page unscrollable. */
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false, false);
    });

    /* Resizing past the breakpoint with the panel open leaves the
       desktop header behind a full-screen overlay. */
    window.addEventListener('resize', function () {
      if (window.innerWidth > 640 && document.body.classList.contains('nav-open')) setOpen(false);
    });
  }

  /* The header cart link opens the drawer instead of navigating, when
     there is JS to open it with. Without JS the same link is still a
     plain link to /cart.html, which is why this is wired here rather
     than being a button in the markup. */
  function wireCartLinks() {
    document.querySelectorAll('a.cart-link').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        openCartDrawer();
      });
    });
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
      /* Where the add happened. One metric, not four -- duplicating
         "Added to Cart" per surface would double-count every purchase
         funnel. A property instead makes the PLP quick-add rate and the
         PDP add rate separable without inventing a second event. */
      if (item.source) payload.Source = item.source;
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

  /* Sold-out capture goes to the normal email list, not a restock flow.

     There is no back-in-stock flow in Klaviyo on this account -- 18
     flows exist and none is on that trigger (checked 2026-10-26) -- and
     the Fall pieces are not being restocked. So the old
     /client/back-in-stock-subscriptions/ call took an address and
     promised mail that nothing could ever send. Every "email me when
     this is back" signup went nowhere.

     What we can honestly offer a shopper who found a sold-out size is
     first word on the next drop. That is the Email List the footer
     signup already feeds (KLAVIYO_EMAIL_LIST_ID), and the Email
     Welcome Series flow on it is live, so a signup here is actually
     answered.

     Same endpoint and same list as the footer means the same real
     marketing consent, so every form calling this has to carry the
     same consent sentence the footer does. */
  async function klaviyoNextDropSignup(email, meta) {
    // Stitches the onsite cookie to the address, same as every other
    // signup path on the site.
    klaviyoIdentify(email);
    await klaviyoSubscribeToList(KLAVIYO_EMAIL_LIST_ID, { email: email });
    // Which product and size sent them here is the useful part of the
    // signal. klaviyoTrack swallows its own failures, so a tracking
    // problem never fails a subscribe that already worked.
    await klaviyoTrack('Next Drop Interest', meta, { email: email });
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
      /* utm_content and utm_term as well as the first three.
         utm_content is the slot a creator link actually carries -- it
         is what separates one seeded post from another inside the same
         campaign -- so capturing source/medium/campaign alone made
         per-creator attribution impossible: every creator on a launch
         arrives as tiktok/creator/fall26 and is indistinguishable.

         Also the common click-id params, which are what the ad
         platforms themselves attribute by and which a UTM set does not
         replace. */
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
       'ttclid', 'fbclid', 'gclid'].forEach(function (k) {
        var v = params.get(k);
        // Bounded: these end up in a Klaviyo profile and on events, and
        // a pasted link can carry a very long value.
        if (v) utm[k] = String(v).slice(0, 200);
      });
      if (Object.keys(utm).length) {
        /* First touch wins. A visitor who lands from a creator link and
           then comes back through a branded search should still be
           credited to the creator -- overwriting here would quietly
           reassign every conversion to the last channel, which is the
           one that needed the least work. */
        var prior = localStorage.getItem('asior_utm');
        if (!prior) localStorage.setItem('asior_utm', JSON.stringify(utm));
        return prior ? JSON.parse(prior) : utm;
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
  /* AI-generated imagery, client side.

     scripts/build.js has had isGeneratedImage()/leadImage() for the
     pre-rendered markup, but the grid, the quick view and the PDP all
     re-render from a live fetch a moment after load -- and they read
     featuredImage straight off the response. So Kova's tile was
     demoted to a real photograph at build time and then swapped BACK
     to the Firefly render by the client, which is the one thing
     CLAUDE.md says must never be the grid tile.

     Same detector as the build's, deliberately: one list of generator
     filenames, two runtimes. Keep them in step.

     Note what this does NOT do: it never hides a product and never
     deletes an image. The render stays reachable in the PDP gallery as
     a later frame -- removing it from Shopify is the founder's call,
     not this file's. All this decides is what goes FIRST. */
  var GENERATED_IMAGE_RE = /Firefly_|Midjourney|DALL-?E|StableDiffusion|GeminiFlash|nano-banana|AIGenerated/i;

  function isGeneratedImage(img) {
    var url = (img && (img.url || img)) || '';
    return GENERATED_IMAGE_RE.test(url);
  }

  /* The image a product should lead with: its first real photograph.
     Falls back to the generated one only when there is nothing else --
     a product with no image at all is worse than one with a flawed
     image, and the point is to stop a render being FIRST, not to hide
     the product. */
  function leadImage(featured, images) {
    var all = (images || []).filter(function (im) { return im && im.url; });
    if (featured && !isGeneratedImage(featured)) return featured;
    var real = all.filter(function (im) { return !isGeneratedImage(im); })[0];
    if (real) return real;
    return featured || all[0] || null;
  }

  /* A product's images, real photographs first, generated renders last
     and never dropped. Used wherever a list of frames is rendered in
     order (the PDP gallery, the quick view) so the first frame is a
     photograph without any image disappearing. */
  function orderImages(images) {
    var all = (images || []).filter(function (im) { return im && im.url; });
    return all.filter(function (im) { return !isGeneratedImage(im); })
      .concat(all.filter(isGeneratedImage));
  }

  /* ---- the shared product card ---------------------------------------

     One normalizer and one renderer, used by the shop grid and by every
     collection page.

     This repo already carried two card implementations that had to be
     kept in step by hand -- card() in shop.html and shopCard() in
     scripts/build.js, which CLAUDE.md flags as a standing hazard. The
     Kova bug proved the hazard was real: the build demoted the Firefly
     render and the client put it straight back, because only one of the
     two had the filter. Collection pages would have made a third copy.
     This is the client-side one, defined once.

     PRODUCT_CARD_FIELDS is the GraphQL selection a card needs, so a page
     cannot ask for less than it renders. quantityAvailable is
     deliberately absent: that field mixed into a catalog query is what
     broke live images and pricing across browsers earlier this launch.
     A card only ever needs the boolean availableForSale. */
  var PRODUCT_CARD_FIELDS = `
    title
    handle
    createdAt
    options { name values }
    featuredImage { ${IMAGE_FIELDS} }
    images(first: 2) { edges { node { ${IMAGE_FIELDS} } } }
    variants(first: 20) {
      edges { node {
        id availableForSale price { amount } compareAtPrice { amount }
        selectedOptions { name value }
      } }
    }`;

  /* Is this handle allowed to show a struck-through former price?
     Shopify's compare_at_price is free text and carries no evidence
     that the shop ever charged it, so a handle has to be on the
     verified list in launch-config.js. Fails closed: a missing or
     malformed list shows no compare-at anywhere. */
  function compareAtVerified(handle) {
    var cfg = window.ASIOR_LAUNCH || {};
    var list = cfg.VERIFIED_COMPARE_AT;
    if (!Array.isArray(list) || !list.length || !handle) return false;
    return list.indexOf(handle) !== -1;
  }

  /* Storefront node -> the shape a card renders. Returns null for a
     malformed product rather than throwing, so one bad record cannot
     take down every other tile on the page. */
  function normalizeProduct(node) {
    try {
      var variants = node.variants.edges.map(function (v) { return v.node; });
      var prices = variants.map(function (v) { return parseFloat(v.price.amount); });
      var compares = variants
        .map(function (v) { return v.compareAtPrice ? parseFloat(v.compareAtPrice.amount) : null; })
        .filter(Boolean);
      var minPrice = Math.min.apply(null, prices);
      var maxPrice = Math.max.apply(null, prices);
      var compare = compareAtVerified(node.handle) && compares.length && compares[0] > minPrice
        ? compares[0]
        : null;
      var opts = node.options || [];
      var sizeOpt = opts.filter(function (o) { return o.name === 'Size'; })[0];
      /* One option and it is Size: a size button names exactly one
         variant, so it can add straight to the cart. */
      var hasSizeOnly = opts.length === 1 && !!sizeOpt;
      /* Size plus something else (Kova and Ja-yu are Color + Size).
         These used to get no size row at all, so two apparel cards
         looked broken next to the rest. They get one now, but a button
         cannot add to the cart: several colours share a size, so
         picking one here would be choosing a colour on the customer's
         behalf. They open quick view with that size already chosen,
         where the remaining option is visible. */
      var needsChoice = opts.length > 1 && !!sizeOpt;
      var all = ((node.images && node.images.edges) || []).map(function (x) { return x.node; });
      /* leadImage, not featuredImage: a generated render is never the
         grid tile, and the alt frame has to clear the same bar or the
         hover swap does the demotion in reverse. */
      var lead = leadImage(node.featuredImage, all);
      var firstUrl = lead && lead.url;

      return {
        handle: node.handle,
        /* Carried so the homepage's NEW ARRIVALS row can sort the way
           syncNewArrivals() does in the build, instead of reordering
           into merchandising order when it re-renders. */
        createdAt: node.createdAt || '',
        name: node.title.replace(/\s*\[preorder\]\s*/i, '').trim(),
        image: lead,
        altImage: orderImages(all).filter(function (im) { return im.url !== firstUrl; })[0] || null,
        isPreorder: /\[preorder\]/i.test(node.title),
        soldOut: variants.length > 0 && variants.every(function (v) { return !v.availableForSale; }),
        priceLabel: minPrice === maxPrice
          ? (compare
            ? '<span class="compare"><span class="sr-only">Was </span>$' + compare + '</span>'
              + '<span class="sale-price"><span class="sr-only">Now </span>$' + minPrice + '</span>'
            : '$' + minPrice)
          : 'From $' + minPrice,
        /* Quick-add only makes sense when Size is the one and only
           choice. A product with a second option (color, material)
           needs the full product page, where that choice has room to be
           made correctly. */
        needsChoice: needsChoice,
        sizes: hasSizeOnly
          ? variants.map(function (v) {
              var o = (v.selectedOptions || []).filter(function (x) { return x.name === 'Size'; })[0];
              return o ? { size: o.value, variantId: v.id, available: v.availableForSale } : null;
            }).filter(Boolean)
          : needsChoice
            /* Distinct sizes in Shopify's own option order. A size is
               offered when any variant in it is sellable, and disabled
               when none is -- the same sold-out rule as the
               single-option row, applied across the colours. */
            ? (sizeOpt.values || []).map(function (value) {
                var inSize = variants.filter(function (v) {
                  return (v.selectedOptions || []).some(function (x) {
                    return x.name === 'Size' && x.value === value;
                  });
                });
                if (!inSize.length) return null;
                return {
                  size: value,
                  variantId: null,
                  available: inSize.some(function (v) { return v.availableForSale; }),
                };
              }).filter(Boolean)
            : null,
      };
    } catch (err) {
      console.warn('Skipping malformed product:', node && node.handle, err);
      return null;
    }
  }

  /* opts.eager  -- first row only; everything below the fold stays lazy.
     opts.peek   -- render the quick view trigger (default true). The
                    link opens quick view where available and falls back
                    to the full product page everywhere else. */
  /* Measured slot widths, 2026-10-11, at 1920/1440/1024/768/390:
       shop.html grid      271 271 223 364 175  (grid caps at 1100px)
       homepage + category 456 336 232 364 175  (full width)
       homepage featured   917 677 469 738 360  (spans 2x2)
     The old single string ended in 300px, so a 917px slot was handed
     the 400w candidate and stretched 2.3x. Each string is >= the
     measured slot at every one of those widths.
     Must stay in step with CARD_SIZES in scripts/build.js. */
  var CARD_SIZES = {
    grid: '(max-width: 768px) calc((100vw - 40px) / 2), calc((100vw - 76px) / 4)',
    row: '(max-width: 768px) 48vw, 25vw',
    featured: '(max-width: 768px) 97vw, 48vw',
  };

  function productCard(p, opts) {
    opts = opts || {};
    var media = p.image
      ? imgTag(p.image, {
          alt: 'Asior ' + p.name,
          eager: !!opts.eager,
          sizes: opts.sizes || CARD_SIZES.grid,
        })
      : '';
    /* The hover frame rides along as data and only becomes a real <img>
       when a pointer enters the tile. A second lazy <img> per tile would
       be fetched as soon as the tile scrolled into view, doubling the
       grid's image requests for an effect most visitors (every touch
       device) can never see. */
    var alt = p.altImage
      ? ' data-alt-src="' + escapeAttr(p.altImage.w800 || p.altImage.url) + '"'
      : '';
    var mine = preferredSize();

    /* data-choose marks a row whose buttons open quick view instead of
       adding, because the product has a second option still to pick.
       The click handlers on each page branch on it. */
    /* Must stay in step with quickAddRow() in scripts/build.js: the
       live fetch replaces the built card with this one, and if the two
       disagree the row appears or vanishes under the shopper. That
       includes the sold-out rule -- a product with nothing left in any
       size has no row and falls through to the quick view, which is
       where the restock signup lives. */
    var quickAdd = (!p.soldOut && p.sizes && p.sizes.length)
      ? '<div class="quick-add" data-handle="' + escapeAttr(p.handle) + '" data-name="' + escapeAttr(p.name) + '"'
        + (p.needsChoice ? ' data-choose="1"' : '') + '>'
        + p.sizes.map(function (s) {
            var label = !s.available ? 'Size ' + escapeAttr(s.size) + ', sold out'
              : p.needsChoice ? 'Choose size ' + escapeAttr(s.size) + ' for ' + escapeAttr(p.name)
              : 'Add size ' + escapeAttr(s.size) + ' to cart';
            return '<button type="button" class="qa-size' + (s.available ? '' : ' unavailable')
              + (s.size === mine ? ' mine' : '') + '"'
              + (s.variantId ? ' data-variant-id="' + escapeAttr(s.variantId) + '"' : '')
              + ' data-size="' + escapeAttr(s.size) + '"'
              + (s.available ? '' : ' disabled')
              + ' aria-label="' + label + '">'
              + escapeHtml(s.size) + '</button>';
          }).join('')
        + '</div>'
      : '';

    /* The photograph and the caption are two links to the same page
       rather than one wrapping both, because the control on the image
       and the size row both have to sit on the photograph, and a
       <button> cannot legally live inside an <a>. The frame is what
       positions them.

       One control, two jobs, decided by whether this product has sizes
       at all: data-sizes reveals the row on the tile (wired here, in
       wireCardSizeReveal), data-peek opens the page's quick view
       dialog (wired per page). A product on a single Title variant has
       no row to reveal, so it keeps the dialog. */
    var peek = opts.peek === false ? ''
      : quickAdd
        ? '<a class="product-peek btn btn--sm" data-sizes="' + escapeAttr(p.handle) + '" href="/products/' + encodeURIComponent(p.handle) + '.html" aria-expanded="false" aria-label="Choose a size for ' + escapeAttr(p.name) + '">Choose a size</a>'
        : '<a class="product-peek btn btn--sm" data-peek="' + escapeAttr(p.handle) + '" href="/products/' + encodeURIComponent(p.handle) + '.html" aria-label="Quick view of ' + escapeAttr(p.name) + '">Quick view</a>';

    /* [measured] A small black badge top-left on the image. The
       reference's reads "Notify Me" and opens a restock signup; ours
       says "Sold out", because the spec is explicit that the Notify Me
       wording may only be used if it opens a working restock signup,
       and the grid card does not have one. The product page does. */
    var badge = p.soldOut ? '<span class="product-badge product-badge--sold">Sold out</span>' : '';

    return '\n      <div class="product" data-handle="' + escapeAttr(p.handle) + '">'
      + '<div class="product-frame">'
      + '<a class="product-link" href="/products/' + encodeURIComponent(p.handle) + '.html" tabindex="-1" aria-hidden="true">'
      + '<div class="product-img"' + alt + '>' + media + '</div></a>'
      + badge + peek + quickAdd
      + '</div>'
      + '<a class="product-link" href="/products/' + encodeURIComponent(p.handle) + '.html">'
      /* [measured] Title above the price, both left aligned, title
         clamped to one line. The v14 card put name and price on one
         row with the price pushed right, which reads as a price list;
         the reference stacks them. */
      + '<div class="product-title">' + escapeHtml(p.name) + '</div>'
      + '<div class="product-price tnum">' + p.priceLabel + '</div>'
      + (p.isPreorder ? '<div class="product-state">Preorder</div>' : '')
      + '</a></div>';
  }

  /* The hover frame, wired once per grid container. Shared by the shop
     grid and the collection pages so the swap behaves identically on
     both. No-op on touch, where there is no hover to respond to. */
  function wireHoverSwap(container) {
    if (!container || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    /* pointerover, not pointerenter: pointerenter does not bubble, so a
       single delegated listener on the grid never hears it. The
       already-present guard makes the extra events a no-op. */
    container.addEventListener('pointerover', function (e) {
      var box = e.target.closest ? e.target.closest('.product-img') : null;
      if (!box) return;
      var src = box.getAttribute('data-alt-src');
      if (!src || box.querySelector('.alt-shot')) return;
      var img = document.createElement('img');
      img.className = 'alt-shot';
      img.alt = '';
      img.decoding = 'async';
      img.addEventListener('load', function () { img.classList.add('ready'); });
      // A hover frame that 404s should leave the tile exactly as it was.
      img.addEventListener('error', function () { img.remove(); });
      img.src = src;
      box.appendChild(img);
    });
  }

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
    if (!s.INTERNATIONAL || !s.INTERNATIONAL_STANCE_CONFIRMED) return null;
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
    if (!s.INTERNATIONAL || !s.INTERNATIONAL_STANCE_CONFIRMED) return null;
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

  /* "Dispatched in", not "Ships in".

     FULFILMENT is handling time -- the config says so in its own
     comment -- but the sentence rendered it as "Ships in 1-2 business
     days", which a customer reads as arrival. The real cheapest US
     rate is 5-8 business days in transit on top of that, so the page
     was setting an expectation the carrier cannot meet, at the exact
     moment the shopper decides to trust it. Transit is named here as
     a separate thing and left to checkout, which is the only place it
     is actually known for a given address. */
  function shippingLine() {
    var s = shippingConfig();
    var fulfil = s.FULFILMENT || '1-2 business days';
    var region = s.REGION ? ', ' + s.REGION : '';
    if (freeShippingActive() && s.FREE_THRESHOLD === 0) {
      return 'Free shipping on every order, no minimum. Dispatched in ' + fulfil + region + '.';
    }
    if (freeShippingActive() && s.FREE_THRESHOLD > 0) {
      return 'Free US shipping over $' + s.FREE_THRESHOLD
        + '. Under that, shipping is calculated at checkout from your address.';
    }
    if (typeof s.FROM_PRICE === 'number') {
      return 'Dispatched in ' + fulfil + '. Delivery time is extra. US shipping starts at $'
        + s.FROM_PRICE.toFixed(2) + ', calculated at checkout.';
    }
    return 'Dispatched in ' + fulfil + '. Delivery and shipping calculated at checkout'
      + (s.REGION ? ' \u2014 ' + s.REGION : '') + '.';
  }

  /* The full shipping picture, built from the verified rate card rather
     than written as prose.

     The product page used to carry a hardcoded sentence that disagreed
     with the configuration in three ways at once: it promised delivery
     in "2-5 business days" when the real rates are 5-8 (Economy) and
     3-4 (Standard), and it said "shipping within the US only for now"
     when international has been live through Managed Markets to 28
     countries. Prose drifts from the rate card; this cannot, because
     it is the rate card. Every number here comes from
     assets/promo-config.js and nothing is written twice. */
  /* The short product-page returns sentence comes from the published
     storefront policy. The full case-by-case guidance lives on
     /refund-policy.html; no return window is promised. */
  function returnsLine() {
    var s = shippingConfig();
    if (!s.RETURNS_POLICY_PUBLISHED) return '';
    return 'Fit and order issues are handled by email, with replacements usually first.';
  }

  function shippingDetailHTML() {
    var s = shippingConfig();
    var out = '<p>' + escapeHtml(shippingLine()) + '</p>';

    /* No price list. US shipping is carrier-calculated now -- what it
       costs depends on how far the parcel travels and what it weighs,
       so there is no single number that is true for everyone, and a
       table of four figures would be four prices most customers will
       not be charged. Explain the method instead. */
    /* shippingLine() above already states the free-shipping threshold;
       repeating it here printed the same rule twice in a row. */
    out += '<p>The cost comes from your address and the weight of the order. '
      + 'Someone across the country pays more than someone two states over, '
      + 'because that is what it costs us to get it there. We do not average '
      + 'it into one flat price for everyone.</p>';

    var rates = Array.isArray(s.RATES) ? s.RATES : [];
    if (rates.length) {
      out += '<table class="ship-rates"><caption class="sr-only">US shipping rates</caption>'
        + '<thead><tr><th scope="col">US option</th><th scope="col">Cost</th>'
        + '<th scope="col">In transit</th></tr></thead><tbody>'
        + rates.map(function (r) {
            return '<tr><th scope="row">' + escapeHtml(r.label) + '</th>'
              + '<td class="tnum">$' + Number(r.price).toFixed(2) + '</td>'
              + '<td>' + escapeHtml(r.transit) + '</td></tr>';
          }).join('')
        + '</tbody></table>'
        // Transit is business days after dispatch, not from the order.
        + '<p class="ship-note">Transit time starts when the parcel leaves us, not when you order.</p>';
    }

    var intl = internationalLine();
    if (intl) out += '<p>' + escapeHtml(intl) + '</p>';
    var note = internationalCheckoutNote();
    if (note) out += '<p>' + escapeHtml(note) + '</p>';
    return out;
  }

  /* Short badge for the announcement bar and shop grid. Null when
     there's nothing verified to claim. */
  /* ASIOR_OFFERS.MULTI_BUY: a real Shopify automatic discount. Null
     when it is not configured, so nothing renders. */
  function multiBuy() {
    var o = window.ASIOR_OFFERS && window.ASIOR_OFFERS.MULTI_BUY;
    return o && o.VERIFIED && o.MIN_QTY > 1 && o.PERCENT > 0 ? o : null;
  }
  /* The offer, worded for the buy panel and the drawer alike: what to
     do about it while the cart is short of the minimum, and
     that it is already handled once the cart is there. One wording,
     used everywhere, so the drawer and the product page cannot phrase
     the same offer two ways. Returns '' when there is no configured
     offer, so nothing renders. */
  function multiBuyOfferLine(qty) {
    var o = multiBuy();
    if (!o) return '';
    if ((qty || 0) >= o.MIN_QTY) return o.PERCENT + '% off applied at checkout';
    if (o.MIN_QTY === 2) return 'Add any second piece for ' + o.PERCENT + '% off';
    var more = o.MIN_QTY - (qty || 0);
    return 'Add ' + more + ' more piece' + (more === 1 ? '' : 's') + ' for ' + o.PERCENT + '% off';
  }

  function multiBuyBadge() {
    var o = multiBuy();
    return o ? 'Any ' + o.MIN_QTY + ' pieces ' + o.PERCENT + '% off, applied at checkout' : '';
  }

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

  /* ---- per-product card crop ------------------------------------

     Cards fill a 2:3 frame with object-fit: cover. CARD_FOCUS in
     assets/promo-config.js can move that crop for a product whose
     subject is off-centre; everything else keeps the centre default
     from the stylesheet.

     Applied here rather than in the card markup because three places
     build a card -- shopCard() in scripts/build.js for the prerender,
     and a card() in each of shop.html and index.html for the live
     render -- and they would drift. One observer covers all three and
     anything rendered later. */
  function applyCardFocus(root) {
    var map = window.ASIOR_CARD_FOCUS;
    if (!map) return 0;
    var n = 0;
    var cards = (root || document).querySelectorAll('.product[data-handle]');
    for (var i = 0; i < cards.length; i++) {
      var pos = map[cards[i].getAttribute('data-handle')];
      if (!pos) continue;
      var frame = cards[i].querySelector('.product-img');
      if (frame) { frame.style.setProperty('--card-focus', pos); n++; }
    }
    return n;
  }

  function watchCardFocus() {
    if (!window.ASIOR_CARD_FOCUS || !Object.keys(window.ASIOR_CARD_FOCUS).length) return;
    applyCardFocus(document);
    if (typeof MutationObserver !== 'function') return;
    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; applyCardFocus(document); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchCardFocus);
  } else {
    watchCardFocus();
  }

  // -----------------------------------------------------------------
  window.Asior = {
    wireHeroCta: wireHeroCta,
    dropState: dropState,
    dropConfig: dropConfig,
    comingCard: comingCard,
    wireComingNotify: wireComingNotify,
    wireDropCountdown: wireDropCountdown,
    fetchStock: fetchStock,
    decorateStock: decorateStock,
    sizeStockLabel: sizeStockLabel,
    lowStockBadge: lowStockBadge,
    isNewHandle: isNewHandle,
    /* Re-run the scroll reveal over a grid a page has just
       re-rendered, so new cards animate in instead of appearing. */
    observeReveal: observeReveal,
    CARD_SIZES: CARD_SIZES,
    applyCardFocus: applyCardFocus,
    shopifyFetch: shopifyFetch,
    IMAGE_FIELDS: IMAGE_FIELDS,
    shippingLine: shippingLine,
    shippingDetailHTML: shippingDetailHTML,
    returnsLine: returnsLine,
    shippingConfig: shippingConfig,
    isGeneratedImage: isGeneratedImage,
    compareAtVerified: compareAtVerified,
    leadImage: leadImage,
    orderImages: orderImages,
    PRODUCT_CARD_FIELDS: PRODUCT_CARD_FIELDS,
    normalizeProduct: normalizeProduct,
    productCard: productCard,
    wireHoverSwap: wireHoverSwap,
    internationalLine: internationalLine,
    internationalCheckoutNote: internationalCheckoutNote,
    freeShippingBadge: freeShippingBadge,
    multiBuyBadge: multiBuyBadge,
    multiBuyOfferLine: multiBuyOfferLine,
    cartQuantity: cartQuantity,
    freeShippingProgress: freeShippingProgress,
    srcsetFor: srcsetFor,
    imgTag: imgTag,
    escapeAttr: escapeAttr,
    escapeHtml: escapeHtml,
    getOrCreateCart: getOrCreateCart,
    addToShopifyCart: addToShopifyCart,
    updateCartLine: updateCartLine,
    removeCartLine: removeCartLine,
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
    trackCart: trackCart,
    klaviyoNextDropSignup: klaviyoNextDropSignup,
    dropState: dropState,
    launchDateLabel: launchDateLabel,
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
    KLAVIYO_EARLY_ACCESS_LIST_ID: KLAVIYO_EARLY_ACCESS_LIST_ID,
    KLAVIYO_SMS_LIST_ID: KLAVIYO_SMS_LIST_ID,
    toE164: toE164,
    klaviyoSubscribeSms: klaviyoSubscribeSms,
    wireSmsSignup: wireSmsSignup,
    openCartDrawer: openCartDrawer,
    closeCartDrawer: closeCartDrawer,
    smsSignupHTML: smsSignupHTML,
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

  function wireShopSearch() {
    var input = document.getElementById('shopSearch');
    var grid = document.getElementById('shopGrid');
    var status = document.getElementById('shopSearchStatus');
    if (!input || !grid) return;

    /* Queried per keystroke, not captured once. shop.html replaces the
       whole grid with innerHTML as soon as the live catalogue arrives,
       so the nodes collected at wire time are detached a moment later
       and hiding them does nothing on screen. That is why typing in the
       search field changed the count but never the grid. */
    function apply() {
      var cards = Array.prototype.slice.call(grid.querySelectorAll('.product'));
      var headings = Array.prototype.slice.call(grid.querySelectorAll('.shop-grid-heading'));
      var query = input.value.trim().toLocaleLowerCase();
      var shown = 0;
      cards.forEach(function (card) {
        var title = card.querySelector('.product-title');
        var matches = !query || (title && title.textContent.toLocaleLowerCase().indexOf(query) !== -1);
        card.hidden = !matches;
        if (matches) shown++;
      });
      headings.forEach(function (heading) {
        var sibling = heading.nextElementSibling;
        var hasVisible = false;
        while (sibling && !sibling.classList.contains('shop-grid-heading')) {
          if (sibling.classList.contains('product') && !sibling.hidden) hasVisible = true;
          sibling = sibling.nextElementSibling;
        }
        heading.hidden = !hasVisible;
      });
      if (status) status.textContent = query
        ? shown + ' product' + (shown === 1 ? '' : 's')
        : '';
    }

    input.addEventListener('input', apply);

    /* ?q= seeds the field and runs once, so a search is linkable and
       the WebSite SearchAction in the home page's structured data
       points at something that actually works. */
    var q = null;
    try { q = new URLSearchParams(location.search).get('q'); } catch (err) { q = null; }
    if (q) { input.value = q; apply(); }

    /* The grid is re-rendered after the live fetch; re-apply so a
       seeded or typed query survives it. */
    if (typeof MutationObserver === 'function') {
      var pending = false;
      new MutationObserver(function () {
        if (pending || !input.value.trim()) return;
        pending = true;
        requestAnimationFrame(function () { pending = false; apply(); });
      }).observe(grid, { childList: true });
    }
  }

  /* The announcement bar rotates [measured: the reference's bar changed
     between page loads]. Three messages, cross-faded in place so the
     bar never changes height.

     Paused on hover and on focus-within, so a message cannot slide out
     from under someone reading it or tabbing through it. Under
     prefers-reduced-motion it does not rotate at all: it shows the
     first message and stops, because a timed content swap is motion
     whether or not it is animated. */
  function wireAnnounce() {
    var track = document.querySelector('[data-announce]');
    if (!track) return;
    var msgs = Array.prototype.slice.call(track.querySelectorAll('.announce-msg'));
    if (msgs.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var i = 0, paused = false, timer = null;

    function show(n) {
      msgs.forEach(function (m, k) {
        var on = k === n;
        m.classList.toggle('is-on', on);
        // Only the visible message is exposed; the rest would otherwise
        // all be read out in sequence by a screen reader.
        if (on) m.removeAttribute('aria-hidden');
        else m.setAttribute('aria-hidden', 'true');
      });
    }

    function tick() {
      if (!paused) { i = (i + 1) % msgs.length; show(i); }
    }

    var bar = track.closest('.announce') || track;
    bar.addEventListener('mouseenter', function () { paused = true; });
    bar.addEventListener('mouseleave', function () { paused = false; });
    bar.addEventListener('focusin', function () { paused = true; });
    bar.addEventListener('focusout', function () { paused = false; });

    // Stop the timer entirely when the tab is hidden.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { clearInterval(timer); timer = null; }
      else if (!timer) timer = setInterval(tick, 4000);
    });

    timer = setInterval(tick, 4000);
  }

  wireAnnounce();

  wireHeaderScrollState();
  wireShopSearch();

  /* ---- the next drop ----------------------------------------------

     Everything here is driven by NEXT_DROP in launch-config.js and
     renders NOTHING until the founder fills it in. That is the whole
     design: a countdown with no real date behind it is the fake-timer
     dark pattern CLAUDE.md bans and the FTC treats as deceptive, so
     the empty state has to be silence rather than a placeholder.

     dropState() is the single source of truth:
       null        no drop configured, or the config is incomplete
       'upcoming'  opensAt is in the future
       'open'      opensAt has passed

     At opensAt the page switches itself over on the next tick -- no
     deploy, no edit, nothing for anyone to remember to do. */
  function dropConfig() {
    var d = (window.ASIOR_LAUNCH || {}).NEXT_DROP;
    if (!d || !d.name || !d.opensAt) return null;
    var t = Date.parse(d.opensAt);
    if (isNaN(t)) return null;
    return { name: d.name, at: t, handles: Array.isArray(d.handles) ? d.handles : [] };
  }

  function dropState() {
    var d = dropConfig();
    if (!d) return null;
    return Date.now() < d.at ? 'upcoming' : 'open';
  }

  function dropCountdownText(at) {
    var ms = at - Date.now();
    if (ms <= 0) return '';
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm ' + sec + 's';
  }

  /* One ticker, shared by every countdown element on the page. Stops
     itself the moment the drop opens and re-renders what is on screen
     so a visitor who sat on the page through the opening sees it
     switch rather than a dead zero. */
  var dropTimer = null;
  function wireDropCountdown() {
    var cfg = dropConfig();
    var slots = document.querySelectorAll('[data-drop-countdown]');
    if (!cfg || !slots.length) return;

    var tick = function () {
      var text = dropCountdownText(cfg.at);
      if (!text) {
        clearInterval(dropTimer);
        dropTimer = null;
        for (var i = 0; i < slots.length; i++) slots[i].textContent = '';
        document.documentElement.classList.remove('drop-upcoming');
        /* Re-render any grid that was showing COMING cards. */
        var grids = document.querySelectorAll('[data-drop-grid]');
        for (var g = 0; g < grids.length; g++) {
          grids[g].dispatchEvent(new CustomEvent('drop:open', { bubbles: true }));
        }
        return;
      }
      for (var j = 0; j < slots.length; j++) {
        slots[j].textContent = cfg.name + ' drops in ' + text;
      }
    };

    document.documentElement.classList.add('drop-upcoming');
    tick();
    if (dropState() === 'upcoming') dropTimer = setInterval(tick, 1000);
  }

  /* A product in the drop, before it opens. Not a buyable card: no
     price, no size row, no add. A date and a way to be told. */
  function comingCard(p, at) {
    var when = new Date(at);
    var date = when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return '\n      <div class="product product--coming" data-handle="' + escapeAttr(p.handle) + '">'
      + '<div class="product-frame">'
      + '<div class="product-img">' + (p.image ? imgTag(p.image, { alt: 'Asior ' + p.name, sizes: CARD_SIZES.grid }) : '')
      + '</div>'
      + '<span class="product-badge product-badge--coming">Coming ' + escapeHtml(date) + '</span>'
      + '</div>'
      + '<div class="product-title">' + escapeHtml(p.name) + '</div>'
      + '<form class="coming-notify" data-handle="' + escapeAttr(p.handle) + '">'
      + '<label class="sr-only" for="notify-' + escapeAttr(p.handle) + '">Email me when '
      + escapeHtml(p.name) + ' drops</label>'
      + '<input type="email" id="notify-' + escapeAttr(p.handle) + '" required placeholder="Email address">'
      + '<button type="submit">Notify me</button>'
      + '<span class="coming-msg" role="status" aria-live="polite"></span>'
      + '</form>'
      + '</div>';
  }

  /* Notify Me on a COMING card goes to the existing early-access list.
     No new list and no new flow: CLAUDE.md forbids both, and the list
     already exists for exactly this. */
  function wireComingNotify(root) {
    var forms = (root || document).querySelectorAll('.coming-notify');
    for (var i = 0; i < forms.length; i++) {
      (function (form) {
        if (form.dataset.wired) return;
        form.dataset.wired = '1';
        form.addEventListener('submit', async function (e) {
          e.preventDefault();
          var input = form.querySelector('input[type="email"]');
          var msg = form.querySelector('.coming-msg');
          if (!input.checkValidity()) { input.reportValidity(); return; }
          var btn = form.querySelector('button');
          btn.disabled = true;
          try {
            await klaviyoIdentify(input.value, {});
            await klaviyoSubscribeToList(KLAVIYO_EARLY_ACCESS_LIST_ID, { email: input.value });
            msg.textContent = "you're on the list.";
            form.classList.add('is-done');
          } catch (err) {
            msg.textContent = "that didn't go through. try again.";
            btn.disabled = false;
          }
        });
      })(forms[i]);
    }
  }

  /* The homepage CTA follows what there is to do.

     Normally it sends you to the shop. When a drop is configured and
     has not opened, the useful action is to be told when it does. And
     when there is no drop AND most of the collection is gone, the shop
     is mostly sold-out cards, so early access is the honest ask.

     "Most of the collection" is measured from live availableForSale,
     not guessed: two thirds or more of products unbuyable. With no
     stock data it leaves the CTA alone. */
  function wireHeroCta() {
    var cta = document.querySelector('[data-hero-cta]');
    if (!cta) return;
    var state = dropState();
    if (state === 'upcoming') {
      cta.textContent = 'Get early access';
      cta.setAttribute('href', '/waitlist.html');
      return;
    }
    if (state === 'open') return;
    fetchStock().then(function (stock) {
      if (!stock) return;
      var handles = Object.keys(stock);
      if (handles.length < 4) return;
      var gone = 0;
      for (var i = 0; i < handles.length; i++) {
        var e = stock[handles[i]];
        if (e.known && e.total === 0) gone++;
      }
      if (gone / handles.length >= 0.66) {
        cta.textContent = 'Get early access';
        cta.setAttribute('href', '/waitlist.html');
      }
    });
  }

  /* ---- live per-size stock ----------------------------------------

     Real quantityAvailable, fetched in its OWN request rather than
     added to PRODUCT_CARD_FIELDS. That is deliberate and the comment
     on PRODUCT_CARD_FIELDS says why: mixing quantityAvailable into the
     catalogue query broke live images and pricing across browsers
     earlier this launch. product.html already fetches quantities
     separately for the same reason; this is the shared version.

     Everything below fails silent. If the Storefront token cannot read
     quantityAvailable, or the request fails, or a product comes back
     without numbers, no stock line and no LOW STOCK badge is drawn.
     Showing nothing is correct; guessing is not. */
  var LOW_SIZE = 3;      // "N left" on a size at or under this
  var LOW_TOTAL = 5;     // LOW STOCK badge at or under this, in total

  var stockCache = null;
  var stockPending = null;

  function fetchStock() {
    if (stockCache) return Promise.resolve(stockCache);
    if (stockPending) return stockPending;
    stockPending = shopifyFetch(
      '{ products(first: 50) { edges { node { handle variants(first: 40) {'
      + ' edges { node { id quantityAvailable availableForSale } } } } } } }'
    ).then(function (data) {
      var out = {};
      var edges = (data && data.products && data.products.edges) || [];
      for (var i = 0; i < edges.length; i++) {
        var n = edges[i].node;
        var byVariant = {};
        var total = 0;
        var known = false;
        var ve = (n.variants && n.variants.edges) || [];
        for (var j = 0; j < ve.length; j++) {
          var v = ve[j].node;
          var q = v.quantityAvailable;
          if (typeof q === 'number') {
            known = true;
            byVariant[v.id] = q;
            /* Negative quantities exist: an oversold item reads below
               zero and would drag a total down past products that
               genuinely have stock. Floor each variant at zero for the
               total, and never render a negative as a count. */
            total += Math.max(0, q);
          }
        }
        out[n.handle] = { byVariant: byVariant, total: total, known: known };
      }
      stockCache = out;
      stockPending = null;
      return out;
    }).catch(function () {
      stockPending = null;
      return null;
    });
    return stockPending;
  }

  /* The label for one size, or '' when there is nothing honest to say.
     Only a positive count at or under the threshold earns a line. */
  function sizeStockLabel(qty) {
    if (typeof qty !== 'number' || qty <= 0 || qty > LOW_SIZE) return '';
    return qty + ' left';
  }

  /* LOW STOCK is about the product as a whole, and only while it can
     still be bought. Sold out is a different badge and the card
     already draws it from availableForSale, which is the only field
     that says whether a thing is purchasable -- quantity does not.
     The lanyard proves the difference: it sits at -5 with
     availableForSale true, so a quantity rule would mark a buyable
     product SOLD OUT. */
  function lowStockBadge(entry, soldOut) {
    if (!entry || !entry.known || soldOut) return false;
    return entry.total > 0 && entry.total <= LOW_TOTAL;
  }

  function isNewHandle(handle) {
    var cfg = window.ASIOR_LAUNCH || {};
    var list = cfg.NEW_HANDLES;
    return Array.isArray(list) && list.indexOf(handle) !== -1;
  }

  /* Decorates whatever cards are on the page once the numbers land.
     Called after a grid renders; safe to call repeatedly. */
  function decorateStock(root) {
    var cards = (root || document).querySelectorAll('.product[data-handle]');
    if (!cards.length) return;
    fetchStock().then(function (stock) {
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var handle = card.getAttribute('data-handle');
        var entry = stock && stock[handle];
        var soldOut = !!card.querySelector('.product-badge--sold');

        if (isNewHandle(handle) && !card.querySelector('.product-badge--new')) {
          card.querySelector('.product-frame').insertAdjacentHTML('afterbegin',
            '<span class="product-badge product-badge--new">New</span>');
        }
        if (lowStockBadge(entry, soldOut) && !card.querySelector('.product-badge--low')) {
          card.querySelector('.product-frame').insertAdjacentHTML('afterbegin',
            '<span class="product-badge product-badge--low">Low stock</span>');
        }
        if (!entry || !entry.known) continue;
        /* "N left" on the quick-add size chips. */
        var chips = card.querySelectorAll('.quick-add .qa-size[data-variant-id]');
        for (var j = 0; j < chips.length; j++) {
          var q = entry.byVariant[chips[j].getAttribute('data-variant-id')];
          var label = sizeStockLabel(q);
          if (!label) continue;
          chips[j].setAttribute('data-left', q);
          chips[j].title = chips[j].getAttribute('data-size') + ': ' + label;
        }
      }
    });
  }

  /* ---- search panel ---------------------------------------------

     One panel, on every page, opened by the icon in the header. The
     catalogue is fetched the first time it opens and cached for the
     rest of the visit: a search box that nobody presses should cost
     nothing.

     Matching is over the customer-facing name, the Shopify title and
     the handle, because the three differ (FALL_PRODUCTS overrides
     names, and handles carry words the titles do not). Results are
     the same productCard() every grid uses, so a result and a tile
     are the same object.

     No "popular searches". Anything offered there would be invented,
     and CLAUDE.md is explicit that nothing on the site may be. */
  /* The catalogue, normalised into card shape. Shared rather than
     per-page: shop.html and the collection pages each had their own
     copy of this query, and the search panel needs the same list on
     every page including ones that have no grid at all. */
  function fetchCatalog() {
    return shopifyFetch('{ products(first: 50) { edges { node { ' + PRODUCT_CARD_FIELDS + ' } } } }')
      .then(function (data) {
        var edges = (data && data.products && data.products.edges) || [];
        return edges.map(function (e) {
          var card = normalizeProduct(e.node);
          card.title = e.node.title;
          return card;
        });
      });
  }

  var searchCatalog = null;
  var searchFetching = false;
  var searchLastFocus = null;

  function searchPanelEls() {
    return {
      panel: document.getElementById('searchPanel'),
      input: document.getElementById('searchInput'),
      results: document.getElementById('searchResults'),
      status: document.getElementById('searchStatus'),
      toggle: document.getElementById('searchToggle'),
    };
  }

  function renderSearch(term) {
    var el = searchPanelEls();
    if (!el.results) return;
    var q = String(term || '').trim().toLowerCase();
    if (!q) { el.results.innerHTML = ''; el.status.textContent = ''; return; }
    if (!searchCatalog) { el.status.textContent = 'Loading the catalogue\u2026'; return; }
    var hits = searchCatalog.filter(function (p) {
      return (p.name + ' ' + (p.title || '') + ' ' + p.handle).toLowerCase().indexOf(q) > -1;
    });
    el.status.textContent = hits.length
      ? hits.length + (hits.length === 1 ? ' product' : ' products')
      : 'Nothing matches \u201c' + term.trim() + '\u201d.';
    el.results.innerHTML = hits.slice(0, 12).map(function (p) {
      /* No size row: the row's buttons are wired per page and this
         panel is on every page, including ones with no quick-add
         handler. The card falls back to its link. */
      var card = Object.create(p); card.sizes = [];
      return productCard(card, { eager: false, peek: true, sizes: CARD_SIZES.grid });
    }).join('');
    if (window.Asior && Asior.observeReveal) Asior.observeReveal(el.results);
    wireHoverSwap(el.results);
  }

  function loadSearchCatalog() {
    if (searchCatalog || searchFetching) return;
    searchFetching = true;
    fetchCatalog().then(function (list) {
      searchCatalog = list;
      searchFetching = false;
      var el = searchPanelEls();
      if (el.input && el.panel && !el.panel.hidden) renderSearch(el.input.value);
    }).catch(function () {
      searchFetching = false;
      var el = searchPanelEls();
      if (el.status) el.status.textContent = "Search isn't available right now.";
    });
  }

  function openSearch() {
    var el = searchPanelEls();
    if (!el.panel) return;
    searchLastFocus = document.activeElement;
    el.panel.hidden = false;
    /* The class lands on the next frame so the transition has a
       start state to animate from. */
    requestAnimationFrame(function () { el.panel.classList.add('is-open'); });
    document.documentElement.classList.add('search-open');
    if (el.toggle) el.toggle.setAttribute('aria-expanded', 'true');
    loadSearchCatalog();
    if (el.input) el.input.focus();
  }

  function closeSearch() {
    var el = searchPanelEls();
    if (!el.panel || el.panel.hidden) return;
    el.panel.classList.remove('is-open');
    document.documentElement.classList.remove('search-open');
    if (el.toggle) el.toggle.setAttribute('aria-expanded', 'false');
    var done = function () { el.panel.hidden = true; };
    setTimeout(done, 220);
    if (searchLastFocus && searchLastFocus.focus) searchLastFocus.focus();
  }

  function wireSearch() {
    var el = searchPanelEls();
    if (!el.panel || !el.toggle) return;
    el.toggle.addEventListener('click', function () {
      el.panel.hidden ? openSearch() : closeSearch();
    });
    var closeBtn = document.getElementById('searchClose');
    if (closeBtn) closeBtn.addEventListener('click', closeSearch);

    /* A click on the backdrop, but not inside the panel itself. */
    el.panel.addEventListener('click', function (e) {
      if (e.target === el.panel) closeSearch();
    });

    var t = null;
    if (el.input) {
      el.input.addEventListener('input', function () {
        clearTimeout(t);
        var v = el.input.value;
        t = setTimeout(function () { renderSearch(v); }, 120);
      });
    }

    document.addEventListener('keydown', function (e) {
      if (el.panel.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); closeSearch(); return; }
      if (e.key !== 'Tab') return;
      /* Focus stays in the panel while it is open. */
      var f = el.panel.querySelectorAll('a[href], button, input, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* ---- reveal on scroll -----------------------------------------

     One observer for the whole site: every .product in any grid, plus
     anything marked data-reveal. Pages used to run their own copy of
     this (index.html and shop.html each had one) and the collection
     pages had none, so a card rendered on a category page would never
     have been revealed at all.

     The contract is inverted on purpose. .js-reveal goes on <html>
     here, from the script that does the revealing, and the CSS hides
     nothing without it. If this file fails to load or throws before
     this line, the page renders fully visible rather than blank.

     Three further ways a reveal-on-scroll leaves content stranded,
     all closed here:

       - an element taller than the viewport can never satisfy a
         fractional threshold, so threshold is 0 and the margin is a
         screen deep: things arrive already visible rather than fading
         in under the reader.
       - a browser with no IntersectionObserver observes nothing and
         would leave every card at opacity 0. It reveals immediately
         instead.
       - grids re-render from the live catalogue after first paint, so
         new cards appear that nobody is observing. A MutationObserver
         picks those up, and a 2.5s failsafe reveals anything still
         hidden whatever the reason.

     Stagger is by position in the row, not by index in the batch: the
     entries of one observer callback are not in document order, so
     indexing them made the delay jump around the row. */
  var revealObserver = null;
  var REVEAL_SEL = '.product, [data-reveal]';

  function revealNow(el) {
    if (!el || el.classList.contains('in')) return;
    var cols = 0;
    var parent = el.parentElement;
    if (parent) {
      var cs = getComputedStyle(parent).gridTemplateColumns;
      cols = cs && cs !== 'none' ? cs.split(' ').length : 0;
    }
    var step = 0;
    if (cols > 1) {
      var sibs = Array.prototype.indexOf.call(parent.children, el);
      step = (sibs % cols) * 55;
    }
    if (step) setTimeout(function () { el.classList.add('in'); }, step);
    else el.classList.add('in');
  }

  /* Measured a frame late, always. A grid re-rendered from the live
     catalogue is measured by the MutationObserver in the same tick it
     was written, before layout has run and before the lazy <img>
     elements have reserved their height -- every card reports a top
     near zero, every card looks like it is above the fold, and the
     whole grid reveals at once with no animation at all. One frame is
     enough for the aspect-ratio boxes to take their height. */
  function observeReveal(root) {
    requestAnimationFrame(function () {
      try {
        observeRevealNow(root);
      } catch (err) {
        /* Never leave the page hidden because measuring threw. */
        revealEverything();
      }
    });
  }

  function observeRevealNow(root) {
    /* Every grid on the site funnels through here after it renders,
       which makes it the one place that reliably sees new cards. The
       stock pass rides along rather than each page remembering to
       call it. */
    try { decorateStock(root); } catch (err) { /* never block the reveal */ }
    var items = (root || document).querySelectorAll(REVEAL_SEL);
    var fold = window.innerHeight + 200;
    for (var i = 0; i < items.length; i++) {
      var el = items[i];
      if (el.classList.contains('in')) continue;
      /* On, or just under, the first screen: show it now. Nothing
         above the fold should wait to be scrolled into. */
      if (!revealObserver || el.getBoundingClientRect().top < fold) {
        revealNow(el);
        continue;
      }
      revealObserver.observe(el);
    }
  }

  function revealEverything() {
    var all = document.querySelectorAll(REVEAL_SEL);
    for (var i = 0; i < all.length; i++) all[i].classList.add('in');
  }

  function wireReveal() {
    var reduced = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Nothing is hidden for a visitor who cannot see it come back. No
       .js-reveal is added at all in these two cases, so the hidden
       state never applies in the first place. */
    if (reduced || !('IntersectionObserver' in window)) {
      revealEverything();
      return;
    }

    revealObserver = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        revealNow(entries[i].target);
        revealObserver.unobserve(entries[i].target);
      }
    }, { threshold: 0, rootMargin: '0px 0px 240px 0px' });

    /* Only now, with a working observer in hand, does anything get
       hidden. The order matters: if the line above had thrown, the
       class would already be on <html> and the page would be a
       catalogue of invisible products with nothing left to reveal it. */
    document.documentElement.classList.add('js-reveal');

    try {
      observeReveal(document);
    } catch (err) {
      document.documentElement.classList.remove('js-reveal');
      return;
    }

    if ('MutationObserver' in window) {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            if (added[j].nodeType === 1) observeReveal(added[j].parentNode || document);
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    }

    /* Last resort. Whatever went wrong -- an observer that never
       fired, a container that was display:none when it was measured,
       a re-render this missed -- nothing stays invisible. */
    setTimeout(revealEverything, 2500);
  }

  /* ---- the size row on a grid card ------------------------------

     The chips are rendered into .product-frame, over the bottom edge
     of the photograph, and are hidden there until the control on the
     image is clicked. Delegated at the document so it covers the main
     grid, the recently-viewed rail and every re-render the shop and
     collection toolbars cause, on every page that renders a card.

     Hidden with visibility, not opacity alone: an opacity-0 button is
     still in the tab order, so a keyboard visitor would have tabbed
     through four invisible size buttons per tile down the whole grid.

     One row open at a time. Two open rows on neighbouring tiles read
     as one wide tray spanning both, and the second tap is almost
     always a correction of the first. */
  function closeSizeRow(card) {
    if (!card) return;
    card.classList.remove('is-picking');
    var t = card.querySelector('[data-sizes]');
    if (t) t.setAttribute('aria-expanded', 'false');
  }

  function wireCardSizeReveal() {
    /* Capture, not bubble. Each page binds its own add-to-cart handler
       on the grid element, and a grid listener runs before a document
       one: by the time this saw the click it had already replaced the
       row's innerHTML with "added S. View cart", which detached the
       button that was clicked. A detached node has no ancestors, so
       the "is this click inside the open row?" test below failed and
       the row closed over its own confirmation. Capture runs this
       first, while the clicked chip is still in the card. */
    document.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      var trigger = e.target.closest('[data-sizes]');
      if (trigger) {
        var card = trigger.closest('.product');
        /* No card around it means no row to reveal, so the href does
           its job and the shopper lands on the product page. */
        if (!card) return;
        e.preventDefault();
        var opening = !card.classList.contains('is-picking');
        var others = document.querySelectorAll('.product.is-picking');
        for (var i = 0; i < others.length; i++) {
          if (others[i] !== card) closeSizeRow(others[i]);
        }
        card.classList.toggle('is-picking', opening);
        trigger.setAttribute('aria-expanded', opening ? 'true' : 'false');
        if (opening) {
          var first = card.querySelector('.quick-add .qa-size:not([disabled])');
          if (first) first.focus();
        }
        return;
      }
      /* A click anywhere else puts the row away -- but not a click
         inside it, which is the shopper adding to the cart, and not
         one on the chips' own "added." confirmation. */
      if (e.target.closest('.product.is-picking .quick-add')) return;
      var open = document.querySelectorAll('.product.is-picking');
      for (var j = 0; j < open.length; j++) closeSizeRow(open[j]);
    }, true);

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var card = document.querySelector('.product.is-picking');
      if (!card) return;
      var trigger = card.querySelector('[data-sizes]');
      closeSizeRow(card);
      /* Focus is inside the row that just closed, so it has to come
         back to the control that opened it or it falls to the body. */
      if (trigger) trigger.focus();
    });
  }

  /* Publish the fixed header's real height as --header-h, which
     .page-top-space uses to clear it.

     The spacer was two hardcoded numbers (92px / 118px) against a
     header that is actually 87px / 95px tall, because its height
     depends on the loaded font and on whether the nav wraps. The slack
     was invisible on a dark page and became a black band between the
     nav and the homepage's full-bleed photograph.

     Measured on load, on resize, and again once the webfont has
     swapped in -- Archivo is loaded with display=swap, so the first
     measurement is taken against the fallback face and can be a couple
     of pixels out. The CSS keeps the old numbers as its fallback, so a
     visitor with no JS gets exactly what they got before. */
  function syncHeaderHeight() {
    var header = document.querySelector('header');
    if (!header) return;
    var h = Math.round(header.getBoundingClientRect().bottom);
    if (h > 0) document.documentElement.style.setProperty('--header-h', h + 'px');
  }

  syncHeaderHeight();
  window.addEventListener('resize', syncHeaderHeight, { passive: true });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(syncHeaderHeight).catch(function () {});
  }

  // Footer block on every page, and the whole of /text. The PDP
  // block renders after its catalog fetch, so product.html calls
  // wireSmsSignup() again once it has built the buy box.
  wireSmsSignup(document);
  wireEmailSignup(document);
  wireNav();
  wireCartLinks();
  // Delegated at the document, so one call covers every grid on the
  // page and every grid a page renders later.
  wireCardSizeReveal();
  wireSearch();
  wireDropCountdown();
  wireHeroCta();
  wireReveal();
  // Renders "(0)" immediately so the header never shows a bare "Cart"
  // while the real count is still in flight.
  renderCartCount(0);
  refreshCartCount();
  // Capture on every page load, not just at submit time — a visitor
  // can land on one page carrying UTM params and convert on a
  // different one, and by then the params that mattered are gone from
  // the URL bar. This is what makes getUTMParams() called later, from
  // a form on any page, actually see the first touch.
  getUTMParams();
})();
