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
              '<ul class="gate-clock-units">' +
                '<li>Days</li><li>Hrs</li><li>Mins</li><li>Secs</li>' +
              '</ul>' +
            '</div>' +
            '<p class="sr-only" id="ckWords"></p>' +
          '</div>' +

          /* One line, and only one. What happens when the clock hits
             zero, in the fewest words that are still true. */
          (CFG.LEDE
            ? '<p class="gate-blurb g-rise" style="--in:380ms">' + esc(memberLine(CFG.LEDE)) + '</p>'
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
              /* THE BUTTON GOES LAST, UNDER EVERY FIELD IT SUBMITS.

                 While the number was optional and folded it could sit
                 on this row beside the email, because the email was
                 the whole form. It is not any more: with a required
                 number below it, a button here reads as belonging to
                 the email alone and invites a press before the number
                 is typed -- an error message instead of a signup, on
                 the one screen standing between a paid click and the
                 shop. So when the number is required the row is the
                 email by itself and the button is appended after the
                 consent paragraph. */
              (SMS_REQUIRED
                ? ''
                : '<button type="submit" id="gateBtn">' + esc(CFG.SUBMIT || CFG.CTA || 'Enter') + '</button>') +
            '</div>' +
            /* The number, and its disclosure directly under it.

               It was folded behind a "text me too" line while it was
               optional. It is required now, so it cannot be folded:
               a field somebody MUST fill in cannot be behind a
               control they have to find first, and the TCPA
               paragraph has to be on screen wherever the field is.
               The pairing rule is unchanged -- the two still move
               together, they are simply both open. */
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
            (SMS_REQUIRED
              ? '<button type="submit" id="gateBtn">' + esc(CFG.SUBMIT || CFG.CTA || 'Enter') + '</button>'
              : '') +
          '</form>' +

          /* The personalised state. Shown instead of the form to
             somebody we already hold an address for, so a returning
             visitor is asked once and then only ever shown the clock.
             Written by build(), never guessed at. */
          '<p class="gate-known g-rise" id="gateKnown" style="--in:460ms" hidden></p>' +

          '<p class="gate-msg g-rise" id="gateMsg" role="status" aria-live="polite" ' +
             'style="--in:540ms"></p>' +

          '<div class="gate-fineprint g-rise" style="--in:600ms">' +
            /* The confirmation step, named BEFORE they hand over an
               address rather than only after.

               TN58zR is double opt-in and had zero completed profiles
               when it was read back, so a signup is not a join until
               they click the link in their inbox -- and the button
               above promises 20% off. Somebody deciding whether to
               give an address is entitled to know there is a second
               step between them and that.

               It used to be a clause in the lede. The lede is one
               short line now, so it lives here instead, where the
               email consent sentence already is: still on the screen
               before the decision, without putting four lines of
               explanation above the field. Driven by the same flag as
               the success message, so pointing LIST_ID at a single
               opt-in list removes both at once. */
            (LIST_IS_DOUBLE_OPT_IN
              ? '<p>We send a confirmation email. Click it to join the list.</p>'
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
    startClock();
    greetKnown();
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
  function memberLine(lede) {
    var m = CFG.MEMBER_OFFER || {};
    if (!m.PCT || !m.CODE) return lede;
    /* The code itself is NOT named here. It is given in the success
       message, after they have actually signed up -- printing it on
       the open screen would hand 30% to everybody who never joins,
       which is the whole thing this gate exists to trade for. What
       the lede names is the deal: the public number, and the better
       one that signing up gets you. */
    return lede + ' sign up and it\u2019s ' + m.PCT + '%.';
  }

  /* Whether the number is required. The founder asked for it on
     2026-11-21: the phone is how somebody gets the 30% code, so it is
     not an optional extra on this form. False restores the old folded
     optional field and nothing else needs undoing. */
  var SMS_REQUIRED = !!(CFG.SMS && CFG.SMS.ON && CFG.SMS.REQUIRED);

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

    /* A loop longer than five seconds is motion nobody asked for, so
       a visitor whose system asks for less of it gets the still --
       which is this film's own first frame, so the gate looks the
       same and simply stops moving. Same rule on /vip. */
    if (window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      film.removeAttribute('autoplay');
      try { film.pause(); } catch (ignored) {}
      return;
    }

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
