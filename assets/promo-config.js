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
  // Real free-shipping threshold in dollars, or 0 when free shipping
  // applies to every order with no minimum, or null when unconfirmed.
  // null is the safe default: the cart shows no progress messaging at
  // all rather than counting a shopper toward a threshold that may not
  // be the real one.
  //
  // 0 = the "Free Shipping" rate in Shopify Settings -> Shipping and
  // delivery, minimum $0.00, price $0.00, applies to all orders.
  FREE_THRESHOLD: 0,

  // Fulfilment time — how long before it ships. NOT delivery time.
  FULFILMENT: '1-2 business days',

  // Transit estimate for the cheapest tier, once confirmed. Kept
  // distinct from FULFILMENT on purpose: "ships in 1-2 business days"
  // and "arrives in 5-8" are different promises, and collapsing them
  // into one number is how a site ends up implying 2-day delivery it
  // never offered. Free shipping is the 5-8 day economy tier; the
  // paid 3-4 day options are NOT the free one, so the free-shipping
  // copy must never borrow their speed.
  TRANSIT: '5-8 business days',

  // Faster paid tiers, for the shipping detail section only. Never
  // used in the free-shipping headline.
  PAID_OPTIONS: [
    { label: 'Standard (0-1 lb)', price: 6.90, transit: '3-4 business days' },
    { label: 'Standard (1-5 lb)', price: 9.90, transit: '3-4 business days' },
  ],

  // US-only for now. Stated wherever shipping is promised, because a
  // non-US visitor finding out at checkout is a wasted journey.
  REGION: 'US only for now',

  VERIFIED: { by: 'owner — Shopify Settings > Shipping and delivery', on: '2026-09-19' },
};
