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
   OPT-OUTS

   Meta loads by default. ads.js checks Global Privacy Control and the
   visitor's asior_ads_optout choice before loading the SDK or sending
   any event. The footer privacy link records an opt-out and reloads the
   page so the SDK is absent on the next document load.

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
  // was answered, and when. Informational; no customer identifiers belong here.
  VERIFIED: '2026-11-07: ASIOR dataset verified in Events Manager; checkout owns Purchase, custom storefront owns product/cart events',

  // Load by default, subject to GPC and the visitor's opt-out choice.
  REQUIRE_CONSENT: false,
};
