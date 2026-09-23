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
   DROP_CLOSE_TIME in launch-config.js.

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
  // a banner that sits next to the drop countdown.
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
  // null = THERE IS NO FREE SHIPPING. Free shipping was removed at
  // checkout on Sep 21, 2026. It ran for roughly three days and is
  // gone. Nothing on the site may claim it while this is null, and
  // VERIFIED below is null too so the gate is shut from both sides.
  // Do not set either back without confirming the rate actually
  // exists in Shopify Settings -> Shipping and delivery first.
  FREE_THRESHOLD: null,

  // Fulfilment time — how long before it ships. NOT delivery time.
  FULFILMENT: '1-2 business days',

  // Cheapest real rate a US customer can pay, used for the "from $X"
  // line. This is the US Economy rate below.
  FROM_PRICE: 4.90,

  // The real rate card, for a shipping detail section. Transit times
  // stay attached to the rate they belong to — quoting the 3-4 day
  // Standard speed next to the $4.90 Economy price would advertise a
  // combination the customer cannot actually buy.
  RATES: [
    { zone: 'US', label: 'Economy (0-5 lb)', price: 4.90, transit: '5-8 business days' },
    { zone: 'US', label: 'Standard (0-1 lb)', price: 6.90, transit: '3-4 business days' },
    { zone: 'US', label: 'Standard (1-5 lb)', price: 9.90, transit: '3-4 business days' },
  ],

  // International is live through Shopify Managed Markets, with
  // Global-e as merchant of record. Rates are carrier-calculated and
  // shown at checkout with duties and taxes included in the total, so
  // there is nothing to collect on delivery. "US only for now" was
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
  INTERNATIONAL: true,
  INTERNATIONAL_COUNTRIES: 28,
  INTERNATIONAL_DUTIES_INCLUDED: true,
  INTERNATIONAL_PHONE_REQUIRED: true,
  INTERNATIONAL_CHINA_RESIDENT_ID: true,

  // Null = nothing about free shipping may render. See FREE_THRESHOLD.
  VERIFIED: null,
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
