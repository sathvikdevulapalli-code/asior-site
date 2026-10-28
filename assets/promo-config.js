/* ===================================================================
   Asior — promotion configuration. THE ONLY PLACE PROMOTIONS ARE SET.

   One file, so a promotion never gets scattered across HTML. Nothing
   here renders anything on its own; assets/promo.js reads this and
   decides what, if anything, to show.

   ---------------------------------------------------------------
   THE RULE THAT MATTERS

   This file describes a promotion that ALREADY EXISTS IN SHOPIFY. It
   does not create one. A discount shown here that Shopify won't honour
   at checkout is worse than no promotion at all: the customer gets to
   the payment step, the price doesn't match what the site promised,
   and they leave — having been told a price that wasn't real.

   So: ENABLED stays false until someone has confirmed the real
   discount exists in Shopify Admin, and written who confirmed it and
   when into VERIFIED. promo.js refuses to render without that.

   ---------------------------------------------------------------
   TIMEZONE

   START and END are full ISO-8601 with an explicit offset, e.g.
   '2026-09-24T14:00:00-05:00'. Never a bare '2026-09-24T14:00' — that
   parses as the *visitor's* local time, so a promotion meant to end at
   4pm Central would run until 4pm in every timezone on earth, hours
   past its real expiry, still claiming a discount Shopify has already
   stopped honouring.

   Central Time is -05:00 during CDT (mid-March to early November) and
   -06:00 during CST. September is CDT, so -05:00. Same reasoning as
   the announcement bar in scripts/build.js.

   ---------------------------------------------------------------
   TO RUN A PROMOTION

   1. Cowork/the operator creates the real discount in Shopify Admin.
   2. Fill in TYPE, START, END, HEADLINE, and the Shopify reference
      (DISCOUNT_URL for an automatic discount, or CODE for a code).
   3. Fill in VERIFIED with who checked Shopify and when.
   4. Set ENABLED: true.
   5. It expires on its own at END. Nobody has to remember to turn it
      off, and nothing needs redeploying to expire it.
   =================================================================== */

window.ASIOR_PROMO = {
  // Master switch. False = the site behaves exactly as if no promotion
  // exists, no matter what else is filled in below.
  ENABLED: false,

  // Short identifier used in analytics events so a promotion's
  // performance can be told apart from every other period.
  ID: null,               // e.g. 'free-ship-flash-2026-09-24'

  // One of: 'free_shipping' | 'percent_off' | 'threshold' | 'gift' | 'bundle'
  // promo.js only knows how to render types it has an explicit
  // renderer for, and ignores anything else rather than guessing.
  TYPE: null,

  // Absolute instants, ISO-8601 WITH offset. See TIMEZONE above.
  START: null,            // e.g. '2026-09-24T14:00:00-05:00'
  END: null,              // e.g. '2026-09-24T16:00:00-05:00'

  // Copy. Lowercase, plain, no exclamation marks — same voice as the
  // rest of the site. Keep the headline to a few words; it renders in
  // a banner that sits in the announcement bar.
  HEADLINE: null,         // e.g. 'free shipping'
  SUBHEAD: null,          // e.g. 'ends 4pm ct'

  // How the discount actually applies at Shopify. Exactly one of these
  // should be set.
  //   DISCOUNT_URL — an automatic-discount link from Shopify. Preferred:
  //     the customer never has to copy a code, and a visible code field
  //     is itself a documented abandonment cause (people leave to go
  //     hunting for a better code).
  //   CODE — only for private/creator codes that are meant to be typed.
  DISCOUNT_URL: null,
  CODE: null,

  // True when Shopify applies this automatically with no code entry.
  // Drives whether the UI says anything about a code at all.
  AUTO_APPLIED: false,

  // PUBLIC: shown to everyone.
  // Private: set PUBLIC false and set PARAM — the promotion then only
  // appears for visitors arriving with ?promo=<PARAM>, for an email or
  // SMS segment, and stays invisible to everyone else.
  PUBLIC: true,
  PARAM: null,

  // Optional scoping, for promotions that don't apply storewide. These
  // are descriptive only — Shopify decides real eligibility. They exist
  // so the copy can be accurate about what's included.
  COLLECTION: null,       // e.g. 'fall-26'
  HANDLES: null,          // e.g. ['scripture-polo', 'jag-shorts']
  MINIMUM: null,          // real spend minimum in dollars, or null

  // Who confirmed the matching discount exists in Shopify, and when.
  // promo.js will not render a promotion without this.
  VERIFIED: null,         // e.g. { by: 'Sathvik', on: '2026-09-24' }
};

/* ===================================================================
   Standing (non-promotional) commerce facts.

   Separate from the promotion above because these are always true, not
   a timed offer. Same honesty rule: only fill in what's been confirmed
   in Shopify Settings -> Shipping and delivery. Null means the site
   says nothing rather than guessing.
   =================================================================== */
