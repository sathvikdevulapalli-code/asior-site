/* ===================================================================
   Asior — launch/campaign single source of truth.

   Loaded before anything else decides what to show (see the <head>
   of index.html and the top of fall-collection.html), so every page
   reads the same facts instead of each keeping its own copy that can
   drift. Activating a piece of the Fall Collection for real is meant
   to be a change to exactly this file: fill in that FALL_PRODUCTS
   entry's handle as Shopify/Klaviyo confirms it — nothing else should
   need to change. assets/fall-grid.js (the shared renderer used by
   both index.html's post-Early-Access state and fall-collection.html)
   reads this and nothing else decides what a visitor sees.

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

  // Whether the full intended Fall launch (all of FALL_PRODUCTS) is
  // verified and complete — not whether any individual piece is
  // purchasable. Those are deliberately different questions: a
  // FALL_PRODUCTS entry with a real handle is always shown as a real,
  // buyable card by assets/fall-grid.js regardless of this flag,
  // because Shopify already says it's real. This flag instead controls
  // collection-wide claims: the live-drop eyebrow ("the fall collection
  // is live" vs "almost here" in index.html) and fall-collection.html's
  // search-indexing decision.
  //
  // TRUE as of this pass: all four intended pieces (Asior Polo, JAG
  // Shorts, Holes Tee, Asior Shorts) have real, founder-verified
  // Shopify handles and are confirmed ACTIVE — the condition this flag
  // exists to gate. Set back to false immediately if any of the four is
  // pulled, or if a fifth piece is added and isn't yet verified.
  FALL_COMMERCE_READY: true,

  // The Fall drop — EXACTLY these four, in launch order. `name` is the
  // customer-facing display name, used instead of whatever Shopify's
  // internal product title says (assets/fall-grid.js and product.html
  // both override the title with this) — Shopify's own title for the
  // polo is an internal/manufacturing name, not what a customer should
  // see. `handle` is the real Shopify handle for every one of the four;
  // assets/fall-grid.js fetches each directly by handle and renders
  // real title, price, compare-at, images, variants, availability, and
  // (where Shopify exposes it) inventory-based stock messaging — nothing
  // hardcoded here. Reorder this array to change launch order; nothing
  // else reads a separate order.
  //
  // Explicitly excluded, not just unmapped: JAG Grey Sweats, Golf Polo,
  // Realestate / White Realtor Polo. Those are manufacturing pieces for
  // other brands, not Fall Collection products — do not add them back to
  // this array, even as placeholders, without the founder saying so
  // again. jaguar-sweats (JAG Sweats) is a separate restock, handled
  // entirely by jag-sweats.html — it is not part of this array and
  // should not be.
  FALL_PRODUCTS: [
    { name: 'Asior Polo', handle: 'scripture-polo' },
    { name: 'JAG Shorts', handle: 'jag-shorts' },
    { name: 'Holes Tee', handle: 'holes-tee' },
    { name: 'Asior Shorts', handle: 'asr-shorts' },
  ],

  // SHA-256 of the Early Access website code, uppercased before hashing
  // (see index.html's early-access gate) — never the plaintext code
  // itself, so it doesn't sit in view-source. This is a marketing gate,
  // not security: the store pages are public URLs regardless. To change
  // the code, replace this with the SHA-256 of the new one, uppercased:
  //     printf 'NEWCODE' | shasum -a 256
  EARLY_ACCESS_CODE_SHA: '619b5fd9238b418e3d33b6c478a99a4b285cfaee7c1b9c4eb7b74ae3f49f9e0e',
};
