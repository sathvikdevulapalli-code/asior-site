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

  /* ---- THE WALL LIFTS ITSELF AT THE DROP -------------------------

     The storefront is locked until the sale starts and then it is
     not, with no deploy and nobody awake at 2pm CT to flip a flag.
     Past this instant the gate is never built: the shop is revealed
     exactly as if GATE.ON were false.

     The instant defaults to the countdown's own TO, which is the
     Shopify discount's startsAt. That is deliberate -- the clock the
     visitor is watching and the moment the wall comes down are then
     the same timestamp by construction, so the gate cannot sit there
     reading 00:00:00:00 in front of a sale that has already started.
     OPEN_AT overrides it only if somebody deliberately wants them to
     differ.

     An unparseable or empty value means no automatic opening, which
     is the behaviour this had before: the gate stays up until
     GATE.ON changes. A date that will not parse must never be read
     as "open now" -- that would turn a typo into an unlocked
     storefront. */
  var openAt = (function () {
    var raw = CFG.OPEN_AT || (CFG.COUNTDOWN && CFG.COUNTDOWN.TO) || '';
    if (!raw) return NaN;
    var t = Date.parse(raw);
    return isFinite(t) ? t : NaN;
  })();

  if (isFinite(openAt) && Date.now() >= openAt) { reveal(); return; }

  var SUPPORT = CFG.SUPPORT_EMAIL || 'asiorclothing@gmail.com';

  /* Whether the list the gate joins needs a confirmation click before
     the member is really on it. Read from the config rather than
     assumed, so switching LIST_ID or flipping the list to single
     opt-in in Klaviyo changes the wording in one place. */
  var LIST_IS_DOUBLE_OPT_IN = CFG.LIST_DOUBLE_OPT_IN === true;

  var LS_OPEN = 'asior_gate_opened_at';
  var LS_EMAIL = 'asior_gate_email';
  /* Its own key, not LS_OPEN. Both get somebody past the gate, but
     only one of them means "this person gave us an address", and
     greetKnown() and any later segmenting must be able to tell them
     apart. */
  var LS_DISMISSED = 'asior_gate_dismissed';
  /* Its own key again. A staff bypass is not a signup and not a
     dismissal, and keeping them apart is what stops somebody later
     reading the storage and counting us as subscribers. */
  var LS_PASS = 'asior_gate_pass';

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
    /* Either door counts. A signup is remembered under LS_OPEN and a
       dismissal under LS_DISMISSED, and both mean this visitor has
       already answered the gate -- a screen that comes back on the
       next page after being closed is a nag, not a dismissible
       screen. They stay separate keys so a dismissal is never
       mistaken for a signup. */
    var at = Number(lsGet(LS_OPEN) || 0)
          || Number(lsGet(LS_DISMISSED) || 0)
          || Number(lsGet(LS_PASS) || 0);
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

  /* ---- the code, and the URL form of it ------------------------

     SHA-256 of what was typed against the stored hash. crypto.subtle
     is only exposed on a secure context, which the live site is; on
     plain http (a LAN preview) it is absent, so the code path is
     skipped rather than throwing -- the gate still works, there is
     just no bypass. That is the right way round: a missing crypto
     API must never open the door.

     Nothing here is security. See PASS_SHA in drop-config.js. */
  var PASS_SHA = String(CFG.PASS_SHA || '').toLowerCase();

  function sha256Hex(text) {
    try {
      if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) return null;
      return window.crypto.subtle
        .digest('SHA-256', new TextEncoder().encode(text))
        .then(function (buf) {
          return Array.prototype.map.call(new Uint8Array(buf), function (b) {
            return ('0' + b.toString(16)).slice(-2);
          }).join('');
        });
    } catch (err) {
      return null;
    }
  }

  function codeOpens(text) {
    if (!PASS_SHA || !text) return Promise.resolve(false);
    var p = sha256Hex(String(text).trim());
    if (!p) return Promise.resolve(false);
    return p.then(function (hex) { return hex === PASS_SHA; })
            .catch(function () { return false; });
  }

  function markPassed() {
    memoryOpen = true;
    lsSet(LS_PASS, String(Date.now()));
  }

  if (alwaysOpen() || opened()) { reveal(); return; }

  /* ?key=asior30 opens it and is remembered, so the parameter is
     needed once per browser rather than on every link. The gate is
     built in the meantime and taken down when the check resolves --
     the alternative is holding a blank page on an await, which is
     the one thing the watchdog exists to prevent. */
  (function () {
    var param = CFG.PASS_PARAM || 'key';
    var fromUrl = '';
    try { fromUrl = new URLSearchParams(location.search).get(param) || ''; } catch (e) {}
    if (!fromUrl) return;
    codeOpens(fromUrl).then(function (ok) {
      if (!ok) return;
      markPassed();
      /* Take the parameter off the address bar so it is not carried
         into a share, a screenshot or a referrer. */
      try {
        var u = new URL(location.href);
        u.searchParams.delete(param);
        history.replaceState(null, '', u.pathname + (u.search || '') + (u.hash || ''));
      } catch (e) {}
      if (root && root.parentNode) {
        root.parentNode.removeChild(root);
        root = null;
        document.removeEventListener('keydown', trap, true);
      }
      document.documentElement.classList.remove('asior-gated');
      reveal();
    });
  })();

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

          /* The eyebrow is gone from the screen at the founder's
             request on 2026-11-21 -- the clock already says when and
             the lede says what, so a word above the mark was a third
             thing saying neither. EYEBROW in drop-config.js is empty;
             putting a string back there renders it again. */
          (CFG.EYEBROW
            ? '<p class="gate-eyebrow g-rise" style="--in:100ms">' + esc(CFG.EYEBROW) + '</p>'
            : '') +

          /* Filled in by tellWhatIsLeft() from the live catalogue, or
             left hidden. Never written by hand. SCARCITY is false, so
             today it stays empty -- the slot stays because turning the
             flag back on has to be one flag and nothing else. */
          '<p class="gate-scarcity g-rise" id="gateScarcity" style="--in:150ms" hidden></p>' +

          '<h1 class="gate-wordmark-wrap g-rise" id="gateTitle" style="--in:200ms">' +
            '<button type="button" class="gate-wordmark" id="gateMark" ' +
                    'aria-label="Asior, members\u2019 entrance">Asior</button>' +
          '</h1>' +

          /* THE CLOCK.

             Written empty and filled by tickClock(). It is the biggest
             thing on the screen because the founder asked for the gate
             to be a countdown, and it is allowed to exist at all
             because the instant it counts to is a real scheduled
             Shopify discount rather than a number somebody picked.

             aria-hidden on the digits: a live region that rewrites
             itself every second is a screen-reader siren. The same
             fact is given once, in words, in the sr-only line beside
             it. */
          '<div class="gate-clock g-rise" id="gateClock" style="--in:300ms" hidden>' +
            /* One colon-separated line with the labels spread
               beneath it, which is the reference's clock and now
               /vip's as well. Four separate Anton blocks read as four
               numbers that happen to be adjacent; one line reads as a
               time. The digits are aria-hidden and the same fact is
               given once, in words, in the sr-only line below -- a
               live region that rewrites itself every second is a
               screen-reader siren.

               The wrapper keeps the class .gate-clock-row because
               live() removes it wholesale when the sale starts. */
            '<div class="gate-clock-row" aria-hidden="true">' +
              '<p class="gate-clock-time" id="ckTime">--:--:--:--</p>' +
              /* Digits only. The labels row came off on 2026-11-21:
                 four tracked words under the numbers made the clock
                 a table rather than a countdown, and the colons
                 already say what the groups are.

                 Nothing is lost for a screen reader -- the digits are
                 aria-hidden and #ckWords below carries the same fact
                 in words ("Opens in N days, N hours and N minutes"),
                 which it always did. */
            '</div>' +
            '<p class="sr-only" id="ckWords"></p>' +
          '</div>' +

          /* One line, and only one. What happens when the clock hits
             zero, in the fewest words that are still true. */
          (v('LEDE')
            ? '<p class="gate-blurb g-rise" style="--in:380ms">' + esc(memberLine(v('LEDE'))) + '</p>'
            : '') +

          /* THE SIGNUP. Email and a button, on one row, and nothing
             else on the first screen.

             The phone is folded behind a single line rather than
             sitting on the screen as a second box. It is still a real
             field in the DOM -- submit() reads #gatePhone and tolerates
             its absence -- and the TCPA paragraph is inside the fold,
             beside the field it is about, which is where prior express
             written consent has to be. Folding the field folds the
             paragraph with it, so neither appears without the other. */
          '<form class="gate-form g-rise" id="gateForm" novalidate style="--in:460ms">' +
            '<div class="gate-row">' +
              '<label class="sr-only" for="gateEmail">Email address</label>' +
              '<input class="field" type="email" id="gateEmail" name="email" ' +
                     'placeholder="email" autocomplete="email" spellcheck="false" required>' +
            '</div>' +
            /* The number, and its disclosure directly under it.

               Open whether or not it is required. The pairing rule
               is what matters and it is unchanged: the field and the
               TCPA paragraph are in one block, so the disclosure is
               on screen wherever the field is and neither can appear
               without the other. */
            (smsOn
              ? '<div class="gate-sms' + (SMS_REQUIRED ? ' is-required' : '') + '">' +
                  (SMS_REQUIRED
                    ? ''
                    : '<p class="gate-sms-opt">text me too</p>') +
                  '<label class="sr-only" for="gatePhone">Mobile number</label>' +
                  '<input class="field" type="tel" id="gatePhone" name="phone" ' +
                         'placeholder="' + (SMS_REQUIRED ? 'mobile number' : 'phone (optional)') + '" ' +
                         'autocomplete="tel" inputmode="tel"' +
                         (SMS_REQUIRED ? ' required' : '') + '>' +
                  '<p class="gate-consent-sms">' + esc(CFG.SMS.CONSENT || '') + '</p>' +
                '</div>'
              : '') +

            /* THE BUTTON GOES LAST, UNDER EVERY FIELD IT SUBMITS,
               whether or not the number is required.

               It used to sit on the email's row and move below only
               when the number became required -- two layouts for one
               form, and the row version was wrong even with the
               number optional: a button between two fields reads as
               belonging to the one above it, so the phone box under
               it looked like something that happens after you
               submit. One position, always. */
            '<button type="submit" id="gateBtn">' + esc(submitLabel()) + '</button>' +
          '</form>' +

          /* The personalised state. Shown instead of the form to
             somebody we already hold an address for, so a returning
             visitor is asked once and then only ever shown the clock.
             Written by build(), never guessed at. */
          '<p class="gate-known g-rise" id="gateKnown" style="--in:460ms" hidden></p>' +

          '<p class="gate-msg g-rise" id="gateMsg" role="status" aria-live="polite" ' +
             'style="--in:540ms"></p>' +

          /* ONE LINE, AND IT IS THE LAST THING THAT MAY BE CUT.

             The founder asked on 2026-11-21 for everything at the
             bottom of the gate to come off. The foot went entirely
             and the three paragraphs that used to live here are one
             sentence -- but a sentence stays, because this is the
             email marketing consent and the privacy link, on a form
             that takes an address and a phone number.

             Asked to strip it further, move it; do not delete it.
             The TCPA paragraph by the number is the other half and
             is separately required. Driven by LIST_DOUBLE_OPT_IN, so
             pointing LIST_ID at a double opt-in list puts the
             confirmation clause back in the same change. */
          '<p class="gate-fineprint g-rise" style="--in:600ms">' +
            (LIST_IS_DOUBLE_OPT_IN
              ? 'Confirm the email we send to join. '
              : '') +
            'Marketing emails, unsubscribe anytime. ' +
            '<a href="/privacy-policy.html">Privacy</a>' +
          '</p>' +

          /* THE WAY OUT. A real button, not a link styled as one, so
             it is in the tab order and announced as the control it
             is. Deliberately quiet and deliberately unmissable --
             the signup is still the thing being asked for, but
             nobody has to give an address to see the clothes.

             It says what happens next rather than "no thanks": a
             decline button makes the reader weigh a refusal, a
             destination just offers the other door. */
          (DISMISSIBLE
            ? '<button type="button" class="gate-skip" id="gateSkip">' +
                esc(CFG.DISMISS_LABEL || 'Browse the store') +
              '</button>'
            : '') +

          /* THE CODE, behind the mark. It is for us, not for the
             visitor, so there is no line on the screen advertising
             it: pressing the Asior wordmark reveals it, which is
             what the mark has always been for -- it carried the
             label "members' entrance" back when it opened the
             signup sheet, and it is a door again.

             Nothing visible replaces the old "Have a code?" summary.
             A shopper reads this screen as "join or wait" with no
             hint that there is a way round it, and the two people
             who need the box know where it is. PASS_LABEL is the
             box's accessible name now rather than a line of copy.

             Hidden rather than folded, so there is no phantom
             summary in the tab ring: trap() filters on offsetParent,
             so the field joins the Tab cycle the moment it is shown
             and is absent before that.

             Its own <form> so Enter submits it rather than the
             signup above, which would try to subscribe the code as
             an email address. */
          (PASS_SHA
            ? '<div class="gate-pass" id="gatePassBox" hidden>' +
                '<form class="gate-pass-row" id="gatePassForm" novalidate>' +
                  '<label class="sr-only" for="gatePass">' +
                    esc(CFG.PASS_LABEL || 'Access code') + '</label>' +
                  '<input class="field" type="password" id="gatePass" name="code" ' +
                         'autocomplete="off" autocapitalize="off" ' +
                         'autocorrect="off" spellcheck="false" placeholder="code">' +
                  '<button type="submit" id="gatePassBtn">Enter</button>' +
                '</form>' +
                '<p class="gate-pass-msg" id="gatePassMsg" role="status" aria-live="polite"></p>' +
              '</div>'
            : '') +

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
        /* NO FOOT. The bracket links -- instagram, tiktok, the
           support address, privacy, terms -- came off on 2026-11-21
           at the founder's request. On a screen whose one job is a
           signup, five links at the bottom were five ways to leave
           before filling the form in.

           The privacy link did not vanish with them: it moved into
           the one line of fine print under the button, which is
           where it belongs anyway -- beside the consent it governs
           rather than in a row of social links. Do not put the foot
           back to restore it. */
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

    var skip = root.querySelector('#gateSkip');
    if (skip) skip.addEventListener('click', dismiss);

    var passForm = root.querySelector('#gatePassForm');
    if (passForm) passForm.addEventListener('submit', submitPass);

    /* The mark is the way to the code box, which is the only thing
       on this screen not on this screen. Asked for on 2026-11-27,
       and it is what the mark was for originally -- it opened the
       signup sheet when the form was behind an action, and its
       accessible name has said "members' entrance" ever since.

       With no code configured it falls back to focusing the email,
       so the mark never becomes a button that does nothing. */
    var mark = root.querySelector('#gateMark');
    if (mark) {
      mark.addEventListener('click', function () {
        if (PASS_SHA && openPass()) return;
        var f = root.querySelector('#gateEmail');
        if (f) { try { f.focus(); } catch (e) {} }
      });
    }

    document.addEventListener('keydown', trap, true);
    pumpFilm();
    startClock();
    greetKnown();
    tellWhatIsLeft();
    /* Counted where the gate is actually on the screen, not where it
       was decided on -- the denominator has to mean "saw it". */
    countShown();
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

     It names the DEAD SIZES and never a ratio. An earlier version
     read "N of M sizes already gone", and a denominator advertises
     how much is still on the shelf -- the opposite of the job. A list
     of things somebody wanted and cannot have says only that things
     go.

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
      '{ products(first: 50) { edges { node { title variants(first: 40) {'
      + ' edges { node { title availableForSale } } } } } } }'
    ).then(function (data) {
      var edges = (data && data.products && data.products.edges) || [];
      var gone = [];
      for (var i = 0; i < edges.length; i++) {
        var n = edges[i].node;
        var ve = (n.variants && n.variants.edges) || [];
        for (var j = 0; j < ve.length; j++) {
          if (ve[j].node.availableForSale !== false) continue;
          var size = String(ve[j].node.title || '').trim();
          if (!size || size === 'Default Title') continue;
          /* The product name without its quote marks, then the size:
             "JAG SET L" reads as a thing somebody wanted and cannot
             have, which is the point. */
          gone.push((String(n.title || '').replace(/["']/g, '') + ' ' + size)
            .replace(/\s*\/\s*/g, ' ').trim());
        }
      }
      if (!gone.length) return;

      /* NAMES, NOT A RATIO.

         This said "N of M sizes already gone", and the founder was
         right that it was the wrong move: a denominator advertises
         how much is still sitting there. Naming the dead sizes says
         only that things go, which is the half that creates demand,
         and it never states or implies what is left. */
      /* Two, and a count. Four ran to three lines on a phone and
         dominated the top of the screen -- a list that long reads as
         inventory admin, not as scarcity. Two names and "+7 more"
         lands harder and leaves the mark the biggest thing up
         there. */
      var show = gone.slice(0, 2).join(' \u00b7 ').toLowerCase();
      if (gone.length > 2) show += ' \u00b7 +' + (gone.length - 2) + ' more';

      var el = root && root.querySelector('#gateScarcity');
      if (!el) return;
      el.textContent = 'gone: ' + show;
      el.hidden = false;
    }).catch(function () {
      /* No line. Never a guess. */
    });
  }

  /* The members' half of the offer, appended to the lede only when
     the code actually exists in Shopify. See MEMBER_OFFER in
     drop-config.js for why it is one code rather than a 10% top-up:
     nothing in this account combines, so a 10% code would replace the
     20% automatic and leave a member worse off than a stranger. */
  /* ---- the A/B bucket ------------------------------------------

     Drawn once and remembered, so nobody sees variant a on Monday and
     variant b on Tuesday -- a visitor who flips between versions is
     noise in both columns and a worse experience than either.

     A browser that refuses localStorage gets 'a' and is never
     counted. That is the same rule the overlay's rollout follows: a
     visitor who cannot be deduplicated is better left out of the
     numbers than counted wrongly in them. */
  /* THE EXPERIMENT IS OFF UNLESS THE MEMBER OFFER IS REAL, and that
     is not a detail -- it is the thing that keeps the honesty
     guarantee from having a hole in it.

     Everywhere else the rule holds by construction: the lede's member
     half, the button and the success message are all computed from
     MEMBER_OFFER, so clearing it in Shopify removes the 30% from all
     three at once. Variant b breaks that by stating the figure in a
     literal string ("30% off when you sign up"), which no config
     change can reach. Pull ASIOR30 and half of all visitors would go
     on being promised it.

     Rather than ban literals in variant copy -- a rule nobody would
     remember -- the experiment simply does not run without a live
     member offer. That is also just correct: this A/B is a question
     about how to frame the member offer, so with no member offer
     there is nothing to test and variant a, whose lede names only
     the public figure, is the right thing to show everyone.

     offer.js proves it: with MEMBER_OFFER nulled, no variant claims
     a discount anywhere on the screen. */
  function memberOfferLive() {
    var m = CFG.MEMBER_OFFER || {};
    return !!(m.PCT && m.CODE);
  }

  var AB = (CFG.AB && CFG.AB.ON && memberOfferLive()) ? CFG.AB : null;

  function bucket() {
    if (!AB) return 'a';
    var key = AB.KEY || 'asior_gate_ab';
    try {
      var seen = localStorage.getItem(key);
      if (seen === 'a' || seen === 'b') return seen;
      var pick = Math.random() < (typeof AB.SPLIT === 'number' ? AB.SPLIT : 0.5) ? 'b' : 'a';
      localStorage.setItem(key, pick);
      return pick;
    } catch (err) {
      return 'a';
    }
  }

  var VARIANT = bucket();

  /* THE DENOMINATOR. Signups per variant with no impressions per
     variant is not a result -- if a is shown twice as often it will
     "win" on volume while losing on rate. This fires once per
     SESSION, not per page, for the same reason trackArrival() does:
     22 pages of browsing is one visit, and counting page views would
     inflate the denominator and flatter the conversion rate.

     sessionStorage, not localStorage, so it is one per visit rather
     than one ever. A browser that refuses it is skipped entirely
     rather than counted on every page. */
  function countShown() {
    var k = 'asior_gate_shown';
    try {
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, '1');
    } catch (err) {
      return;
    }
    if (!A.klaviyoTrack) return;
    try { A.klaviyoTrack('Gate Shown', { variant: VARIANT, source: 'entry_gate' }); }
    catch (err) { /* a count is never worth an error state */ }
  }

  /* The variant's copy over the default's. Only the keys a variant
     actually names are replaced, so VARIANTS.a can be {} and mean
     "the config as written". */
  function v(key) {
    var set = AB && AB.VARIANTS && AB.VARIANTS[VARIANT];
    return (set && set[key] !== undefined) ? set[key] : CFG[key];
  }

  /* The automatic everybody gets with no code. TEN since
     2026-11-23: the 20% automatic was deleted and replaced by
     "Black Friday 2026 - 10% Public"
     (DiscountAutomaticNode/1578519625945, 10%, startsAt
     2026-11-27T20:00:00Z), read back the same day.

     The member line states the DIFFERENCE between this and
     MEMBER_OFFER.PCT, so this has to be the real public number or
     that difference is wrong -- with 20 left here the gate would
     have offered "extra 0%". */
  var PUBLIC_PCT = 10;

  /* The button names the member figure, so it is COMPUTED from
     MEMBER_OFFER rather than typed -- the same rule as the lede and
     the success message, and for the same reason.

     This was the second half of the same bug. Gating the A/B on a
     live member offer fixed variant b's lede, but CFG.SUBMIT still
     read "Get 30% off" as a literal, so with ASIOR30 pulled every
     visitor got a lede promising nothing and a button promising 30%.
     A config value is not safer than a variant value just because it
     is the default.

     With no live offer it falls back to CFG.SUBMIT, which says what
     the button does rather than what it is worth. */
  function submitLabel() {
    var m = CFG.MEMBER_OFFER || {};
    var fromVariant = v('SUBMIT');
    if (m.PCT && m.CODE) return 'Get ' + m.PCT + '% off';
    return fromVariant || CFG.CTA || 'Enter';
  }

  function memberLine(lede) {
    var m = CFG.MEMBER_OFFER || {};
    if (!m.PCT || !m.CODE) return lede;
    /* The founder's own wording, 2026-11-21: "20% off sitewide and
       when you sign up extra 10%".

       It is accurate as built, which is why it can be written. A
       signed-up shopper enters ASIOR30 and pays 30% rather than 20%,
       so the extra ten points are real and they are what signing up
       buys. What would be false is implying two codes that stack --
       nothing on this account combines -- and this says nothing of
       the kind. The code is not named here either; it is handed over
       in the success message, because printing it on the open screen
       would give 30% to everyone who never signs up.

       EXTRA is the difference, and it is the only place on the site
       where a difference is ever stated. It is derived from PCT
       rather than typed, so the two can never disagree and nobody
       can set MEMBER_OFFER.PCT to 10 by mistake. */
    var extra = m.PCT - PUBLIC_PCT;
    if (extra <= 0) return lede;

    /* The member framing, composed from the live figures. Ayush asked
       on 2026-11-22 that every visitor see the version leading with
       what signing up gets them, because that is what the ads
       promise. LEDE_MEMBER is a template rather than a sentence so
       the numbers in it cannot outlive the discount they describe:
       clear MEMBER_OFFER and this whole branch is skipped and the
       plain LEDE stands. */
    var tpl = v('LEDE_MEMBER') || CFG.LEDE_MEMBER;
    if (tpl) {
      return String(tpl)
        .replace('{member}', m.PCT)
        .replace('{public}', PUBLIC_PCT);
    }

    /* A variant whose lede already states the member figure says it
       once and is left alone. */
    if (lede.indexOf(m.PCT + '%') !== -1) return lede;
    return lede + ' when you sign up, extra ' + extra + '%.';
  }

  /* Whether the number is required. The founder asked for it on
     2026-11-21: the phone is how somebody gets the 30% code, so it is
     not an optional extra on this form. False restores the old folded
     optional field and nothing else needs undoing. */
  var SMS_REQUIRED = !!(CFG.SMS && CFG.SMS.ON && CFG.SMS.REQUIRED);

  /* Whether there is a way out that is not a signup. See DISMISSIBLE
     in drop-config.js for why this exists and what turning it off
     restores. */
  var DISMISSIBLE = CFG.DISMISSIBLE !== false;

  /* ---- the clock -----------------------------------------------------

     Counts to CFG.COUNTDOWN.TO, which is the Shopify discount's own
     startsAt and nothing else. Every exit here is "draw no clock":

       no config, no TO, a TO that will not parse  -> nothing
       the instant has passed and ENDS has too     -> nothing
       the instant has passed, sale still running  -> the live line

     So the gate can never show a timer to a date that does not exist,
     and it cannot go on counting after the sale, which would be the
     same lie pointing backwards. A countdown is only honest while the
     thing it counts to is real and still ahead.

     The ticker clears itself at zero rather than running forever, and
     admit() clears it too, so a gate that is dismissed leaves no
     interval behind. */
  var clockTimer = null;

  function parseWhen(v) {
    if (!v) return NaN;
    var t = Date.parse(v);
    return isFinite(t) ? t : NaN;
  }

  function two(n) { return (n < 10 ? '0' : '') + n; }

  function stopClock() {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  }

  function startClock() {
    var cfg = CFG.COUNTDOWN || {};
    var to = parseWhen(cfg.TO);
    var ends = parseWhen(cfg.ENDS);
    var box = root && root.querySelector('#gateClock');
    if (!box || !isFinite(to)) return;          /* no date: no clock */

    var row = box.querySelector('.gate-clock-row');
    var words = box.querySelector('#ckWords');
    var timeEl = box.querySelector('#ckTime');

    function live() {
      /* Past the start. If the sale has also ended, say nothing at
         all rather than announce a sale that is over. */
      stopClock();
      if (isFinite(ends) && Date.now() >= ends) { box.hidden = true; return; }
      box.classList.add('is-live');
      if (row) row.remove();
      var line = String(cfg.LIVE || 'live now');
      box.insertBefore(mk(line), box.firstChild);
      if (words) words.textContent = line;
      box.hidden = false;
    }

    function mk(text) {
      var el = document.createElement('p');
      el.className = 'gate-clock-live';
      el.textContent = text;
      return el;
    }

    function tick() {
      var left = to - Date.now();
      if (left <= 0) { live(); return; }
      var secs = Math.floor(left / 1000);
      var dd = Math.floor(secs / 86400);
      var hh = Math.floor((secs % 86400) / 3600);
      var mm = Math.floor((secs % 3600) / 60);
      var ss = secs % 60;
      if (timeEl) {
        timeEl.textContent = two(dd) + ':' + two(hh) + ':' + two(mm) + ':' + two(ss);
      }
      if (words) {
        words.textContent = 'Opens in ' + dd + ' days, ' + hh + ' hours and ' +
                            mm + ' minutes.';
      }
      box.hidden = false;
    }

    tick();
    if (!box.hidden && !box.classList.contains('is-live')) {
      clockTimer = setInterval(tick, 1000);
    }
  }

  /* ---- who this is ---------------------------------------------------

     The only personalisation the gate can honestly do. We hold one
     fact about a returning visitor -- the address they gave -- so
     somebody who has already joined is not asked a second time. They
     get the clock and a line saying they are on the list.

     It never guesses. No stored address means the form, exactly as a
     first-time visitor sees it. */
  function greetKnown() {
    var known = lsGet(LS_EMAIL);
    if (!known) return false;
    var form = root && root.querySelector('#gateForm');
    var note = root && root.querySelector('#gateKnown');
    if (!form || !note) return false;
    form.hidden = true;
    note.textContent = 'you\u2019re on the list as ' + known + '.';
    note.hidden = false;
    return true;
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

    /* NO prefers-reduced-motion GUARD HERE, AND THAT IS DELIBERATE.

       One was added on 2026-11-20 and taken out again on 2026-11-21:
       the founder reported the background was not moving for them,
       and this was why. Reduce Motion is switched on by a lot of
       people -- it is one tap in iOS accessibility settings and many
       leave it on for battery -- so the guard was silently serving a
       frozen photograph to a large share of visitors on the one
       screen whose whole design is the moving film.

       The film is the gate. Everything else on this screen is a
       clock, two fields and a button. Freezing it does not degrade
       the design, it deletes it.

       Nothing is lost in accessibility terms that matters here: the
       loop is silent, it has no flashing, it carries no information,
       and nothing on the screen depends on seeing it. The reduced
       motion rules elsewhere on the site still stand -- the gate's
       own transitions are still disabled under that query in
       site.css, and only the background loop is exempt. */

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

    /* The code box first: Escape shuts it and stops there, so a
       dismissible gate is not also closed by the same press, and a
       walled one is not closed at all. */
    if (e.key === 'Escape' && closePass()) { e.preventDefault(); return; }

    /* Escape closes the gate when there is a way out. It used to do
       nothing by design, back when the gate was a wall; with a
       dismiss control on the screen, a keyboard user has to be able
       to reach the same exit the pointer can. With DISMISSIBLE off
       it goes back to doing nothing. */
    if (e.key === 'Escape' && DISMISSIBLE) { e.preventDefault(); dismiss(); return; }
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
  /* Out without a signup. Separate from admit() on purpose: nothing
     is written to LS_OPEN or LS_EMAIL, no Klaviyo call is made and no
     signup event fires, because none of those things happened. The
     only record is that this person closed the gate, so they are not
     asked again on the next page.

     It is counted, though. A dismissal is the other half of the A/B's
     denominator -- knowing how many people the gate turns away is the
     whole point of being able to read it -- and it carries the same
     variant as the impression. */
  function dismiss() {
    stopClock();
    lsSet(LS_DISMISSED, String(Date.now()));
    memoryOpen = true;
    document.documentElement.classList.remove('asior-gated');
    if (A.klaviyoTrack) {
      try { A.klaviyoTrack('Gate Dismissed', { variant: VARIANT, source: 'entry_gate' }); }
      catch (err) { /* never hold the door shut over a count */ }
    }
    if (!root) return;
    root.classList.add('is-leaving');
    setTimeout(function () {
      if (root && root.parentNode) root.parentNode.removeChild(root);
      root = null;
      document.removeEventListener('keydown', trap, true);
    }, 320);
  }

  /* Reveal the box and put the cursor in it. Returns false when
     there is nothing to reveal, so the mark can fall back. */
  function openPass() {
    var box = root && root.querySelector('#gatePassBox');
    if (!box) return false;
    box.hidden = false;
    var f = root.querySelector('#gatePass');
    if (f) { try { f.focus(); } catch (e) {} }
    return true;
  }

  /* Escape closes the BOX and never the gate. That is the same rule
     the signup sheet followed: a dialog with no keyboard exit is a
     trap in the accessibility sense, where the gate itself is one by
     design. Somebody who opened the code box by accident has to be
     able to get back to the signup. */
  function closePass() {
    var box = root && root.querySelector('#gatePassBox');
    if (!box || box.hidden) return false;
    var f = root.querySelector('#gatePass');
    var msg = root.querySelector('#gatePassMsg');
    if (f) f.value = '';
    if (msg) msg.textContent = '';
    box.hidden = true;
    var mark = root.querySelector('#gateMark');
    if (mark) { try { mark.focus(); } catch (e) {} }
    return true;
  }

  /* The code path. Deliberately separate from admit(): no Klaviyo
     call, no email stored, no signup event, because none of that
     happened -- somebody on the team typed a password. Counting it
     as a signup would quietly inflate the only number this gate
     exists to produce. */
  function submitPass(e) {
    e.preventDefault();
    var input = root && root.querySelector('#gatePass');
    var btn = root && root.querySelector('#gatePassBtn');
    var msg = root && root.querySelector('#gatePassMsg');
    if (!input) return;
    var typed = (input.value || '').trim();
    if (!typed) { input.focus(); return; }

    if (btn) btn.disabled = true;
    if (msg) msg.textContent = '';

    codeOpens(typed).then(function (ok) {
      if (!ok) {
        if (btn) btn.disabled = false;
        if (msg) msg.textContent = 'that code does not work.';
        input.value = '';
        try { input.focus(); } catch (x) {}
        return;
      }
      markPassed();
      stopClock();
      document.documentElement.classList.remove('asior-gated');
      if (!root) return;
      root.classList.add('is-leaving');
      setTimeout(function () {
        if (root && root.parentNode) root.parentNode.removeChild(root);
        root = null;
        document.removeEventListener('keydown', trap, true);
      }, 320);
    });
  }

  function admit(email, note, hold) {
    stopClock();
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

  /* Klaviyo wants E.164 and will reject anything else, so the number
     is normalised here rather than posted as typed.

     A bare 10 digits is read as US/Canada, which is who the ads are
     running to. Anything entered with a + keeps its own country code,
     because the number is required to get through the gate now and a
     US-only rule would wall the entire site off from every
     international visitor -- and the shop ships internationally.
     Returns '' when it cannot make a plausible number, and the caller
     treats that as an error rather than sending it. */
  function e164(value) {
    var hasPlus = /^\s*\+/.test(value);
    var digits = String(value).replace(/\D/g, '');
    if (!digits) return '';

    if (hasPlus) {
      /* ITU E.164 allows up to 15 digits including the country code,
         and no real number is under 8. */
      return (digits.length >= 8 && digits.length <= 15) ? '+' + digits : '';
    }
    if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);
    /* NANP: area code and exchange both start 2-9. */
    return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits) ? '+1' + digits : '';
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

    /* ---- the number ---------------------------------------------

       Typing it is the consent act, with the TCPA paragraph on screen
       beside the field rather than behind a toggle -- which is what
       prior express written consent needs, and is why this is a field
       and not a checkbox.

       It is REQUIRED now. The gate does not open without it, because
       the number is what the 30% code is being given for. Nothing
       about purchase is conditioned on it: the checkout is on
       Shopify's own domain and is not gated, so "not a condition of
       any purchase" in the disclosure stays true. */
    var telEl = root.querySelector('#gatePhone');
    var raw = telEl ? (telEl.value || '').trim() : '';
    var phone = raw ? e164(raw) : '';

    if (SMS_REQUIRED && !raw) {
      say('a mobile number is needed for the 30% code.', 'err');
      try { telEl.focus(); } catch (x) {}
      return;
    }
    if (raw && !phone) {
      say('that number does not look right.', 'err');
      try { telEl.focus(); } catch (x) {}
      return;
    }

    busy = true;
    btn.disabled = true;
    say('one moment\u2026');

    var camp = campaign() || {};
    var listId = CFG.LIST_ID || camp.listId;

    /* ONE REQUEST, ONE LIST, BOTH CHANNELS.

       This used to be two calls to two lists: the address to the gate
       list and then, separately, the number to UiFFMg through
       klaviyoSubscribeSms. That split one person into two profiles on
       two lists with two consent records and made the audience
       impossible to send to as a whole.

       The Client API subscription endpoint takes both contact fields
       on one profile and grants MARKETING consent for whichever are
       present, so email and phone land together, on TFEDaD, as one
       profile. Both consents are real and both were given on this
       screen -- the email by pressing the button under the consent
       sentence, the number by typing it under the TCPA paragraph.

       Nothing is recorded as a signup that Klaviyo did not accept:
       the gate opens on the resolved request, never on the click. */
    var profile = { email: email };
    if (phone) profile.phone_number = phone;

    /* The variant onto the PROFILE, not just the event. An event
       property can be broken down in a report; a profile property can
       be segmented on, which is what actually lets them mail the
       winning half or compare revenue per bucket later. Both, so
       either question can be answered. */
    profile.properties = { gate_variant: VARIANT };

    var p;
    try {
      p = (listId && A.klaviyoSubscribeToList)
        ? A.klaviyoSubscribeToList(listId, profile)
        : Promise.reject(new Error('klaviyo helper or list id missing'));
    } catch (err) {
      p = Promise.reject(err);
    }

    p.then(function () {
      /* No second call. The number went up with the address in the
         one request above, on the one list. */

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
            sms_required: SMS_REQUIRED,
            variant: VARIANT,
          }, { email: email });
        } catch (x) { /* best effort */ }
      }
      if (window.fbq) {
        try { window.fbq('track', 'Lead', { content_name: 'BF drop early access' }); }
        catch (x) { /* tracking must never block a signup */ }
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
      /* Short, because the clock above says when and the line under
         it says what. This message only has to carry the one thing
         still required of them, and the hold is the time it takes to
         read that -- it was 4000ms for a sentence that repeated the
         date and the discount, which is four seconds of somebody
         staring at a wall they have already paid for with an email. */
      /* THE CODE IS GIVEN HERE, on the screen, the moment they are
         in -- not left to a Klaviyo flow to deliver.

         The button promises 30% off. A promise kept by an email that
         may be delayed, filtered or simply never built is a promise
         that quietly goes unkept, which is exactly how the old gate's
         ASIORTEN claim went wrong. Printing the code is the only
         delivery that cannot fail. It costs nothing: the gate is a
         marketing wall on public URLs and has never been security,
         so a code on it is no more exposed than one in an email.

         MEMBER_OFFER is read, not hardcoded, so if ASIOR30 is pulled
         in Shopify the key goes null and this sentence disappears
         with it rather than naming a dead code. */
      var m = CFG.MEMBER_OFFER || {};
      var line = (m.PCT && m.CODE)
        ? 'you\u2019re in \u00b7 ' + m.PCT + '% off with code ' + m.CODE
        : 'you\u2019re on the list.';
      if (LIST_IS_DOUBLE_OPT_IN) line = 'check your inbox and confirm to join.';

      admit(email, line, (m.PCT && m.CODE) ? 3200 : (LIST_IS_DOUBLE_OPT_IN ? 2600 : 900));
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
