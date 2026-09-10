/* ===================================================================
   Asior — launch/campaign single source of truth.

   Loaded before anything else decides what to show (see the <head>
   of index.html and the top of fall-collection.html), so every page
   reads the same facts instead of each keeping its own copy that can
   drift. Activating the Fall Collection for real is meant to be a
   change to exactly this file: flip FALL_COMMERCE_READY to true and
   fill in FALL_COLLECTION_HANDLES once Shopify/Klaviyo hands off the
   real product handles — nothing else should need to change.

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
  // or FALL_COLLECTION_HANDLES says. Both this flag AND a non-empty
  // FALL_COLLECTION_HANDLES are required before fall-collection.html
  // will show real products — belt and suspenders, so a handles list
  // added without also flipping this can't accidentally go live, and
  // vice versa.
  FALL_COMMERCE_READY: false,

  // Real Shopify product handles for the Fall Collection. Empty until
  // Shopify/Klaviyo verifies them — see fall-collection.html, which
  // shows an honest "not live yet" state and stays noindexed while this
  // is empty.
  FALL_COLLECTION_HANDLES: [],

  // SHA-256 of the Early Access website code, uppercased before hashing
  // (see index.html's early-access gate) — never the plaintext code
  // itself, so it doesn't sit in view-source. This is a marketing gate,
  // not security: the store pages are public URLs regardless. To change
  // the code, replace this with the SHA-256 of the new one, uppercased:
  //     printf 'NEWCODE' | shasum -a 256
  EARLY_ACCESS_CODE_SHA: '619b5fd9238b418e3d33b6c478a99a4b285cfaee7c1b9c4eb7b74ae3f49f9e0e',
};
