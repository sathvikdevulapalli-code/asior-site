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

  var SUPPORT = CFG.SUPPORT_EMAIL || 'asiorclothing@gmail.com';

  /* Whether the list the gate joins needs a confirmation click before
     the member is really on it. Read from the config rather than
     assumed, so switching LIST_ID or flipping the list to single
     opt-in in Klaviyo changes the wording in one place. */
  var LIST_IS_DOUBLE_OPT_IN = CFG.LIST_DOUBLE_OPT_IN === true;

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

  /* ---- the screen ---------------------------------------------------

     The shape of the original drop gate: a line saying when, the mark,
     one solid action, a quiet second action, and a bracket link. The
     form is NOT on this screen -- it is behind the action, in a sheet,
     which is what keeps the gate a picture with a name on it rather
     than a login page over a photograph. */
  function build() {
    var camp = campaign() || {};
    var smsOn = CFG.SMS && CFG.SMS.ON === true;

    root = document.createElement('div');
    root.className = 'gate-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'gateTitle');

    root.innerHTML =
      '<div class="gate-still" aria-hidden="true"></div>' +
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

          /* Filled in by tellWhatIsLeft() from the live catalogue, or
             left hidden. Never written by hand. */
          '<p class="gate-scarcity g-rise" id="gateScarcity" style="--in:180ms" hidden></p>' +

          /* The mark is a button: it opens the same sheet. Unmarked on
             purpose -- it looks like the wordmark and nothing else --
             but a real button rather than a click handler on a
             heading, so it is reachable from a keyboard. */
          '<h1 class="gate-wordmark-wrap g-rise" id="gateTitle" style="--in:260ms">' +
            '<button type="button" class="gate-wordmark" id="gateMark" ' +
                    'aria-label="Asior, members’ entrance">Asior</button>' +
          '</h1>' +

          /* The description. It was lost when the sheet went away and
             the sheet's lede went with it -- this screen is now the
             only screen, so the one thing the gate has to explain
             belongs on it. */
          (CFG.LEDE
            ? '<p class="gate-blurb g-rise" style="--in:360ms">' + esc(CFG.LEDE) + '</p>'
            : '') +

          /* THE FORM IS ON THE SCREEN, not behind a button.

             It was behind the CTA, which is how the original worked,
             and the founder asked for the clicks taken out: a
             first-time visitor should see the boxes and type, not
             press a thing to be shown a thing to press. Both fields
             are here, the description is here, and the lookbook is a
             strip below rather than another overlay. One screen, one
             action. */
          '<form class="gate-form g-rise" id="gateForm" novalidate style="--in:420ms">' +
            '<label class="sr-only" for="gateEmail">Email address</label>' +
            '<input class="field" type="email" id="gateEmail" name="email" ' +
                   'placeholder="email" autocomplete="email" spellcheck="false" required>' +
            (smsOn
              ? '<label class="sr-only" for="gatePhone">Phone number (optional)</label>' +
                '<input class="field" type="tel" id="gatePhone" name="phone" ' +
                       'placeholder="phone (optional)" autocomplete="tel" inputmode="tel">'
              : '') +
            '<button type="submit" id="gateBtn">' + esc(CFG.CTA || 'Enter') + '</button>' +
            '<p class="gate-cta-sub">' + esc(CFG.CTA_SUB || '') + '</p>' +
          '</form>' +

          '<p class="gate-msg g-rise" id="gateMsg" role="status" aria-live="polite" ' +
             'style="--in:520ms"></p>' +

          /* The consent copy, on the screen beside the field it is
             about, which is where prior express written consent has
             to be. Collapsed behind a details element so it is not a
             wall of small print above the fold, but open-able without
             leaving the gate and present in the DOM for a reader. */
          '<div class="gate-fineprint g-rise" style="--in:580ms">' +
            (smsOn
              ? '<details><summary>sms terms</summary><p>' + esc(CFG.SMS.CONSENT || '') +
                ' See our <a href="/privacy-policy.html">Privacy Policy</a> and ' +
                '<a href="/terms-of-service.html">Terms of Service</a>.</p></details>'
              : '') +
            '<p>By signing up, you agree to receive occasional marketing emails. ' +
              'Unsubscribe anytime.</p>' +
          '</div>' +

        '</div>' +

        /* THE LOOKBOOK IS ON THE SCREEN TOO, as a strip you can swipe,
           not a bracket that opens an overlay. The clothes are the
           reason anybody is here and they were two taps away. Real
           frames from the real shoot, lazy-loaded, and nothing in it
           is a link because there is nowhere to go from behind a
           gate. */
        (CFG.LOOKBOOK && CFG.LOOKBOOK.length
          ? '<div class="gate-look g-rise" style="--in:660ms">' +
              '<p class="gate-look-label">the collection</p>' +
              '<div class="gate-strip" tabindex="0" role="region" aria-label="Lookbook">' +
                CFG.LOOKBOOK.map(function (sh) {
                  return '<div class="gate-shot"><img src="' + esc(sh.src) + '" alt="' +
                         esc(sh.alt) + '" loading="lazy" decoding="async"></div>';
                }).join('') +
              '</div>' +
            '</div>'
          : '') +

        /* Follow was a button that opened a sheet of two links. With
           the form on the screen the sheet was orphaned -- the button
           went with the actions block -- and two links do not need a
           dialog. They are links in the foot now, which is one tap
           instead of two and no dead markup. */
        '<div class="gate-foot g-rise" style="--in:760ms">' +
          '<span class="gate-foot-left">' +
            ((CFG.FOLLOW && CFG.FOLLOW.ON ? (CFG.FOLLOW.LINKS || []) : []).map(function (l) {
              return '<a href="' + esc(l.href) + '" target="_blank" rel="noopener">' +
                     '<b>[</b> ' + esc(l.label) + ' <b>]</b></a>';
            }).join('')) +
          '</span>' +
          '<span class="gate-foot-right">' +
            '<a href="mailto:' + esc(SUPPORT) + '">' + esc(SUPPORT) + '</a>' +
            '<a href="/privacy-policy.html"><b>[</b> privacy <b>]</b></a>' +
            '<a href="/terms-of-service.html"><b>[</b> terms <b>]</b></a>' +
          '</span>' +
        '</div>' +
      '</main>' +

      /* ---- the signup sheet ------------------------------------

         Email and, separately and optionally, a phone number. The
         TCPA paragraph is visible at the point of collection rather
         than behind a toggle, which is what 47 CFR 64.1200(f)
         requires of prior express written consent -- including the
         clause most brands miss, that consent is not a condition of
         purchase. Entering a number is the consent act; leaving it
         blank subscribes nothing and still opens the gate. */
    document.body.appendChild(root);
    document.documentElement.classList.add('asior-gated');
    reveal();

    root.querySelector('#gateForm').addEventListener('submit', submit);

    /* The mark no longer opens anything -- the form is already on
       screen -- so it focuses the field instead. Still a button, so
       it is still reachable from a keyboard, and a tap on the big
       obvious thing does something useful rather than nothing. */
    var mark = root.querySelector('#gateMark');
    if (mark) {
      mark.addEventListener('click', function () {
        var f = root.querySelector('#gateEmail');
        if (f) { try { f.focus(); } catch (e) {} }
      });
    }

    document.addEventListener('keydown', trap, true);
    pumpFilm();
    tellWhatIsLeft();
  }

  /* ---- what is actually left ----------------------------------------

     The founder asked for the gate to be framed as a huge restock
     after selling out. Shopify said otherwise on 2026-11-14: 11 of 11
     products active and buyable, 89 units, nothing sold out and
     nothing restocked. A sellout-and-restock line would have been a
     false inventory claim on a live storefront, which is the thing
     CLAUDE.md bans outright and the FTC treats as deceptive.

     What IS true is scarcity at the size level, and it is good: 9 of
     30 variants were already gone and 3 more were down to one unit.
     So the line is computed from the live catalogue rather than
     written, which means it is urgent, it is specific, and it cannot
     drift into a lie as stock moves.

     availableForSale, never quantity. The Asior Lanyard sits at -5
     and is still buyable, so a quantity rule would call a sellable
     product sold out -- the same trap CLAUDE.md documents for badges.

     Everything here fails silent and runs AFTER the gate has painted:
     no line is always better than a wrong one, and the wall must not
     wait on a request. */
  function tellWhatIsLeft() {
    var A2 = window.Asior || {};
    if (!A2.shopifyFetch || !CFG.SCARCITY) return;

    A2.shopifyFetch(
      '{ products(first: 50) { edges { node { availableForSale variants(first: 40) {'
      + ' edges { node { availableForSale } } } } } } }'
    ).then(function (data) {
      var edges = (data && data.products && data.products.edges) || [];
      var total = 0, gone = 0;
      for (var i = 0; i < edges.length; i++) {
        var ve = (edges[i].node.variants && edges[i].node.variants.edges) || [];
        for (var j = 0; j < ve.length; j++) {
          total++;
          if (ve[j].node.availableForSale === false) gone++;
        }
      }
      /* Nothing to boast about, so say nothing. A "0 of 30 gone" line
         is an anti-advert. */
      if (!total || !gone) return;
      var el = root && root.querySelector('#gateScarcity');
      if (!el) return;
      el.textContent = gone + ' of ' + total + ' sizes already gone';
      el.hidden = false;
    }).catch(function () {
      /* No line. Never a guess. */
    });
  }

  /* ---- the film ----------------------------------------------------

     Three outcomes, and the gate is presentable in all three:

       it plays         -> the <video> fades in over the still
       autoplay refused -> the still stays, and the gate is a photograph
       cannot decode    -> the same

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

  /* Focus stays inside. Tab cycles the gate's own controls, so the
     screen is fully operable from a keyboard; Escape does nothing,
     because the gate has no escape by design and there are no longer
     any sheets over it that would need one. */
  function trap(e) {
    if (!root) return;

    /* Escape is deliberately not wired at all now. There are no
       sheets left to dismiss -- everything is on the one screen --
       and the gate itself has no escape by design. */
    if (e.key !== 'Tab') return;

    var scope = root;
    var f = [].slice.call(scope.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(function (el) { return el.offsetParent !== null; });
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

  /* `hold` is how long the message stays up before the gate leaves.

     It used to be 320ms for everything, which was fine while the
     message only said "you're in" -- nobody needs to read that. It is
     not fine now: on a double opt-in list the message carries the one
     action still required of them, and a line that is on screen for a
     third of a second has not been communicated, it has been
     technically displayed. Anything asking something of the reader
     gets long enough to read it. */
  function admit(email, note, hold) {
    markOpened(email);
    say(note || 'you\u2019re in.', 'ok');
    document.documentElement.classList.remove('asior-gated');
    if (!root) return;
    setTimeout(function () {
      if (!root) return;
      root.classList.add('is-leaving');
      setTimeout(function () {
        if (root && root.parentNode) root.parentNode.removeChild(root);
        root = null;
        document.removeEventListener('keydown', trap, true);
      }, 320);
    }, hold || 0);
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

       A number is optional and typing one is the consent act, with
       the TCPA paragraph visible beside the field rather than behind
       a toggle -- which is what prior express written consent needs,
       and is why this is a field rather than a checkbox.

       The number is NEVER derived from the email signup: it is its
       own value, its own request and its own list, and an email on
       its own subscribes no phone number. Leaving it blank is not an
       error, it is just no SMS. */
    var telEl = root.querySelector('#gatePhone');
    var phone = telEl ? (telEl.value || '').trim() : '';
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
      /* "you're in" is true of the SITE and not of the list, and the
         difference matters here.

         Fall Early Access (TN58zR) is a DOUBLE OPT-IN list: checked
         2026-11-14, opt_in_process double_opt_in, profile_count 0 in
         the two months since it was made. A subscription through the
         Client API leaves somebody PENDING and Klaviyo sends them a
         confirmation email; they do not join the list, and the Early
         Access flow that carries ASIORTEN does not fire, until they
         click it. Telling them they are on the list when they are one
         unclicked email short of it is how a promise quietly goes
         unkept, and the zero says that is exactly what has been
         happening.

         So the gate opens either way, because they gave a real
         address and the request succeeded, and the message names the
         one thing they still have to do. */
      admit(email, LIST_IS_DOUBLE_OPT_IN
        ? 'you\u2019re in. check your inbox and confirm to get the code.'
        : (phone ? 'you\u2019re in. check your phone too.' : 'you\u2019re in.'),
        LIST_IS_DOUBLE_OPT_IN ? 2400 : 0);
    }).catch(function (err) {
      /* See "THE THREE WAYS THIS COULD TAKE THE WHOLE STORE DOWN" at
         the top. They gave a real address and the request genuinely
         failed; holding the door shut now loses the sale and the
         signup both. */
      if (CFG.FAIL_OPEN_ON_ERROR !== false) {
        try { console.warn('[asior gate] signup failed, admitting anyway:', err && err.message); } catch (x) {}
        admit(email, 'you\u2019re in. we could not save your email just now.', 2400);
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
