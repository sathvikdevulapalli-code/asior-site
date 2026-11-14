/* ===================================================================
   ASIOR — THE ENTRY GATE. This one really does block the store.

   Read this before changing anything here, because it is the one
   piece of this repo that can cost every sale on the site.

   ---------------------------------------------------------------
   WHAT IT IS, AND WHY IT CONTRADICTS WHAT IS WRITTEN ELSEWHERE

   DROP ACCESS (assets/drop-access.js) is a dismissible overlay. It is
   deliberately not a wall, and CLAUDE.md said for weeks that no
   configuration of it could put one in front of the catalogue.

   This file is a second, separate thing, and it IS a wall. The
   founder asked for it on 2026-11-14, in those words, after being
   told plainly that it reverses their own earlier instruction ("do
   not password-protect the entire live storefront") and that it stops
   new visitors buying Fall stock while the $50 free-shipping and
   2-piece offers are running to clear that stock. They chose the hard
   gate anyway, and chose email signup as the only way through. That
   is the decision; this is the implementation.

   It is a separate file from drop-access.js on purpose. The overlay
   is a marketing surface that must never block a sale; the gate is a
   wall by definition. Keeping them in one file would have meant one
   flag away from turning the overlay into a wall by accident.

   ---------------------------------------------------------------
   IT IS NOT SECURITY, AND NOBODY SHOULD BE TOLD IT IS

   This check happens in a browser, on pages that are plain public
   URLs underneath it. Turning off JavaScript walks past it. So does
   `curl`. So does reading this file. Google crawls and indexes every
   product page exactly as before, and the Shopify checkout lives on
   Shopify's domain where this cannot reach at all.

   What it does do is make a first-time human visitor join the list
   before they see the clothes. That is a marketing gate, and it is
   worth exactly what a marketing gate is worth. Do not describe it to
   anyone as protection.

   ---------------------------------------------------------------
   THE THREE WAYS THIS COULD TAKE THE WHOLE STORE DOWN

   A wall that fails closed is an outage. Each of these is guarded:

   1. THE SCRIPT BREAKS. The gate hides the page by putting a class on
      <html> before the storefront paints. If this file then throws,
      that class is never removed and every visitor sees a blank page
      forever. So the inline bootstrap in HEAD_SHARED arms a watchdog
      that tears the class off after GATE_WATCHDOG_MS no matter what,
      and this file clears it the moment the gate is actually on
      screen. A broken gate shows the shop. It never shows nothing.

   2. KLAVIYO IS DOWN. Email is the only way through, so an outage at
      Klaviyo is an outage at Asior. FAIL_OPEN_ON_ERROR admits a
      visitor whose submission genuinely failed to reach Klaviyo --
      after they typed a real address and after the attempt really
      failed, not instead of asking. It is not a loophole a visitor
      can find; it is a fuse. Set it false and a Klaviyo outage closes
      the shop.

   3. THE LEGAL PAGES. ALWAYS_OPEN keeps the privacy policy, terms,
      refund and shipping policies reachable. A privacy policy behind
      an email-capture wall is self-defeating, and Shopify's checkout
      footer links to these pages from a domain this gate cannot
      reach. Empty that list and those links break for people who are
      mid-checkout.

   ---------------------------------------------------------------
   TURNING IT OFF

   One flag: GATE.ON in assets/drop-config.js. False and this file
   returns immediately, the bootstrap never hides anything, and the
   site is exactly what it was. No other edit, no other file.
   =================================================================== */
