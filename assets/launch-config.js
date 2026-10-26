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
  // again. jaguar-sweats (JAG Sweats) is a separate restock with its
  // own generated PDP at /products/jaguar-sweats.html — it is not part
  // of this array and should not be, so it stays off the shop grid.
  /* ---- storefront categories -------------------------------------

     The nav the reference spec calls for: TOPS / BOTTOMS /
     ACCESSORIES, plus MANUFACTURING in the slot their BEST SELLERS
     occupies. Each becomes /collections/<slug>.html at build time.

     These are NOT Shopify collections. Shopify's own collections are
     brand lines (JAG, Ja-Yu, Fall Collection) plus two empty defaults
     from a new store -- there is no Tops or Bottoms there. The
     membership below is the founder's own mapping, given with the
     reference spec, so it is recorded data and not a taxonomy this
     repo invented. A handle that stops being Active in Shopify simply
     drops out of its category at build time.

     BEST SELLERS is deliberately absent: the spec says to use it only
     if the founder confirms which pieces actually sell best, and
     nobody has, so the homepage row is titled THE LINEUP instead and
     shows everything. Ordering a grid by invented sales data is the
     same class of mistake as an invented stock count.

     JAG Set sits in both Tops and Bottoms: it is a crewneck and sweats
     sold together, so it is genuinely both, and the spec left the call
     here ("it's both, your call"). */
  CATEGORIES: [
    { slug: 'tops', name: 'Tops', handles: [
      'scripture-polo', 'holes-tee', 'ja-yu-blossom-tee',
      'kova-eternal-lotus-graphic-t-shirt', 'jaguar-crewneck', 'jag-set-1',
    ] },
    { slug: 'bottoms', name: 'Bottoms', handles: [
      'jag-shorts', 'asr-shorts', 'jaguar-sweats', 'jag-set-1',
    ] },
    { slug: 'accessories', name: 'Accessories', handles: [
      'helia-pendant', 'jag-lanyard',
    ] },
  ],

  /* ---- Shopify's own collections -------------------------------

     These are the collections that exist in Shopify Admin, kept
     reachable at their REAL handles so any link already pointing at
     /collections/jag or /collections/fall-collection keeps working.
     They are brand lines, not garment categories, which is why the
     nav above is a separate editorial set rather than a rename of
     these -- renaming or dropping a live collection handle breaks
     inbound links and is not this repo's call to make.

     Membership is resolved from Shopify at build time, not listed
     here: these are real collections and Shopify is the source of
     truth for what is in them.

     Excluded on purpose: `frontpage` and `other-example-products`,
     the two empty defaults every new Shopify store ships with.
     Generating pages for them would publish two permanently empty
     URLs into the sitemap. */
  SHOPIFY_COLLECTIONS: [
    { slug: 'jag', name: 'JAG' },
    { slug: 'fall-collection', name: 'Fall Collection' },
    { slug: 'all-of-our-products', name: 'New Arrivals' },
    { slug: 'ja-yu-collection', name: 'Ja-Yu Collection' },
  ],

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

  // Handles whose Shopify compare-at price has actually been checked
  // against a price this store really charged. EMPTY MEANS SHOW NONE,
  // and that is the correct state until someone verifies them.
  //
  // Shopify's compare_at_price is a free-text field. A value in it is
  // not evidence of a former price: it can be left over from an import,
  // typed as an aspiration, or copied from a supplier sheet. The site
  // was rendering every one of them as "Was $40" with a strikethrough,
  // which is a factual claim about this shop's own pricing history and
  // the kind of claim the FTC's pricing guidance is about. Five
  // renderers did it independently -- site.js's cards, fall-grid.js,
  // the PDP, lanyard.html, and build.js's server-rendered cards -- so
  // a handle has to clear this list to be struck through anywhere.
  //
  // To turn one on: confirm the product was genuinely offered at the
  // compare-at price for a meaningful period, then add its handle.
  /* ---- NEW badge ------------------------------------------------

     Handles the founder wants badged NEW, one drop at a time. EMPTY
     BY DEFAULT and empty means no badge anywhere.

     This is a list rather than a date rule because there is no date
     that works: every Active product's createdAt predates
     PUBLIC_LAUNCH_TIME (the newest is 2026-08-30 against a 2026-09-10
     launch), so a "created inside the drop window" rule would badge
     nothing, and publishedAt would badge pieces that are months old.
     The founder knows what is new; the data does not.

     Add handles here when a drop lands, clear it when it stops being
     new. Anything not in this array gets no badge. */
  NEW_HANDLES: [],

  /* ---- display names ---------------------------------------------

     A product's name on the site is its Shopify title. Two of them are
     typed in a different case from the rest of the catalogue --
     "JAG shorts" and "ASR shorts" against "JAG Sweats", "JAG Crewneck"
     and "Holes Tee" -- so a grid row reads as though two cards were
     typed by someone else.

     The real fix is the title in Shopify Admin, which this repo must
     never write to. Until someone makes that edit, this map overrides
     the displayed name and nothing else: the handle, the variant IDs,
     search, the cart and checkout all keep Shopify's own title.

     Keyed by handle, and deliberately tiny. Do not use it to rename a
     product, only to correct how an existing name is cased. Delete an
     entry the day Shopify's own title matches it. */
  DISPLAY_NAMES: {
    'jag-shorts': 'JAG Shorts',
    'asr-shorts': 'ASR Shorts',
  },

  /* ---- the next drop --------------------------------------------

     EMPTY BY DEFAULT, and while it is empty NONE of the drop UI
     renders: no countdown, no COMING cards, no timer. That is the
     point. A countdown to a date nobody has set is the fake-urgency
     dark pattern the FTC treats as deceptive, and CLAUDE.md bans it.

       name     what the capsule is called, shown in the countdown
       opensAt  ISO 8601 with an offset, e.g. '2026-11-14T19:00:00-06:00'
       handles  the Shopify handles in the drop

     Fill all three and the site does the rest by itself:
       - a countdown to opensAt in the announcement bar and under the
         homepage hero
       - those handles render as COMING cards with a Notify Me field
         instead of buyable cards
       - at opensAt everything switches to normal buyable cards with no
         deploy and no edit

     Clear it back to the empty shape when the drop has landed. */
  NEXT_DROP: { name: '', opensAt: '', handles: [] },

  VERIFIED_COMPARE_AT: [],

  // The Fall collection has no close date.
  //
  // This used to hold DROP_CLOSE_TIME, and every countdown on the site
  // read it: the announcement bar, the buy box, the cart. Sathvik
  // decided the collection stays open indefinitely, so that instant
  // became a deadline the site would have been inventing — and worse,
  // on the date itself every one of those countdowns would have
  // flipped to "closed" while the store was still taking orders.
  //
  // The value and the countdown that read it are both gone. Add them
  // back only when a real end date exists.
};
