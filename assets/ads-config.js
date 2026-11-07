/* ===================================================================
   Asior — advertising pixel configuration.

   THE ONLY PLACE AD PIXELS ARE TURNED ON. Nothing here loads anything
   on its own; assets/ads.js reads this and decides.

   ---------------------------------------------------------------
   WHY THIS EXISTS

   This storefront is served from Vercel on its own domain. Shopify
   only injects its pixels on surfaces Shopify renders itself — the
   Online Store theme and checkout — so installing Meta's or TikTok's
   Shopify app does NOT instrument these pages. Everything before the
   checkout handoff (landing, product views, add to cart) is invisible
   to an ad platform unless it is sent from here.

   That matters for spend: an ad platform optimising on Purchase alone,
   with no upper-funnel signal, has almost nothing to learn from and
   almost no way to attribute.

   ---------------------------------------------------------------
   THE DEDUPLICATION RULE THAT MATTERS

   assets/ads.js fires ONLY the events this storefront owns:

       PageView, ViewContent, AddToCart, InitiateCheckout

   It deliberately never fires Purchase. Purchase happens on Shopify's
   checkout, which Shopify's own Meta/TikTok app already instruments.
   Sending it from here as well would double-count every order and
   inflate reported ROAS — the single most expensive reporting mistake
   available here, because it makes a losing campaign look like a
   winner.

   Before enabling, confirm in Shopify Admin which pixel the Meta
   channel is already firing and on which events. If it also fires
   AddToCart on a surface these pages reach, turn that one off on ONE
   side — not both, and not neither.

   ---------------------------------------------------------------
   CONSENT

   ads.js presents an optional advertising choice with equal accept
   and reject controls and an Ad preferences link in the footer.
   REQUIRE_CONSENT stays true. No advertising SDK loads before an
   affirmative choice; browser Global Privacy Control overrides that
   choice. The stored choice expires after 180 days and contains no
   customer identity or cart details.

   ---------------------------------------------------------------
   TO TURN A PIXEL ON

   1. Get the real pixel/dataset id from the ad platform.
   2. Confirm the deduplication question above.
   3. Decide the consent question above.
   4. Fill in the id, write who checked and when into VERIFIED, and
      set ENABLED: true.
   =================================================================== */

window.ASIOR_ADS = {
  // Master switch. False = no pixel script is loaded and no event is
  // sent, whatever else is filled in below.
  ENABLED: true,

  // Meta (Facebook/Instagram) pixel id, digits only. Null = off.
  META_PIXEL_ID: '1736325884098392',

  // TikTok pixel id. Null = off.
  TIKTOK_PIXEL_ID: null,

  // Who confirmed the id is real, that the deduplication question above
  // was answered, and when. ads.js refuses to run without this, the
  // same way promo-config refuses to render an unverified promotion.
  VERIFIED: '2026-11-07: ASIOR dataset verified in Events Manager; checkout owns Purchase, custom storefront owns product/cart events; explicit opt-in required',

  // Gate every send behind window.ASIOR_CONSENT === true.
  // Leave true until the consent question is actually decided.
  REQUIRE_CONSENT: true,
};