(function () {
  'use strict';

  var CFG = (window.ASIOR_DROP && window.ASIOR_DROP.GATE) || null;
  var A = window.Asior || {};

  /* The bootstrap in <head> hid the page. Whatever happens from here,
     including an exception on the next line, this has to come off. */
  function reveal() {
    try {
      document.documentElement.classList.remove('asior-gate-pending');
    } catch (e) { /* nothing left to try */ }
  }

  if (!CFG || CFG.ON !== true) { reveal(); return; }

  var LS_OPEN = 'asior_gate_opened_at';
  var LS_EMAIL = 'asior_gate_email';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }

  /* ---- who is already through ------------------------------------

     A browser that refuses storage cannot remember an unlock, so it
     would be asked again on every single page. That is a worse
     experience than the gate is worth, and it is the configuration
     most likely to make somebody give up mid-purchase. Such a browser
     is gated once per session instead, in memory. */
  var memoryOpen = false;

  function opened() {
    if (memoryOpen) return true;
    var at = Number(lsGet(LS_OPEN) || 0);
    if (!at) return false;
    var days = typeof CFG.REMEMBER_DAYS === 'number' ? CFG.REMEMBER_DAYS : 365;
    if (Date.now() - at > days * 864e5) return false;
    return true;
  }

  function markOpened(email) {
    memoryOpen = true;
    lsSet(LS_OPEN, String(Date.now()));
    if (email) lsSet(LS_EMAIL, email);
  }

  /* ---- where it never stands ------------------------------------- */
  function alwaysOpen() {
    var path = (location.pathname || '/').toLowerCase().replace(/\.html$/, '');
    var list = CFG.ALWAYS_OPEN || [];
    for (var i = 0; i < list.length; i++) {
      if (path.indexOf(String(list[i]).toLowerCase()) === 0) return true;
    }
    return false;
  }

  if (alwaysOpen() || opened()) { reveal(); return; }

  // -----------------------------------------------------------------
  // The gate itself
  // -----------------------------------------------------------------
  var root = null;
  var busy = false;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* The campaign supplies the photograph and the words, so a new drop
     changes this screen without touching this file. Nothing here
     states a date, a price or a product -- there is nothing true to
     say about the next drop except its name. */
  function campaign() {
    var list = (window.ASIOR_DROP && window.ASIOR_DROP.CAMPAIGNS) || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].active) return list[i];
    return null;
  }

  function build() {
    var camp = campaign() || {};
    var hero = camp.hero ? String(camp.hero) : '';
    if (hero && !/^(https?:)?\/\//.test(hero) && hero.charAt(0) !== '/') hero = '/' + hero;

    root = document.createElement('div');
    root.className = 'gate-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'gateTitle');
    root.innerHTML =
      '<div class="gate-shade" aria-hidden="true">' +
        (hero ? '<img src="' + esc(hero) + '" alt="" decoding="async" fetchpriority="high">' : '') +
      '</div>' +
      '<div class="gate-panel">' +
        '<div class="gate-mark">ASIOR</div>' +
        '<h1 class="gate-title" id="gateTitle">' + esc(CFG.HEADLINE || 'Members only.') + '</h1>' +
        '<p class="gate-blurb">' + esc(CFG.BLURB || '') + '</p>' +
        '<form class="gate-form" novalidate>' +
          '<label class="sr-only" for="gateEmail">Email address</label>' +
          '<input class="field" type="email" id="gateEmail" name="email" placeholder="Email address" ' +
                 'autocomplete="email" spellcheck="false" required>' +
          '<button type="submit" id="gateBtn">' + esc(CFG.CTA || 'Enter') + '</button>' +
        '</form>' +
        '<p class="gate-msg" id="gateMsg" role="status" aria-live="polite"></p>' +
        /* The same list and the same real marketing consent as the
           footer signup, so it carries the footer's sentence word for
           word -- CLAUDE.md requires that of every form that joins
           this list, and a gate is no exception. */
        '<p class="gate-consent">By signing up, you agree to receive occasional marketing emails. ' +
          'Unsubscribe anytime.</p>' +
      '</div>';

    document.body.appendChild(root);
    document.documentElement.classList.add('asior-gated');
    reveal();

    root.querySelector('.gate-form').addEventListener('submit', submit);
    document.addEventListener('keydown', trap, true);
    setTimeout(function () {
      var f = root.querySelector('#gateEmail');
      if (f) { try { f.focus(); } catch (e) {} }
    }, 60);
  }

  /* Focus stays inside. Escape is deliberately not wired: this is a
     gate, and the founder asked for one that does not let people
     through. Tab still cycles, so it is operable by keyboard. */
  function trap(e) {
    if (!root) return;
    if (e.key !== 'Tab') return;
    var f = root.querySelectorAll('input, button, a[href]');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function say(text, kind) {
    var el = root && root.querySelector('#gateMsg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'gate-msg' + (kind ? ' is-' + kind : '');
  }

  function admit(email, note) {
    markOpened(email);
    say(note || 'You’re in.', 'ok');
    document.documentElement.classList.remove('asior-gated');
    if (root) {
      root.classList.add('is-leaving');
      setTimeout(function () {
        if (root && root.parentNode) root.parentNode.removeChild(root);
        root = null;
        document.removeEventListener('keydown', trap, true);
      }, 320);
    }
  }

  function submit(e) {
    e.preventDefault();
    if (busy) return;
    var input = root.querySelector('#gateEmail');
    var btn = root.querySelector('#gateBtn');
    var email = (input.value || '').trim();

    /* A real address, checked before anything is sent. The gate is
       pointless if "a" opens it, and a bounced address is worse than
       no address. */
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      say('That email does not look right.', 'err');
      try { input.focus(); } catch (x) {}
      return;
    }

    busy = true;
    btn.disabled = true;
    say('One moment…');

    var camp = campaign() || {};
    var listId = CFG.LIST_ID || camp.listId;

    /* The real subscription, to a list whose flow is live. Nothing is
       recorded as a signup that Klaviyo did not accept -- the gate
       opens on the resolved request, never on the click. */
    var p;
    try {
      p = (listId && A.klaviyoSubscribeToList)
        ? A.klaviyoSubscribeToList(listId, { email: email })
        : Promise.reject(new Error('klaviyo helper or list id missing'));
    } catch (err) {
      p = Promise.reject(err);
    }

    p.then(function () {
      /* Tracking is a separate, best-effort call: the subscription is
         what matters, and klaviyoTrack swallows its own failures, so
         a tracking blip must never hold the door shut on somebody who
         is already on the list. */
      if (A.klaviyoTrack) {
        try {
          A.klaviyoTrack('Gate Unlocked', {
            campaign: camp.slug || '',
            source: 'entry_gate',
          }, { email: email });
        } catch (x) { /* best effort */ }
      }
      admit(email, 'You’re on the list. Welcome in.');
    }).catch(function (err) {
      /* See "THE THREE WAYS THIS COULD TAKE THE WHOLE STORE DOWN" at
         the top. They gave a real address and the request genuinely
         failed; holding the door shut now loses the sale and the
         signup both. */
      if (CFG.FAIL_OPEN_ON_ERROR !== false) {
        try { console.warn('[asior gate] signup failed, admitting anyway:', err && err.message); } catch (x) {}
        admit(email, 'You’re in. We could not save your email just now. Try the footer signup.');
        return;
      }
      busy = false;
      btn.disabled = false;
      say('That did not go through. Try again in a moment.', 'err');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }

  /* Last resort. If build() threw before it could reveal the page,
     the inline watchdog in <head> is the backstop -- but this one is
     cheaper and fires sooner. */
  setTimeout(reveal, 3000);

  window.AsiorGate = {
    isOpen: function () { return !!root; },
    opened: opened,
    /* For a founder who has locked themselves out while testing:
       AsiorGate.reset() in the console puts the gate back. */
    reset: function () {
      try { localStorage.removeItem(LS_OPEN); localStorage.removeItem(LS_EMAIL); } catch (e) {}
      memoryOpen = false;
      location.reload();
    },
  };
})();