window.ASIOR_SHIPPING = {
  // Free-shipping threshold in dollars, or 0 for free on every order.
  //
  // Free US shipping at $75 and over. This is real: Domestic zone,
  // method "Free shipping", $0.00, condition TOTAL_PRICE >= $75.00,
  // active. Created at $99 on 2026-10-22, lowered to $75 on 2026-10-26
  // at the founder's direction so any two pieces qualify, and read back
  // from the live delivery profile after the change.
  //
  // The rule still stands for whoever comes next: if that rate is
  // ever removed from Shopify, set this back to null AND clear
  // VERIFIED, because the pair of them is what lets the site say the
  // words "free shipping" anywhere.
  FREE_THRESHOLD: 75,

  // Fulfilment time — how long before it ships. NOT delivery time.
  FULFILMENT: '1-2 business days',

  // null ON PURPOSE. US shipping is carrier-calculated now: Shopify
  // asks USPS for a live rate at checkout and adds 15%. There is no
  // fixed cheapest rate to quote any more, so the site must not name
  // one -- a "from $4.90" line would be a price the customer cannot
  // actually get. shippingLine() falls through to "calculated at
  // checkout" when this is null.
  FROM_PRICE: null,

  // EMPTY ON PURPOSE -- changed in Shopify on 2026-10-22.
  //
  // The Domestic zone no longer prices by flat weight band. It now
  // carries a USPS carrier-calculated method (+15%, no fixed fee),
  // so the customer is charged whatever USPS quotes for their address
  // and parcel on the day, plus the margin that absorbs a USPS rate
  // rise.
  //
  // The four old flat rates are still there but renamed "(backup)"
  // and repriced well above a typical USPS quote ($10.90 / $12.90 /
  // $19.90 / $34.90). They exist so that a checkout can still
  // complete if USPS fails to return a rate -- without them, a
  // carrier outage would leave an order with no shipping option at
  // all, which blocks the sale entirely. In normal operation USPS
  // comes back cheaper and the customer takes it.
  //
  // A table of fixed prices would therefore be wrong on both counts,
  // so there is no table: shippingDetailHTML() renders none when this
  // is empty, and the line reads "calculated at checkout".
  //
  // Put rates back here ONLY if the Domestic zone goes back to flat
  // pricing, and read them out of Shopify rather than from memory.
  RATES: [],

  // International is live through Shopify Managed Markets, with
  // Global-e as merchant of record. Rates are carrier-calculated and
  // shown at checkout. Whether duties and taxes are included in that
  // total is NOT confirmed -- see INTERNATIONAL_DUTIES_INCLUDED below.
  // "US only for now" was
  // wrong and was turning away buyers the store can actually ship to.
  // REGION stays null: the shipping line names the US price without
  // claiming the US is the only destination.
  //
  // Two things the checkout asks for that the site must not soften:
  // international orders require a phone number, because the
  // cross-border carriers do, and orders to mainland China also ask
  // for a Resident ID number at the Global-e step, for customs.
  // INTERNATIONAL_COUNTRIES is the number the copy is allowed to
  // claim — if the country list changes, it changes here and nowhere
  // else.
  REGION: null,

  // Zones really are active for 244 countries, so this stays true as a
  // statement of capability. What the site is allowed to PROMISE is a
  // separate question, gated below.
  INTERNATIONAL: true,

  // Sathvik confirmed US and international shipping on 2026-10-11.
  // The site's shipping policy reflects that. Mirror it in Shopify
  // Admin so the checkout policy agrees before treating checkout as
  // fully updated.
  INTERNATIONAL_STANCE_CONFIRMED: true,
  // The exact destination count changes with Shopify's delivery zones;
  // don't publish a country count here.
  INTERNATIONAL_COUNTRIES: null,
  /* false since 2026-10-11. Asked whether he had completed an
     international checkout that showed duties included in the total,
     Sathvik said no, and the matching sentence came out of
     shipping-policy.html for that reason. internationalLine() renders
     nothing today either way, because INTERNATIONAL_COUNTRIES is null
     and it returns early without one -- but leaving this true left the
     same unverified claim armed, ready to ship the moment a country
     count was filled in. Flip it back once a real international order
     has been seen landing with nothing to pay on delivery. */
  INTERNATIONAL_DUTIES_INCLUDED: false,
  INTERNATIONAL_PHONE_REQUIRED: true,
  INTERNATIONAL_CHINA_RESIDENT_ID: true,

  // Confirmed against the live Shopify delivery profile, not from
  // memory: the free-shipping method was created and then read back
  // out of the Domestic zone on this date.
  VERIFIED: { by: 'read from Shopify delivery profile', on: '2026-10-26' },

  /* ---------------------------------------------------------------
     RETURNS. Published on the storefront on 2026-10-11. Fit, order,
     damage, and other issues are reviewed by email case by case.
     Replacements are usually the first solution; refunds can be
     discussed and arranged by email. Shopify Admin policy sync is
     still pending. */
  RETURNS_POLICY_PUBLISHED: true,
  RETURNS_WINDOW_DAYS: null,
};

