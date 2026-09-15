/* ===================================================================
   Asior — Early Access storefront gate. RETIRED — not loaded by any
   page as of the index.html/fall-collection.html redirect (see
   vercel.json). Left in place, not deleted, only because a future
   drop might want the same mechanic again.

   Was loaded synchronously in <head>, immediately after
   assets/launch-config.js, on every protected storefront page (shop,
   product, cart, fall-collection) — before any of that page's own
   content or Shopify fetches ran. A visitor who hadn't entered ASIOR8
   and wasn't past the public launch instant was sent back to the
   Early Access entry on index.html before the page ever rendered.

   That redirect target is exactly why this can't just be re-added:
   index.html now 301s straight to shop.html, which has no gate UI at
   all (that markup lived only in index.html's hero). Reactivating
   this for a future drop means rebuilding a real gate destination
   first, then re-adding the two <script> tags (this file, right after
   launch-config.js) to whichever pages need protecting again — not
   just setting a future PUBLIC_LAUNCH_TIME.

   Not security, even when active. Same caveat as the members'
   entrance it superseded for customer-facing use: this is a marketing
   gate, checked entirely in the browser, on pages that are still just
   public URLs underneath it. Its job was "don't make a regular
   visitor trip over Fall inventory before Early Access opens" — not
   "prevent access." Anyone who disables JavaScript, or simply reads
   this file, walks straight past it.

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
