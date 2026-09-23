/* ===================================================================
   Asior — drop-close countdown.

   One place that turns window.ASIOR_LAUNCH.DROP_CLOSE_TIME (see
   assets/launch-config.js) into "time left" text. The sitewide banner
   (scripts/build.js's HEADER_FULL), product.html's buy box, and
   index.html's post-Early-Access section all call this — so all three
   can never show two different numbers, and moving the close date is
   a one-file change (launch-config.js), not a hunt through every page
   that mentions it.

   Ticks once a minute, not once a second: this renders in a banner
   visible on every page for the whole session, not a one-time hero
   moment (that's what index.html's own pre-launch countdown is for) —
   a second-by-second reflow sitewide is cost with no real benefit.

   Fails quiet on purpose: no target date, or no element to render
   into, and this does nothing rather than throwing on a page that
   hasn't loaded launch-config.js.
   =================================================================== */
(function () {
  'use strict';

  function closeTime() {
    var iso = window.ASIOR_LAUNCH && window.ASIOR_LAUNCH.DROP_CLOSE_TIME;
    return iso ? new Date(iso).getTime() : null;
  }

  function format(msLeft) {
    var totalMin = Math.floor(msLeft / 60000);
    var days = Math.floor(totalMin / 1440);
    var hours = Math.floor(totalMin / 60) % 24;
    var mins = totalMin % 60;
    if (days > 0) return days + 'd ' + hours + 'h left';
    if (hours > 0) return hours + 'h ' + mins + 'm left';
    return Math.max(mins, 0) + 'm left';
  }

  /* opts: { el, prefix, suffix, closedText, onClose }
     el:         element whose textContent this owns.
     prefix:     text before the countdown, e.g. 'fall drop closes — '.
     suffix:     optional text appended after the countdown, e.g. a
                 verified 'free shipping on every order'. This function
                 owns el.textContent outright and rewrites it on every
                 tick, so anything else written there would be erased
                 within 30 seconds — passing it through here is the only
                 way for the bar to carry two facts at once.
     closedText: shown once the instant passes (default 'fall drop closed').
     onClose:    optional callback, fired once, when it passes. */
  function renderDropCountdown(opts) {
    var target = closeTime();
    if (!target || !opts || !opts.el) return null;

    var tail = opts.suffix ? ' · ' + opts.suffix : '';

    var timer = null;
    function tick() {
      var left = target - Date.now();
      if (left <= 0) {
        // The drop is over, but a standing shipping offer isn't tied to
        // it — keep the suffix so the bar doesn't go from useful to
        // just "closed".
        opts.el.textContent = (opts.closedText || 'fall drop closed') + tail;
        if (opts.onClose) opts.onClose();
        if (timer) clearInterval(timer);
        return;
      }
      opts.el.textContent = (opts.prefix || '') + format(left) + tail;
    }
    tick();
    timer = setInterval(tick, 30000);
    return timer;
  }

  window.Asior = window.Asior || {};
  window.Asior.renderDropCountdown = renderDropCountdown;
})();
