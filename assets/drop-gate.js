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

    root = document.createElement('div');
    root.className = 'gate-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'gateTitle');

    var smsOn = CFG.SMS && CFG.SMS.ON === true;

    root.innerHTML =
      /* The still is first and always painted: it covers the moment
         before the film decodes, and if the film never plays it is
         simply what the gate is. */
      '<div class="gate-still" aria-hidden="true"></div>' +

      /* Painted into only when the browser refuses to play the film
         outright. See pumpFilm() below. */
      '<canvas class="gate-film" id="gateCanvas" aria-hidden="true" hidden></canvas>' +

      /* Both formats, MP4 first, each with an explicit codec string.

         Order matters: a browser commits to the first source it
         believes it can play and never reconsiders. Listing VP9/WebM
         first is what once put this film behind a play button on Mac
         and iOS -- Safari's WebM support is partial, it claimed the
         file and then would not start it.

         MP4 alone is not safe either. Firefox on Windows takes H.264
         from the OS rather than bundling it, so a Windows install
         without the media feature pack has nothing to play. WebM is
         bundled with Firefox everywhere and covers exactly that gap.

         The codecs= strings are what make the fallback work: the
         browser decides from the type rather than by trying, so a
         precise string lets a browser without H.264 skip the MP4
         honestly. Left as bare video/mp4 it may claim it and fail.

         No poster attribute and no controls, so there is nothing for
         iOS to decorate with its own play button. */
      '<video class="gate-film" id="gateFilm" autoplay muted loop playsinline ' +
             'preload="auto" disablepictureinpicture disableremoteplayback ' +
             'aria-hidden="true" tabindex="-1">' +
        '<source src="/video/gate.mp4" type=\'video/mp4; codecs="avc1.4D401E"\'>' +
        '<source src="/video/gate.webm" type=\'video/webm; codecs="vp9"\'>' +
      '</video>' +
      '<div class="gate-grade" aria-hidden="true"></div>' +

      '<main class="gate-main">' +
        '<div class="gate-core">' +

          (CFG.EYEBROW
            ? '<p class="gate-eyebrow g-rise" style="--in:120ms">' + esc(CFG.EYEBROW) + '</p>'
            : '') +

          '<h1 class="gate-wordmark g-rise" id="gateTitle" style="--in:260ms">Asior</h1>' +

          (CFG.BLURB
            ? '<p class="gate-blurb g-rise" style="--in:400ms">' + esc(CFG.BLURB) + '</p>'
            : '') +

          '<form class="gate-form g-rise" style="--in:520ms" novalidate>' +
            '<label class="sr-only" for="gateEmail">Email address</label>' +
            '<input class="field" type="email" id="gateEmail" name="email" ' +
                   'placeholder="Email address" autocomplete="email" ' +
                   'spellcheck="false" required>' +

            (smsOn
              ? '<div class="gate-sms">' +
                  /* Unticked, and it stays unticked unless the person
                     ticks it. An email address is not consent to be
                     texted; this is the only thing that is. */
                  '<label class="gate-sms-opt">' +
                    '<input type="checkbox" id="gateSmsOpt">' +
                    '<span>' + esc(CFG.SMS.OPT_LABEL ||
                      'Text me too. Recurring marketing texts, msg & data rates may apply, reply STOP to opt out.') +
                    '</span>' +
                  '</label>' +
                  '<div class="gate-sms-field" id="gateSmsField" hidden>' +
                    '<label class="sr-only" for="gatePhone">Mobile number</label>' +
                    '<input class="field" type="tel" id="gatePhone" name="phone" ' +
                           'placeholder="Mobile number" autocomplete="tel" ' +
                           'inputmode="tel" spellcheck="false">' +
                  '</div>' +
                '</div>'
              : '') +

            '<button type="submit" id="gateBtn">' + esc(CFG.CTA || 'Enter') + '</button>' +
          '</form>' +

          '<p class="gate-msg g-rise" id="gateMsg" role="status" aria-live="polite" style="--in:600ms"></p>' +

          /* The footer's consent sentence, word for word, because this
             joins the same list on the same marketing consent. */
          '<p class="gate-consent g-rise" style="--in:660ms">' +
            'By signing up, you agree to receive occasional marketing emails. ' +
            'Unsubscribe anytime.' +
          '</p>' +

        '</div>' +

        '<div class="gate-foot g-rise" style="--in:780ms">' +
          '<a href="mailto:' + esc(CFG.SUPPORT_EMAIL || 'asiorclothing@gmail.com') + '">' +
            esc(CFG.SUPPORT_EMAIL || 'asiorclothing@gmail.com') + '</a>' +
          '<span class="gate-foot-right">' +
            '<a href="/privacy-policy.html"><b>[</b> privacy <b>]</b></a>' +
            '<a href="/terms-of-service.html"><b>[</b> terms <b>]</b></a>' +
          '</span>' +
        '</div>' +
      '</main>';

    document.body.appendChild(root);
    document.documentElement.classList.add('asior-gated');
    reveal();

    root.querySelector('.gate-form').addEventListener('submit', submit);

    /* The number field only exists once the box is ticked, so an
       unticked gate is two controls rather than four. */
    var optIn = root.querySelector('#gateSmsOpt');
    if (optIn) {
      optIn.addEventListener('change', function () {
        var field = root.querySelector('#gateSmsField');
        if (!field) return;
        field.hidden = !optIn.checked;
        if (optIn.checked) {
          var tel = root.querySelector('#gatePhone');
          if (tel) { try { tel.focus(); } catch (e) {} }
        }
      });
    }

    document.addEventListener('keydown', trap, true);
    pumpFilm();
    setTimeout(function () {
      var f = root.querySelector('#gateEmail');
      if (f) { try { f.focus(); } catch (e) {} }
    }, 60);
  }

  /* ---- the film ----------------------------------------------------

     Three outcomes, and the gate is presentable in all three:

       it plays        -> the <video> fades in over the still
       autoplay refused-> the still stays, and the gate is a photograph
       cannot decode   -> same, unless the browser will decode frames
                          into a canvas, which some will when they will
                          not composite a video element

     Nothing here can throw into the caller: a film is decoration, and
     decoration must never be what keeps someone out of a shop. */
  function pumpFilm() {
    var film = root && root.querySelector('#gateFilm');
    if (!film) return;

    film.addEventListener('playing', function () {
      film.classList.add('is-playing');
    });

    var go = film.play();
    if (go && typeof go.catch === 'function') {
      go.catch(function () {
        /* Refused. Low Power Mode and Safari's per-site Never
           Auto-Play both land here. The still is already up, so there
           is nothing to do and nothing to apologise for -- above all,
           no play button, which is the control this gate must not
           have. */
      });
    }
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
      say('that email does not look right.', 'err');
      try { input.focus(); } catch (x) {}
      return;
    }

    /* ---- the SMS half ------------------------------------------

       Only if the box is ticked, and only with a number. Ticking it
       and leaving the field blank is not consent to anything, so it
       is treated as not ticked rather than as an error -- the person
       is trying to get into a shop, not fill in a form.

       The number is NEVER derived from the email signup. It is its
       own request, to its own list, after its own checkbox, which is
       the rule in CLAUDE.md and the reason is that an email address
       is not permission to text somebody. */
    var optIn = root.querySelector('#gateSmsOpt');
    var telEl = root.querySelector('#gatePhone');
    var phone = (optIn && optIn.checked && telEl) ? (telEl.value || '').trim() : '';
    if (phone && !/^[0-9+().\-\s]{7,}$/.test(phone)) {
      say('that number does not look right.', 'err');
      try { telEl.focus(); } catch (x) {}
      return;
    }

    busy = true;
    btn.disabled = true;
    say('one moment\u2026');

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
      /* The text subscription rides after the email one and cannot
         hold the door: somebody who gave a valid address is in
         whether or not the SMS call succeeds. A failed text signup
         is a missed subscriber; a gate that will not open over one
         is a missed sale. */
      if (phone && A.klaviyoSubscribeSms) {
        try {
          A.klaviyoSubscribeSms(phone, 'entry_gate').catch(function (err) {
            try { console.warn('[asior gate] sms subscribe failed:', err && err.message); } catch (x) {}
          });
        } catch (x) { /* best effort */ }
      }

      /* Tracking is a separate, best-effort call: the subscription is
         what matters, and klaviyoTrack swallows its own failures, so
         a tracking blip must never hold the door shut on somebody who
         is already on the list. */
      if (A.klaviyoTrack) {
        try {
          A.klaviyoTrack('Gate Unlocked', {
            campaign: camp.slug || '',
            source: 'entry_gate',
            sms_opt_in: !!phone,
          }, { email: email });
        } catch (x) { /* best effort */ }
      }
      admit(email, phone ? 'you\u2019re in. check your phone too.' : 'you\u2019re in.');
    }).catch(function (err) {
      /* See "THE THREE WAYS THIS COULD TAKE THE WHOLE STORE DOWN" at
         the top. They gave a real address and the request genuinely
         failed; holding the door shut now loses the sale and the
         signup both. */
      if (CFG.FAIL_OPEN_ON_ERROR !== false) {
        try { console.warn('[asior gate] signup failed, admitting anyway:', err && err.message); } catch (x) {}
        admit(email, 'you\u2019re in. we could not save your email just now.');
        return;
      }
      busy = false;
      btn.disabled = false;
      say('that did not go through. try again in a moment.', 'err');
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
