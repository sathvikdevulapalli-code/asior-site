/* ===================================================================
   Asior — launch/campaign single source of truth.

   Loaded before anything else decides what to show (see the <head>
   of index.html and the top of fall-collection.html), so every page
   reads the same facts instead of each keeping its own copy that can
   drift. Activating the Fall Collection for real is meant to be a
   change to exactly this file: fill in each FALL_PRODUCTS entry's
   handle as Shopify/Klaviyo confirms it, then flip FALL_COMMERCE_READY
   to true once all of them are real — nothing else should need to
   change. assets/fall-grid.js (the shared renderer used by both
   index.html's post-Early-Access state and fall-collection.html) reads
   both of these and nothing else decides what a visitor sees.

   Plain global assignment, not an IIFE returning an API: this has to
   run and be readable synchronously by an inline <head> script before
   paint, the same way the A/B bucket is decided, so there's nothing to
   await and nothing worth hiding behind a function call.
   =================================================================== */
window.ASIOR_LAUNCH = {
  // Thursday, September 10, 2026, 7:00 PM CT. -05:00 is Central Daylight
  // Time, which is what Chicago is on this date (DST doesn't end until
  // November) — see the comment on the countdown in index.html for what
  // changes if this date ever moves outside CDT.
  PUBLIC_LAUNCH_TIME: '2026-09-10T19:00:00-05:00',

  // Set only by a verified Shopify/Klaviyo handoff — never guessed here.
  // False means: don't present Fall as purchasable, whatever the clock
  // or FALL_PRODUCTS says. This is the master switch on top of
  // FALL_PRODUCTS's handles: it should only flip to true once EVERY
  // intended piece below has a real, verified handle with real price,
  // variants, and inventory — not as each one trickles in. Belt and
  // suspenders against a handle being added without the rest being
  // ready, and against the clock (see index.html's data-campaign) ever
  // being mistaken for readiness.
  FALL_COMMERCE_READY: false,

  // The Fall drop, in launch order. `name` is real — these are the 7
  // pieces the founder has said are coming. `handle` is null until
  // Shopify/Klaviyo hands off the verified Shopify handle for that
  // piece; assets/fall-grid.js renders an honest placeholder card
  // ("price coming", no image) for any entry with handle: null, and a
  // real Shopify-backed card once it's filled in. Reorder this array to
  // change launch order — nothing else reads a separate order.
  FALL_PRODUCTS: [
    { name: 'Asior Polo', handle: null },
    { name: 'JAG Shorts', handle: null },
    { name: 'Holes Tee', handle: null },
    { name: 'Asior Shorts', handle: null },
    { name: 'JAG Grey Sweats', handle: null },
    { name: 'Golf Polo', handle: null },
    { name: 'Realestate / White Realtor Polo', handle: null },
  ],

  // SHA-256 of the Early Access website code, uppercased before hashing
  // (see index.html's early-access gate) — never the plaintext code
  // itself, so it doesn't sit in view-source. This is a marketing gate,
  // not security: the store pages are public URLs regardless. To change
  // the code, replace this with the SHA-256 of the new one, uppercased:
  //     printf 'NEWCODE' | shasum -a 256
  EARLY_ACCESS_CODE_SHA: '619b5fd9238b418e3d33b6c478a99a4b285cfaee7c1b9c4eb7b74ae3f49f9e0e',
};
