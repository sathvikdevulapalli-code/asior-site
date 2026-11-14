/* ===================================================================
   ASIOR — DROP ACCESS configuration. THE ONLY PLACE IT IS TURNED ON.

   Nothing in this file renders anything. assets/drop-access.js reads
   it and decides. Everything here is a switch or a fact; no copy that
   makes a claim lives anywhere else.

   ---------------------------------------------------------------
   THE RULE THAT MATTERS

   DROP ACCESS NEVER LOCKS THE STORE. It is an overlay a visitor can
   dismiss, and dismissing it leaves them exactly where they were,
   able to buy. There is no state of this file that puts a password in
   front of the catalogue, and nothing here is allowed to interrupt a
   shopper who has a cart open or is on their way to checkout. A
   waitlist that costs a sale is worse than no waitlist.

   ---------------------------------------------------------------
   THE POPUP THAT WAS IN ITS WAY

   Two Klaviyo popups were LIVE on this account, checked 2026-11-13
   against the Klaviyo API:

     UxDQrj  "Email & SMS Popup"  live, updated 2026-11-07
     Vtp6MG  "SMS"                live, updated 2026-11-07

   klaviyo.js loads on every page, so both appeared on every visit.
   With the announcement bar also carrying an email ask, a first-time
   visitor was asked for the same address three ways, and an overlay
   opening itself on top would have been a fourth. Three stacked asks
   is not an exclusive drop, it is a wall -- and a plausible part of
   why engagement is low.

   On 2026-11-13, at the founder's direction:
     - UxDQrj was UNPUBLISHED. It is the one that duplicates this
       overlay's job: an email ask that opens itself.
     - Vtp6MG was LEFT LIVE, because this overlay never asks for a
       phone number and so takes nothing away from SMS capture.
     - AUTO was set true, at ROLLOUT 0.5.

   IF YOU REPUBLISH UxDQrj, SET AUTO BACK TO FALSE, or the double ask
   comes back. Those two settings belong together; that pairing is the
   thing to keep straight. Both halves are reversible -- republish in
   Klaviyo (Signup Forms), flip the boolean here.

   WHAT TO WATCH before widening ROLLOUT past 0.5: the purchase
   conversion rate of the `test` bucket against `control`, and the
   ratio of Drop Access Dismissed to Drop Access Shown. If dismissals
   dominate, or test converts worse than control, set AUTO false. An
   overlay is never worth a sale.
   =================================================================== */

