/* ===================================================================
   ASIOR — DROP ACCESS.

   An entry experience and a product drawer. Configured entirely by
   assets/drop-config.js; this file decides nothing about what the
   site claims.

   WHAT IT IS NOT. It is not a lock, not a gate and not a password
   wall. Every path through it ends with the visitor still able to
   buy: Escape closes it, the scrim closes it, "Continue shopping"
   closes it, the close button closes it, and a card in the drawer
   either adds to the real cart or sends them to the real product
   page. There is no state in which it covers the store and will not
   go away. The store stays open; this is a door, not a lock.

   WHAT IT READS. Product data comes from the live Shopify catalogue
   on open -- price, images, variants, availability -- through the
   same shopifyFetch and normalizeProduct every grid uses. No status
   and no stock figure is written here. A handle Shopify stops
   returning simply does not appear.

   ORDER OF LOADING. Depends on assets/site.js (window.Asior) and
   assets/drop-config.js (window.ASIOR_DROP) and does nothing at all
   if either is missing, so a page that forgets to include one does
   not throw -- it just has no drop access.
   =================================================================== */
(function () {
  'use strict';

  var A = window.Asior;
  var CFG = window.ASIOR_DROP;
  if (!A || !CFG || !CFG.ENABLED) return;

  var LS_BUCKET = 'asior_drop_bucket';
  var LS_DISMISS = 'asior_drop_dismissed_at';
  var LS_SUBSCRIBED = 'asior_drop_subscribed';
  var LS_SEEN = 'asior_drop_seen_at';
  var SS_PAGES = 'asior_pages_this_session';

  /* localStorage throws outright in Safari private mode and with
     "block all cookies", so every access goes through these. A
     visitor we cannot remember is treated as the control group and
     never auto-interrupted, which is the safe way to be wrong. */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* not fatal */ } }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* not fatal */ } }

  function esc(s) { return A.escapeHtml ? A.escapeHtml(s) : String(s == null ? '' : s); }
  function escA(s) { return A.escapeAttr ? A.escapeAttr(s) : esc(s); }

  // -----------------------------------------------------------------
  // Campaign
  // -----------------------------------------------------------------
  function activeCampaign() {
    var list = CFG.CAMPAIGNS || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].active) return list[i];
    return null;
  }

  // -----------------------------------------------------------------
  // Events
  //
  // One emitter. Every event goes to Klaviyo (wired and working) and
  // to GA4 (only once a measurement id exists in drop-config.js).
  // Nothing here fires on a click alone: a signup event is emitted by
  // the code path that saw the request succeed, never by the handler
  // that sent it. That is the difference between measuring intent and
  // measuring outcome, and it is the whole reason this funnel is
  // worth reading.
  // -----------------------------------------------------------------
  var gaReady = false;
  function loadGA4() {
    var id = CFG.ANALYTICS && CFG.ANALYTICS.GA4_MEASUREMENT_ID;
    if (!id || gaReady) return;
    gaReady = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    /* send_page_view false: this storefront already counts its own
       pageviews, and letting gtag add one here would double-count
       every page that loads this script. */
    window.gtag('config', id, { send_page_view: false });
  }

  var sent = {};
  function emit(name, props, opts) {
    opts = opts || {};
    var payload = {};
    var k;
    for (k in (props || {})) if (Object.prototype.hasOwnProperty.call(props, k)) payload[k] = props[k];

    var camp = activeCampaign();
    if (camp && payload.campaign == null) payload.campaign = camp.slug;
    payload.drop_bucket = bucket();

    /* First-touch attribution, the same source every other form on
       the site reads, so a drop signup is attributable to the ad that
       brought them in. */
    try {
      var utm = A.getUTMParams ? A.getUTMParams() : {};
      for (k in utm) if (Object.prototype.hasOwnProperty.call(utm, k)) payload[k] = utm[k];
    } catch (e) { /* attribution is not worth an exception */ }

    /* Once-per-page events (the impression) must not double-count if
       the overlay is reopened or a re-render calls through twice. */
    if (opts.once) {
      if (sent[name]) return;
      sent[name] = true;
    }

    if (CFG.ANALYTICS && CFG.ANALYTICS.DEBUG && window.console) {
      console.log('[drop] ' + name, payload);
    }
    if (CFG.ANALYTICS && CFG.ANALYTICS.KLAVIYO && A.klaviyoTrack) {
      try { A.klaviyoTrack(name, payload, opts.profile || null); } catch (e) { /* never block the UI */ }
    }
    if (CFG.ANALYTICS && CFG.ANALYTICS.GA4_MEASUREMENT_ID) {
      loadGA4();
      try { window.gtag('event', name.replace(/\s+/g, '_').toLowerCase(), payload); } catch (e) { /* ditto */ }
    }
  }

  // -----------------------------------------------------------------
  // Bucketing and eligibility
  // -----------------------------------------------------------------
  /* Sticky, and decided once. 'test' sees the automatic experience,
     'control' never does. Written down so a visitor does not flip
     between sessions and get counted as two different people. A
     browser that cannot store it is 'control': never interrupted,
     and never counted either, which skews the sample slightly toward
     control but can never show somebody a half-working overlay. */
  var cachedBucket = null;
  function bucket() {
    if (cachedBucket) return cachedBucket;
    var v = lsGet(LS_BUCKET);
    if (v !== 'test' && v !== 'control') {
      var share = typeof CFG.ROLLOUT === 'number' ? CFG.ROLLOUT : 0.5;
      v = Math.random() < share ? 'test' : 'control';
      lsSet(LS_BUCKET, v);
      if (lsGet(LS_BUCKET) !== v) v = 'control';   // storage refused it
    }
    cachedBucket = v;
    return v;
  }

  function subscribed() { return lsGet(LS_SUBSCRIBED) === '1'; }

  function dismissedRecently() {
    var at = Number(lsGet(LS_DISMISS) || 0);
    if (!at) return false;
    var days = typeof CFG.SUPPRESS_DAYS === 'number' ? CFG.SUPPRESS_DAYS : 7;
    return (Date.now() - at) < days * 24 * 60 * 60 * 1000;
  }

  /* Is this a moment where interrupting would cost a sale? */
  function midPurchase() {
    var path = (location.pathname || '').toLowerCase();
    var never = CFG.NEVER_ON || [];
    for (var i = 0; i < never.length; i++) {
      if (path.indexOf(never[i]) === 0) return true;
    }
    /* A shopper with something in the bag has already started. The
       count is the one the header already read from Shopify. */
    try { if (A.cartQuantity && A.cartQuantity() > 0) return true; } catch (e) { /* assume not */ }
    /* The cart drawer being open is the clearest signal of all. */
    if (document.querySelector('.cart-drawer.open, .cart-drawer-panel.open')) return true;
    return false;
  }

  function autoEligible() {
    if (!CFG.AUTO) return false;
    if (bucket() !== 'test') return false;
    if (subscribed()) return false;
    if (dismissedRecently()) return false;
    if (midPurchase()) return false;
    var pages = Number(ssGet(SS_PAGES) || 0);
    var minPages = (CFG.TRIGGER && CFG.TRIGGER.minPages) || 1;
    if (pages < minPages) return false;
    return true;
  }

  // -----------------------------------------------------------------
  // The overlay
  // -----------------------------------------------------------------
  var root = null;
  var lastFocus = null;
  var isOpen = false;

  function campaignHref(camp) {
    return '/drop.html' + (camp ? '?c=' + encodeURIComponent(camp.slug) : '');
  }

  /* The overlay opens on every page, including /products/x.html and
     /collections/x.html. A relative image path there resolves against
     the directory, not the root, so images/oli04281.jpg became
     /products/images/oli04281.jpg and 404'd on 19 pages -- found by
     the crawl, not by looking, because the overlay still rendered and
     only the photograph was missing. Anything this file turns into a
     URL goes through here first. */
  function rootPath(p) {
    var v = String(p == null ? '' : p);
    if (!v) return '';
    if (/^(https?:)?\/\//.test(v)) return v;     // already absolute
    return v.charAt(0) === '/' ? v : '/' + v;
  }

  function shell() {
    var camp = activeCampaign();
    var heroHTML = '';
    if (camp && camp.hero) {
      var heroSrc = rootPath(camp.hero);
      var webp = heroSrc.replace(/\.(jpe?g|png)$/i, '.webp');
      heroHTML =
        '<figure class="drop-figure">'
        + '<picture>'
        + '<source type="image/webp" srcset="' + escA(webp) + '">'
        + '<img src="' + escA(heroSrc) + '" alt="' + escA(camp.heroAlt || '') + '"'
        + (camp.heroWidth ? ' width="' + escA(camp.heroWidth) + '"' : '')
        + (camp.heroHeight ? ' height="' + escA(camp.heroHeight) + '"' : '')
        + ' decoding="async">'
        + '</picture>'
        + '</figure>';
    }

    return ''
      + '<div class="drop-scrim" data-drop-close></div>'
      + '<div class="drop-panel" role="dialog" aria-modal="true" aria-labelledby="dropTitle">'
      +   '<button type="button" class="drop-close" data-drop-close aria-label="Close drop access">'
      +     '<span aria-hidden="true">×</span>'
      +   '</button>'
      +   heroHTML
      +   '<div class="drop-body">'
      +     '<div class="drop-view drop-view--intro" data-view="intro">'
      +       '<p class="drop-eyebrow">Asior / Drop access</p>'
      +       '<h2 class="drop-title" id="dropTitle">The next drop starts here.</h2>'
      +       '<p class="drop-sub">First access to upcoming pieces and limited releases.</p>'
      +       '<div class="drop-actions">'
      +         '<button type="button" class="drop-btn drop-btn--primary" data-drop-explore>Explore the drop</button>'
      +         '<a class="drop-btn drop-btn--ghost" href="' + escA(campaignHref(camp)) + '" data-drop-access-link>Get early access</a>'
      +       '</div>'
      +       '<button type="button" class="drop-continue" data-drop-close>Continue shopping</button>'
      +     '</div>'
      +     '<div class="drop-view drop-view--shop" data-view="shop" hidden>'
      +       '<div class="drop-shop-head">'
      +         '<button type="button" class="drop-back" data-drop-back>'
      +           '<span aria-hidden="true">←</span> Back</button>'
      +         '<p class="drop-eyebrow">In the drop</p>'
      +       '</div>'
      +       '<div class="drop-rail" data-drop-rail aria-live="polite">'
      +         '<p class="drop-loading">Loading the drop…</p>'
      +       '</div>'
      +       '<button type="button" class="drop-continue" data-drop-close>Continue shopping</button>'
      +     '</div>'
      +   '</div>'
      + '</div>';
  }

  function build() {
    if (root) return root;
    root = document.createElement('div');
    root.className = 'drop-root';
    root.setAttribute('hidden', '');
    root.innerHTML = shell();
    document.body.appendChild(root);

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-drop-close]')) { e.preventDefault(); close('dismiss'); return; }
      if (e.target.closest('[data-drop-explore]')) { e.preventDefault(); showShop(); return; }
      if (e.target.closest('[data-drop-back]')) { e.preventDefault(); showIntro(); return; }
      if (e.target.closest('[data-drop-access-link]')) { emit('Drop Access CTA'); return; }
    });
    return root;
  }

  function view(name) {
    var views = root.querySelectorAll('.drop-view');
    for (var i = 0; i < views.length; i++) {
      var v = views[i];
      var on = v.getAttribute('data-view') === name;
      if (on) v.removeAttribute('hidden'); else v.setAttribute('hidden', '');
    }
  }

  function showIntro() { view('intro'); }

  function showShop() {
    view('shop');
    emit('Drop Drawer Opened');
    renderRail();
    var first = root.querySelector('[data-drop-back]');
    if (first) first.focus();
  }

  /* Focus trap. A dialog that lets Tab wander into the page behind it
     is not a dialog, and a screen-reader user tabbing into a
     catalogue they cannot see is the worst version of this. */
  function onKeydown(e) {
    if (!isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); close('escape'); return; }
    if (e.key !== 'Tab') return;
    var f = root.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    var vis = [];
    for (var i = 0; i < f.length; i++) {
      if (f[i].offsetWidth || f[i].offsetHeight || f[i].getClientRects().length) vis.push(f[i]);
    }
    if (!vis.length) return;
    var first = vis[0], last = vis[vis.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open(source) {
    if (isOpen) return;
    build();
    lastFocus = document.activeElement;
    isOpen = true;
    root.removeAttribute('hidden');
    /* The page behind must not scroll under the overlay. Position is
       restored on close so the visitor comes back where they were,
       not at the top -- being thrown to the top of the catalogue is
       its own reason to leave. */
    root.dataset.scrollY = String(window.scrollY || 0);
    document.body.classList.add('drop-open');
    document.body.style.top = '-' + (window.scrollY || 0) + 'px';
    requestAnimationFrame(function () { root.classList.add('is-open'); });
    document.addEventListener('keydown', onKeydown, true);
    showIntro();
    lsSet(LS_SEEN, String(Date.now()));
    var close = root.querySelector('.drop-close');
    if (close) close.focus();
    emit('Drop Access Shown', { source: source || 'manual' }, { once: true });
  }

  function close(reason) {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove('is-open');
    document.removeEventListener('keydown', onKeydown, true);
    var y = Number(root.dataset.scrollY || 0);
    document.body.classList.remove('drop-open');
    document.body.style.top = '';
    window.scrollTo(0, y);
    /* Only an explicit dismissal starts the seven-day clock. */
    if (reason === 'dismiss' || reason === 'escape') {
      lsSet(LS_DISMISS, String(Date.now()));
      emit('Drop Access Dismissed', { reason: reason });
    }
    window.setTimeout(function () {
      if (!isOpen && root) root.setAttribute('hidden', '');
    }, 260);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* gone */ } }
  }

  // -----------------------------------------------------------------
  // The product rail — live Shopify data, never a hardcoded status
  // -----------------------------------------------------------------
  var catalogCache = null;

  function fetchCatalog() {
    if (catalogCache) return Promise.resolve(catalogCache);
    if (!A.shopifyFetch || !A.PRODUCT_CARD_FIELDS || !A.normalizeProduct) {
      return Promise.resolve(null);
    }
    return A.shopifyFetch('{ products(first: 50) { edges { node { ' + A.PRODUCT_CARD_FIELDS + ' } } } }')
      .then(function (data) {
        var out = {};
        var edges = (data && data.products && data.products.edges) || [];
        for (var i = 0; i < edges.length; i++) {
          var p = A.normalizeProduct(edges[i].node);
          if (p) out[p.handle] = p;
        }
        catalogCache = out;
        return out;
      })
      .catch(function () { return null; });
  }

  /* One card. Status comes from Shopify's own availableForSale via
     normalizeProduct's soldOut, never from a quantity and never from
     this file.

       AVAILABLE NOW  price + a size row that adds to the real cart
       COMING SOON    a handle named in the active campaign that
                      Shopify does not have yet -- early access only
       SOLD OUT       first access to the next drop, NOT a restock
                      alert, because no back-in-stock flow exists
                      (see RESTOCK_ALERTS in drop-config.js) */
  function cardHTML(p) {
    var img = p.image;
    var imgHTML = img && A.imgTag
      ? A.imgTag(img, { sizes: '(max-width: 760px) 70vw, 280px', alt: img.altText || p.name })
      : '<div class="drop-card-ph" aria-hidden="true"></div>';

    var status, action;
    if (p.soldOut) {
      status = '<span class="drop-status drop-status--out">Sold out</span>';
      action = '<button type="button" class="drop-card-btn" data-drop-waitlist="' + escA(p.handle) + '">'
             + 'Get first access to the next drop</button>';
    } else {
      status = '<span class="drop-status">Available now</span>';
      var sizes = (p.sizes || []).filter(function (s) { return s && s.variantId; });
      if (sizes.length && !p.needsChoice) {
        action = '<div class="drop-sizes" role="group" aria-label="Choose a size for ' + escA(p.name) + '">'
          + sizes.map(function (s) {
              return '<button type="button" class="drop-size"'
                + (s.available ? '' : ' disabled aria-disabled="true"')
                + ' data-drop-add="' + escA(s.variantId) + '"'
                + ' data-drop-handle="' + escA(p.handle) + '"'
                + ' data-drop-size="' + escA(s.size) + '">' + esc(s.size) + '</button>';
            }).join('')
          + '</div>';
      } else {
        action = '<a class="drop-card-btn" href="/products/' + escA(p.handle) + '.html"'
               + ' data-drop-product="' + escA(p.handle) + '">Select size</a>';
      }
    }

    return '<article class="drop-card" data-handle="' + escA(p.handle) + '">'
      + '<a class="drop-card-media" href="/products/' + escA(p.handle) + '.html"'
      + ' data-drop-product="' + escA(p.handle) + '" aria-label="' + escA(p.name) + '">'
      + imgHTML + '</a>'
      + '<div class="drop-card-meta">'
      +   status
      +   '<p class="drop-card-name">' + esc(p.name) + '</p>'
      +   '<p class="drop-card-price">' + p.priceLabel + '</p>'
      + '</div>'
      + action
      + '<p class="drop-card-msg" role="status" aria-live="polite"></p>'
      + '</article>';
  }

  function comingHTML(handle) {
    return '<article class="drop-card drop-card--coming" data-handle="' + escA(handle) + '">'
      + '<div class="drop-card-ph" aria-hidden="true"></div>'
      + '<div class="drop-card-meta">'
      +   '<span class="drop-status drop-status--soon">Coming soon</span>'
      +   '<p class="drop-card-name">' + esc(handle) + '</p>'
      + '</div>'
      + '<button type="button" class="drop-card-btn" data-drop-waitlist="' + escA(handle) + '">'
      + 'Get early access</button>'
      + '<p class="drop-card-msg" role="status" aria-live="polite"></p>'
      + '</article>';
  }

  function renderRail() {
    var rail = root.querySelector('[data-drop-rail]');
    if (!rail) return;
    fetchCatalog().then(function (cat) {
      if (!cat) {
        /* The catalogue did not answer. Say so rather than drawing an
           empty drawer that looks like an empty collection. */
        rail.innerHTML = '<p class="drop-loading">Couldn’t load the drop just now. '
          + '<a href="/shop.html">Shop everything</a></p>';
        return;
      }
      var handles = CFG.DRAWER_HANDLES || [];
      var html = handles.map(function (h) {
        var p = cat[h];
        /* A handle Shopify does not return is not silently dropped
           and not invented either: if the active campaign named it,
           it is genuinely an upcoming piece and gets a COMING SOON
           card. Otherwise it is stale config and shows nothing. */
        if (p) return cardHTML(p);
        var camp = activeCampaign();
        var named = camp && (camp.handles || []).indexOf(h) !== -1;
        return named ? comingHTML(h) : '';
      }).join('');
      rail.innerHTML = html || '<p class="drop-loading">Nothing in the drop yet. '
        + '<a href="/shop.html">Shop everything</a></p>';
      if (A.wireHoverSwap) { try { A.wireHoverSwap(rail); } catch (e) { /* decorative */ } }
    });
  }

  // -----------------------------------------------------------------
  // Adding to the bag, straight from the drawer
  // -----------------------------------------------------------------
  var adding = false;
  function handleAdd(btn) {
    if (adding) return;
    var variantId = btn.getAttribute('data-drop-add');
    var handle = btn.getAttribute('data-drop-handle');
    var size = btn.getAttribute('data-drop-size');
    var card = btn.closest('.drop-card');
    var msg = card && card.querySelector('.drop-card-msg');
    if (!variantId || !A.addToShopifyCart) return;

    adding = true;
    btn.disabled = true;
    if (msg) msg.textContent = 'Adding…';

    A.addToShopifyCart(variantId, 1).then(function () {
      if (msg) msg.textContent = 'Added. ';
      if (msg) {
        var a = document.createElement('a');
        a.href = '/cart.html';
        a.textContent = 'View bag';
        msg.appendChild(a);
      }
      if (A.recordSizeChoice && size) { try { A.recordSizeChoice(size); } catch (e) {} }
      /* Emitted after Shopify confirmed the line, not on the click. */
      emit('Drop Add To Cart', { product_handle: handle, size: size, variant_id: variantId });
      if (A.klaviyoAddedToCart) {
        try { A.klaviyoAddedToCart({ handle: handle, size: size }); } catch (e) {}
      }
    }).catch(function () {
      if (msg) msg.textContent = 'That didn’t go through. Try again.';
    }).then(function () {
      adding = false;
      btn.disabled = false;
    });
  }

  // -----------------------------------------------------------------
  // Product-specific waitlist
  //
  // Three different things, kept apart on purpose:
  //
  //   campaign waitlist   a named upcoming drop -> the campaign's own
  //                       list, which has a live flow
  //   next-drop interest  a sold-out piece -> the Email List, through
  //                       klaviyoNextDropSignup, the same capture the
  //                       product page uses
  //   restock alert       NOT BUILT. No back-in-stock flow exists, so
  //                       the site does not offer one.
  //
  // Both paths record the product, the size where there is one, the
  // campaign and the source as event properties, so the list is
  // segmentable by what the person actually wanted.
  // -----------------------------------------------------------------
  function waitlistFormHTML(handle, sizes) {
    var id = 'dw-' + handle.replace(/[^a-z0-9]/gi, '');
    var sizeRow = '';
    if (sizes && sizes.length) {
      sizeRow = '<div class="drop-wl-sizes" role="group" aria-label="Size you want">'
        + sizes.map(function (s, i) {
            return '<label class="drop-wl-size">'
              + '<input type="radio" name="' + escA(id) + '-size" value="' + escA(s) + '"'
              + (i === 0 ? ' checked' : '') + '> <span>' + esc(s) + '</span></label>';
          }).join('')
        + '</div>';
    }
    return '<form class="drop-wl" data-drop-wl="' + escA(handle) + '" novalidate>'
      + sizeRow
      + '<div class="drop-wl-row">'
      +   '<label class="sr-only" for="' + escA(id) + '-email">Email address</label>'
      +   '<input class="field" type="email" id="' + escA(id) + '-email" name="email"'
      +   ' placeholder="Email" autocomplete="email" spellcheck="false" required>'
      +   '<button type="submit">Notify me</button>'
      + '</div>'
      /* The footer's consent sentence, word for word, because this is
         the same marketing list and the same real consent. */
      + '<p class="drop-wl-consent">By signing up, you agree to receive occasional marketing '
      + 'emails. Unsubscribe anytime.</p>'
      + '<p class="drop-wl-msg" role="status" aria-live="polite"></p>'
      + '</form>';
  }

  function openWaitlist(btn) {
    var handle = btn.getAttribute('data-drop-waitlist');
    var card = btn.closest('.drop-card');
    if (!card || card.querySelector('.drop-wl')) return;
    var sizes = [];
    if (catalogCache && catalogCache[handle]) {
      sizes = (catalogCache[handle].sizes || []).map(function (s) { return s.size; });
    }
    btn.insertAdjacentHTML('afterend', waitlistFormHTML(handle, sizes));
    btn.setAttribute('hidden', '');
    var input = card.querySelector('.drop-wl input[type="email"]');
    if (input) input.focus();
    emit('Drop Waitlist Opened', { product_handle: handle });
  }

  function submitWaitlist(form) {
    var handle = form.getAttribute('data-drop-wl');
    var input = form.querySelector('input[type="email"]');
    var btn = form.querySelector('button[type="submit"]');
    var msg = form.querySelector('.drop-wl-msg');
    var checked = form.querySelector('input[type="radio"]:checked');
    var size = checked ? checked.value : null;
    var email = (input.value || '').trim();

    if (!email || !input.validity.valid) {
      input.setAttribute('aria-invalid', 'true');
      msg.textContent = 'Enter a valid email address.';
      msg.classList.add('is-error');
      input.focus();
      return;
    }
    if (form.dataset.busy === '1') return;
    form.dataset.busy = '1';
    btn.disabled = true;
    input.disabled = true;
    var label = btn.textContent;
    btn.textContent = 'Sending';
    msg.classList.remove('is-error');

    var camp = activeCampaign();
    var product = catalogCache && catalogCache[handle];
    var meta = {
      product_handle: handle,
      product_title: product ? product.name : handle,
      size: size,
      campaign: camp ? camp.slug : null,
      source: 'drop_drawer',
    };

    /* A sold-out piece that really exists goes to the Email List
       through the shared next-drop capture; a campaign piece goes to
       the campaign's own list. Both are real lists with live flows,
       so both signups get answered. */
    var work;
    if (product && product.soldOut && A.klaviyoNextDropSignup) {
      work = A.klaviyoNextDropSignup(email, meta);
    } else {
      var listId = (camp && camp.listId) || null;
      if (!listId || !A.klaviyoSubscribeToList) {
        work = Promise.reject(new Error('no list configured'));
      } else {
        work = A.klaviyoSubscribeToList(listId, { email: email }).then(function () {
          if (A.klaviyoIdentify) { try { A.klaviyoIdentify(email); } catch (e) {} }
          if (A.klaviyoTrack) return A.klaviyoTrack('Drop Waitlist Signup', meta, { email: email });
        });
      }
    }

    work.then(function () {
      form.innerHTML = '<p class="drop-wl-done">You’re on the list. '
        + 'Check your inbox to confirm.</p>';
      lsSet(LS_SUBSCRIBED, '1');
      /* Emitted here, where the request is known to have succeeded. */
      emit('Drop Waitlist Signup', meta, { profile: { email: email } });
    }).catch(function () {
      msg.textContent = 'That didn’t go through. Try again in a moment.';
      msg.classList.add('is-error');
      form.dataset.busy = '0';
      btn.disabled = false;
      input.disabled = false;
      btn.textContent = label;
    });
  }

  // -----------------------------------------------------------------
  // Delegated handlers for everything inside the overlay
  // -----------------------------------------------------------------
  function wireRoot() {
    root.addEventListener('click', function (e) {
      var add = e.target.closest('[data-drop-add]');
      if (add && !add.disabled) { e.preventDefault(); handleAdd(add); return; }
      var wl = e.target.closest('[data-drop-waitlist]');
      if (wl) { e.preventDefault(); openWaitlist(wl); return; }
      var prod = e.target.closest('[data-drop-product]');
      if (prod) {
        emit('Drop Product Clicked', { product_handle: prod.getAttribute('data-drop-product') });
        return;   // the link then navigates, as it should
      }
    });
    root.addEventListener('submit', function (e) {
      var form = e.target.closest('[data-drop-wl]');
      if (!form) return;
      e.preventDefault();
      submitWaitlist(form);
    });
  }

  // -----------------------------------------------------------------
  // Triggering
  // -----------------------------------------------------------------
  function armAuto() {
    if (!autoEligible()) return;

    var fired = false;
    function fire(why) {
      if (fired || isOpen) return;
      /* Re-checked at the moment of firing, not only when armed: a
         visitor can add something to the bag during those ten
         seconds, and interrupting them then is the thing this is most
         careful not to do. */
      if (midPurchase()) return;
      fired = true;
      cleanup();
      open(why);
    }

    /* Engaged time, not wall-clock. The timer only advances while the
       tab is actually visible. */
    var elapsed = 0, last = Date.now(), timer = null;
    var want = (CFG.TRIGGER && CFG.TRIGGER.delayMs) || 10000;

    function tick() {
      if (document.visibilityState === 'visible') elapsed += Date.now() - last;
      last = Date.now();
      if (elapsed >= want) fire('timer');
    }
    timer = window.setInterval(tick, 500);

    function onScroll() {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      if (h <= 0) return;
      var pct = (window.scrollY / h) * 100;
      if (pct >= ((CFG.TRIGGER && CFG.TRIGGER.scrollPct) || 25)) fire('scroll');
    }
    window.addEventListener('scroll', onScroll, { passive: true });

    function cleanup() {
      window.clearInterval(timer);
      window.removeEventListener('scroll', onScroll);
    }
  }

  /* The always-available way in. Not an interruption, so it is not
     gated on anything: it is in the footer on every page, and
     /drop.html links to it too. */
  function wireTriggers() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-drop-open]');
      if (!t) return;
      e.preventDefault();
      open(t.getAttribute('data-drop-open') || 'manual');
    });
  }

  // -----------------------------------------------------------------
  // Boot
  // -----------------------------------------------------------------
  ssSet(SS_PAGES, String(Number(ssGet(SS_PAGES) || 0) + 1));

  build();
  wireRoot();
  wireTriggers();
  armAuto();

  /* A small public surface, for /drop.html and for testing. */
  window.AsiorDrop = {
    open: open,
    close: close,
    bucket: bucket,
    activeCampaign: activeCampaign,
    autoEligible: autoEligible,
    emit: emit,
  };
})();
