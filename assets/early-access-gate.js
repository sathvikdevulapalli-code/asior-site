/* ===================================================================
   Asior — Early Access storefront gate.

   Loaded synchronously in <head>, immediately after assets/launch-config.js,
   on every protected storefront page (shop, product, cart,
   fall-collection) — before any of that page's own content or Shopify
   fetches run. A visitor who hasn't entered ASIOR8 and isn't past the
   public launch instant is sent back to the Early Access entry on
   index.html before this page ever renders, not flashed-then-redirected.

   Not security. Same caveat as the members' entrance it supersedes for
   customer-facing use: this is a marketing gate, checked entirely in
   the browser, on pages that are still just public URLs underneath it.
   Its actual job is "don't make a regular visitor trip over Fall
   inventory before Early Access opens" — not "prevent access". Anyone
   who disables JavaScript, or simply reads this file, walks straight
   past it, same as the members' entrance always could be.

   Fails open on purpose: if launch-config.js didn't load for some
   reason, this does nothing rather than stranding every visitor on a
   broken redirect.
   =================================================================== */
(function () {
  if (!window.ASIOR_LAUNCH) return;

  // Public drop has passed: the storefront is open to everyone, no code
  // needed. Same instant the homepage's data-campaign switch uses.
  var liveAt = new Date(window.ASIOR_LAUNCH.PUBLIC_LAUNCH_TIME).getTime();
  if (Date.now() >= liveAt) return;

  // Same flag the homepage's Early Access gate writes on a correct
  // ASIOR8 entry — read back here so access, once granted, persists
  // across every protected page without re-entering the code.
  var granted = false;
  try { granted = localStorage.getItem('asior_early_access') === '1'; } catch (err) { /* storage blocked: treat as not granted */ }
  if (granted) return;

  location.replace('index.html#earlyAccess');
})();