window.ASIOR_DROP = {
  /* Master switch. False = assets/drop-access.js returns immediately
     and the site behaves exactly as it did before, including the
     footer link, which is not rendered. This is the kill switch: flip
     it and redeploy, nothing else to undo. */
  ENABLED: true,

  /* The automatic trigger, separately from the feature itself. False
     means the overlay only ever opens because somebody asked for it.

     TRUE since 2026-11-13, paired with UxDQrj being unpublished in
     Klaviyo -- see THE POPUP THAT WAS IN ITS WAY above. Read that
     before changing either one. */
  AUTO: true,

  /* Share of ELIGIBLE visitors who get the automatic experience, as a
     fraction. The rest are the control group and see the site exactly
     as it is. Sticky per visitor (see dropBucket in drop-access.js),
     so nobody sees it flip between visits.

     0.5 is an even split, which is what a comparison needs, and it is
     deliberately not 1.0: half of eligible visitors still get the
     site exactly as it was, which is the only way to tell whether
     this helps or hurts. Widen it once that comparison says so. */
  ROLLOUT: 0.5,

  /* When the automatic trigger fires, for an eligible visitor.

     delayMs    engaged time on the page, not time since load: the
                timer pauses while the tab is hidden, so a visitor who
                opened the site in a background tab does not come back
                to an overlay already waiting.
     scrollPct  or this much of the page scrolled, whichever is first.
                Someone who scrolls a quarter of the way down has
                shown more interest than someone who idled 10s.
     minPages   never on the very first pageview of a session. A
                visitor who lands and is immediately interrupted has
                not been given a chance to see the clothes. */
  TRIGGER: { delayMs: 10000, scrollPct: 25, minPages: 2 },

  /* Days before the automatic trigger may show again after someone
     dismisses it. A subscriber is suppressed permanently, not for
     seven days -- see dropSuppressed(). */
  SUPPRESS_DAYS: 7,

  /* Paths the automatic trigger must never fire on, as prefixes.
     Checkout lives on Shopify's domain so it cannot be reached from
     here anyway, but the cart and account pages are the local end of
     the same intent. */
  NEVER_ON: ['/cart', '/account', '/checkout'],

  /* ---- THE ENTRY GATE -----------------------------------------------

     THIS ONE REALLY BLOCKS THE STORE. Everything above this point is
     the dismissible overlay; this is a wall.

     Added 2026-11-14 at the founder's direction, after being told
     that it reverses their own earlier instruction not to
     password-protect the live storefront, and that it stops new
     visitors buying Fall stock while the $50 free-shipping and
     2-piece offers are running to clear that stock. They chose it
     anyway, and chose email signup as the only way through.

     IT IS NOT SECURITY. The check runs in a browser on pages that are
     public URLs underneath it: no JavaScript, or `curl`, or reading
     assets/drop-gate.js walks straight past. Google indexes every
     product page exactly as before. It makes a first-time human
     visitor join the list before they see the clothes, and that is
     the whole of what it does.

     TO TURN IT OFF: ON: false. One flag, one redeploy, nothing else
     to undo, and the site is exactly what it was. */
  GATE: {
    /* The wall. False = assets/drop-gate.js returns immediately and
       nothing is ever hidden. */
    ON: true,

    /* Email signup is the only way through, by the founder's choice
       on 2026-11-14 over a code or a choice of both. Nothing else in
       this file offers a second door, so there is no second door. */
    LIST_ID: 'TN58zR',

    HEADLINE: 'Members only.',
    BLURB: 'Asior is open to the list. Put your email in and the door opens '
         + 'for you, here and every time you come back.',
    CTA: 'Enter',

    /* Pages the gate never stands in front of.

       A privacy policy behind an email-capture wall is self-defeating,
       and Shopify's checkout footer links to these four from a domain
       this gate cannot reach -- so emptying this list breaks those
       links for somebody who is mid-checkout. 404 is here so a
       mistyped URL is a 404 and not a wall. Matched as path prefixes,
       with any .html suffix already stripped. */
    ALWAYS_OPEN: [
      '/privacy-policy',
      '/terms-of-service',
      '/refund-policy',
      '/shipping-policy',
      '/404',
    ],

    /* How long an unlock lasts. A returning customer is not asked
       twice; a shared computer forgets after a year. */
    REMEMBER_DAYS: 365,

    /* THE OUTAGE FUSE. Email is the only way in, so Klaviyo being
       down is Asior being down -- every visitor, no sales, until it
       comes back.

       True admits a visitor whose submission genuinely failed to
       reach Klaviyo: after they typed a real address, and after the
       request really failed. It is not a loophole a visitor can find
       by guessing, it is a fuse. Set it false and a Klaviyo outage
       closes the shop. */
    FAIL_OPEN_ON_ERROR: true,
  },

  /* ---- campaigns ---------------------------------------------------

     Each entry is one drop campaign. /drop.html renders the ACTIVE
     one; the overlay links to it. Everything a campaign claims lives
     in its entry, so turning a campaign off removes every mention of
     it from the site at once.

       slug        the ?c= value and the analytics campaign name
       name        what it is called, shown as the eyebrow
       active      false = not rendered anywhere, not linked, not in
                   the sitemap. Exactly one campaign should be active.
       headline    the one line that carries the page
       blurb       two sentences at most, and only true ones
       hero        an image in images/, ROOT-ABSOLUTE ('/images/x.jpg').
                   A relative path here resolves against whatever page
                   the overlay opened on, so on /products/x.html it
                   becomes /products/images/x.jpg and 404s. normalise()
                   in drop-access.js forces the leading slash anyway,
                   but write it correctly here.
       heroAlt     a real description of that photograph
       listId      Klaviyo list the signup joins. MUST have a live
                   flow on it, or the signup is answered by nothing.
       handles     Shopify handles previewed on the page. EMPTY IS
                   VALID and means the campaign shows no products,
                   which is the correct state for a drop whose pieces
                   are not real in Shopify yet.
       opensAt     ISO 8601 with an offset, or ''. EMPTY MEANS NO
                   COUNTDOWN AND NO DATE IS SHOWN ANYWHERE. Never put
                   a placeholder here; a countdown to a date nobody
                   set is the fake-urgency pattern CLAUDE.md bans and
                   the FTC treats as deceptive.

     YNC is the active campaign, and it is deliberately thin.

     The only fact this repo or the Shopify catalogue holds about YNC
     is the name -- no date, no product list, no price, no
     description. So the page says the name, shows an approved
     campaign photograph from the real shoot, and offers the waitlist.
     It claims nothing else. handles is empty and opensAt is empty for
     exactly that reason, and both should stay empty until the founder
     supplies real ones. */
  CAMPAIGNS: [
    {
      slug: 'ync',
      name: 'YNC',
      active: true,
      headline: 'Access before the drop.',
      /* Both sentences are true today: the list exists, the Early
         Access flow on it is live, and nothing here describes a
         product, a date or a price. */
      blurb: 'The next Asior release. Join the list and you hear about it first, '
           + 'before it goes up for anyone else.',
      hero: '/images/oli04281.jpg',
      heroWidth: 1600,
      heroHeight: 2400,
      heroAlt: 'Two models in Asior polos and sweat shorts in a downtown passage',
      /* Fall Early Access. Double opt-in, and the "Early Access" flow
         on it is LIVE -- checked 2026-11-13 -- so a signup here is
         actually answered. */
      listId: 'TN58zR',
      handles: [],
      opensAt: '',
    },
  ],

  /* ---- what the drawer shows ---------------------------------------

     Handles previewed in the overlay's drawer, in order. These are
     read against the LIVE Shopify catalogue at render time: price,
     images, variants and availability all come from Shopify, and a
     handle that stops being Active simply drops out. Nothing about a
     product is stated here.

     The four Fall pieces, matching FALL_PRODUCTS in launch-config.js.
     JAG Sweats is a separate restock with its own page and is
     deliberately not in this list, the same way it is not in
     FALL_PRODUCTS. */
  DRAWER_HANDLES: [
    'scripture-polo',
    'jag-shorts',
    'holes-tee',
    'asr-shorts',
  ],

  /* ---- restock alerts ----------------------------------------------

     FALSE, AND IT HAS TO STAY FALSE UNTIL A FLOW EXISTS.

     A sold-out card is the obvious place for "notify me when it's
     back", and the brief asked for one. There is no back-in-stock
     flow in this Klaviyo account: all 27 flows were listed on
     2026-11-13 and their triggers are Metric, Added to List,
     Unconfigured and Price Drop. None is Back in Stock.

     Klaviyo will happily accept a back-in-stock subscription over the
     API and store it. With no flow on that trigger, nothing ever
     sends. The site did exactly this once before -- it posted to
     /client/back-in-stock-subscriptions/ and told the shopper "we'll
     email you the moment it's back" -- and every one of those signups
     went nowhere. That is the specific mistake this flag exists to
     prevent repeating.

     So a sold-out piece offers first access to the NEXT drop instead,
     which is answered by a flow that is live.

     TO TURN IT ON: build a flow in Klaviyo triggered by Back in
     Stock, set it Live, confirm it sends, then set this true. */
  RESTOCK_ALERTS: false,

  /* ---- analytics ----------------------------------------------------

     GA4_MEASUREMENT_ID is null because THERE IS NO GA4 ON THIS SITE.
     Searched the whole repo on 2026-11-13: no gtag, no dataLayer, no
     G-XXXXXXXXXX, no Tag Manager. The brief asked for GA4 events; the
     event layer is built and every event is emitted, but with no
     measurement id they go to Klaviyo and the console only.

     Put a real G-XXXXXXXXXX here and drop-access.js loads gtag and
     sends the same events to both. Nothing else changes. */
  ANALYTICS: {
    GA4_MEASUREMENT_ID: null,
    /* Klaviyo gets every event regardless, because it is wired and
       working today and is where the audience already lives. */
    KLAVIYO: true,
    /* Logs every event to the console with its payload. Useful while
       checking the funnel; harmless if left on. */
    DEBUG: false,
  },
};