/* ===================================================================
   Shopify storefront analytics.

   This storefront is served from Vercel on its own domain, so Shopify
   never injects its own pixel here: Web Pixels and Customer Events
   only run on surfaces Shopify renders (the Online Store theme and
   checkout). That is why Shopify currently sees checkout traffic and
   nothing else, and why configuring a pixel in Admin would not close
   the gap. assets/shopify-analytics.js sends the beacons directly
   instead.

   Both ids were pulled from Shopify by the operator and are constants
   — nothing is fetched at build time. SHOP_ID is the numeric part of
   gid://shopify/Shop/75144954073. STOREFRONT_ID is the "Asior Website"
   headless storefront (created Jul 19), which is what attributes these
   events to this storefront rather than the theme.

   Neither is a secret: both ship in the page and identify the shop to
   Shopify's own collector, exactly as the theme's pixel does.

   Set ENABLED to false to switch every beacon off without touching
   any other file. */
window.ASIOR_ANALYTICS = {
  ENABLED: true,
  SHOP_ID: 75144954073,
  STOREFRONT_ID: '311682',

  /* Consent gate.

     Shopify's Customer Privacy API is loaded by Shopify's own consent
     script, which — for the same reason as the pixel — cannot load on
     this domain. So window.Shopify.customerPrivacy is expected to be
     absent here, and requiring it would mean the module never fires at
     all.

     The rule this implements: if the API IS present and says analytics
     processing is not allowed, send nothing. If it is absent, there is
     no consent framework on this domain to withhold a grant, and the
     beacons send. Flip REQUIRE_CONSENT_API to true to invert that and
     send only when the API is present and grants consent — which today
     means sending nothing. */
  REQUIRE_CONSENT_API: false,
};

/* ===================================================================
   PER-PRODUCT CARD CROP

   Product cards fill a 2:3 frame with object-fit: cover, so a photo
   that is not 2:3 is trimmed. This map moves the crop for a product
   whose subject is not in the middle of the frame -- a flat-lay shot
   from above, or a group shot where cover would cut a face.

   Key: the Shopify product handle, exactly as it appears in
   data-handle on the card. Value: any CSS object-position, e.g.
   '50% 30%' to favour the top of the frame.

   EMPTY ON PURPOSE. Every lead image in the catalogue was measured on
   2026-10-11 and all ten are portrait, 0.56 to 0.75 against the
   frame's 0.667, so the centre crop is already right for all of them
   and no entry would be doing anything. Add one only after looking at
   the card and seeing the crop go wrong -- a value guessed without
   seeing the photograph is worse than the default.
   =================================================================== */
/* ===================================================================
   WHICH SHOPIFY IMAGE LEADS A GRID TILE

   By default a card shows Shopify's featured image, or the first real
   photograph when that one is a generated render. That is usually
   right, and where it is not, the fix belongs in Shopify's own media
   order -- this map is the override for when it cannot be.

   Key: the product handle. Value: a substring of the image filename to
   prefer, or a zero-based index into the product's images. The first
   image whose URL contains the substring wins; a generated render is
   never chosen, whatever this says.

   EMPTY ON PURPOSE. Every lead was checked against the live catalogue
   on 2026-10-28 and the ones that can be real photographs already are:
   the Polo, Holes Tee, both shorts, JAG Sweats, Ja-yu, Kova and the
   Lanyard all lead with shoot or product photography. Kova's Firefly
   render is demoted automatically by isGeneratedImage().

   JAG Set got a real photograph on 2026-10-28 and is named below.
   JAG Crewneck still has only a hash-named PNG render (1024x1536):
   it needs its own photo uploaded in Shopify.
   =================================================================== */
window.ASIOR_CARD_IMAGE = {
  // Real photo uploaded to Shopify 2026-10-28 (Ayush's crewneck + sweats
  // shot). Leads the grid instead of the hash-named PNG render.
  'jag-set-1': 'jag-set-crewneck-sweats',
};

window.ASIOR_CARD_FOCUS = {
  // 'some-handle': '50% 30%',
};

/* ===================================================================
   Standing offers that Shopify applies on its own, with no code.

   MULTI_BUY is a real automatic discount: "Any 2 pieces 15% off",
   gid://shopify/DiscountAutomaticNode/1570203828441, 15% off the whole
   order at a minimum quantity of 2, created 2026-10-26 at the founder's
   direction. It does not combine with ASIORTEN or any other product or
   order discount, so the site never implies the two stack. If that
   discount is ended in Shopify, set MULTI_BUY to null and every mention
   on the site disappears.
   =================================================================== */
window.ASIOR_OFFERS = {
  MULTI_BUY: {
    MIN_QTY: 2,
    PERCENT: 15,
    VERIFIED: { by: 'created and read back in Shopify Admin', on: '2026-10-26' },
  },
};
