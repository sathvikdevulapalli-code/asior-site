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
    /* ONE LIST, FOR EVERYTHING. Email and SMS both land on the
       Email List and nothing else is written to from this gate.

       TFEDaD was chosen over the three alternatives for a reason that
       is worth keeping: it is the only SINGLE OPT-IN list on the
       account, and it already holds 48 real subscribers with a live
       Email Welcome Series on it. The lists this gate used before --
       TN58zR (Fall Early Access) and SFuK88 (BFCM 2026 VIP) -- are
       both DOUBLE opt-in, and TN58zR had a profile_count of ZERO two
       months after it was created. Every person who ever signed up
       through the gate was left PENDING, waiting on a confirmation
       click that mostly never came, which means the signup did not
       happen and no flow fired.

       Single opt-in makes the subscription real the moment they press
       the button. Point this at a double opt-in list again and
       LIST_DOUBLE_OPT_IN below must flip in the same change. */
    LIST_ID: 'TFEDaD',

    /* TN58zR IS DOUBLE OPT-IN, and that changes what the gate may say.

       Read back 2026-11-14: opt_in_process "double_opt_in",
       profile_count 0 -- nobody has completed it in the two months
       since the list was created. A Client API subscription leaves
       the person PENDING and Klaviyo emails them a confirmation
       link; they do not join the list, and the Early Access flow
       that carries ASIORTEN does not fire, until they click it.

       For comparison, the Email List (TFEDaD) is single opt-in and
       has 48 real subscribers, every recent one stamped with a
       browser User-Agent -- which is what a working Client API
       signup looks like. The embed is not broken. This list is just
       a door with a second lock on it.

       Set this false if the list is switched to single opt-in in
       Klaviyo, or if LIST_ID is pointed at a single opt-in list, and
       the success message stops asking for a confirmation that is no
       longer needed. */
    /* False because TFEDaD is single opt-in (read back 2026-11-21).
       This drives both the pre-signup warning in the fine print and
       the wording of the success message, so the two can never
       disagree about whether a confirmation click is still owed. */
    LIST_DOUBLE_OPT_IN: false,

    /* The line above the wordmark. A moment, not an offer.

       IT NAMES NO DISCOUNT, AND IT MUST NOT. Every discount in the
       Shopify account was read back on 2026-11-14: the only ACTIVE
       ones are ASIORTEN (10%), the "Any 2 pieces 15% off" automatic,
       and free shipping at $50. THERE IS NO BLACK FRIDAY DISCOUNT.
       The 12-HOUR SALE 15% automatic expired 2026-11-08 and THIRTY
       expired 2026-10-28. So this says when, not what: the moment is
       real and the percentage would not be.

       Create a Black Friday discount in Shopify and this is where its
       real terms go, in its real words. */
    /* Empty since 2026-11-21: the founder asked for the words above
       the mark to come off. The clock says when and the lede says
       what; a third line said neither. A string here renders it
       again. */
    EYEBROW: '',

    /* ---- the restock framing, and why it is not here -------------

       Asked on 2026-11-14 to frame the gate as a huge restock of
       everything after selling out. Shopify, read the same day: 11 of
       11 products active and buyable, 89 units, nothing sold out and
       nothing restocked. The founder confirmed no stock has been
       ordered yet and that more pieces are only likely later.

       So that line is not written here. It is a statement about
       inventory, it would be false, and a fabricated sellout followed
       by a fabricated restock is the deceptive-urgency pattern this
       repo bans in two separate places and the FTC enforces against.

       WHEN THE PIECES ARE ACTUALLY ORDERED AND RECEIVED, this is a
       small change and an honest one: set EYEBROW to 'restocked', put
       the real words in LEDE, and the scarcity line below keeps
       itself right on its own because it is computed. Do it after the
       units are in Shopify, not before -- the whole point is that the
       page says what the catalogue says.

       SCARCITY computes that line from the live catalogue -- it names
       the sold-out sizes ("gone: blossom tee black m - ...") rather
       than stating a ratio, so it is specific, it updates itself, and
       it cannot become a lie as stock moves.

       OFF since 2026-11-15, at the founder's request: they wanted the
       bar naming what is gone taken off the gate. Nothing about it was
       wrong -- it reads availableForSale, every name it printed was
       genuinely sold out, and scarcity.js still proves that -- it is a
       presentation call, and theirs to make. The code stays and is
       tested; this flag is the whole of the switch. Set it true to
       bring the line back. */
    SCARCITY: false,

    /* The one solid action on the screen. The form is behind it.

       "10% off" is TRUE and is checked, not assumed: the Early Access
       flow (TXCdzE) on list TN58zR is LIVE, triggered by Added to
       List, and its email renders a real ASIORTEN coupon block --
       read back on 2026-11-14. If that flow is ever paused, this
       copy becomes a promise nothing keeps, so change it in the same
       breath. */
    /* ---- the countdown -----------------------------------------

       THE ONE DATE ON THIS SITE THAT IS REAL.

       CLAUDE.md bans countdowns, and the reason it gives is exact: a
       countdown to a date nobody set is the fake-urgency dark pattern
       the FTC treats as deceptive. That ban is about invented dates.
       This is not one.

       TO is the Shopify discount's own startsAt, copied from the
       discount node and nowhere else:

         DiscountAutomaticNode/1576926707929
         "Black Friday 2026 - 20% Off"
         status SCHEDULED, startsAt 2026-11-27T20:00:00Z,
         endsAt 2026-12-01T05:59:00Z, 20% of AllDiscountItems
         (read back 2026-11-19)

       So the gate is counting to an instant that exists in Shopify
       and will fire whether or not anybody is watching the clock.
       EMPTY IS VALID and means NO COUNTDOWN RENDERS AT ALL, the same
       discipline NEXT_DROP follows. Never put a placeholder here, and
       never let this drift from the discount: if the schedule moves
       in Shopify it moves here in the same change, or the gate is
       counting to nothing.

       ENDS is only used to stop claiming a live sale after it is
       over. LIVE is what the screen says once TO has passed. */
    COUNTDOWN: {
      TO: '2026-11-27T20:00:00Z',
      ENDS: '2026-12-01T05:59:00Z',
      LIVE: '20% off everything. No code needed.',
    },

    CTA: 'Black Friday VIP Access',
    /* CTA_SUB is gone. The founder asked for the screen stripped to a
       countdown, a signup and nothing else, and this line was a
       restatement of the two lines above it. */

    /* One line. The clock above it already says WHEN, so this only
       has to say WHAT, and the double opt-in instruction belongs in
       the success message -- which is where admit() puts it -- rather
       than in front of somebody who has not signed up yet. Four lines
       of explanation above the field was the wall the founder asked
       to have taken down. */
    /* No date here. The clock directly above it counts to the same
       instant, so "nov 27, 2pm ct" was the screen saying when twice
       -- and it pushed the line to two rows on a phone. */
    LEDE: '20% off sitewide.',

    /* ---- the members' half -------------------------------------

       The founder's offer is 20% for the whole site and an extra 10%
       for people who sign up. It cannot be built as two discounts:
       every discount in this account, the Black Friday automatic
       included, has combinesWith.orderDiscounts false, so a 10%
       member code would REPLACE the 20% automatic and leave a member
       worse off than a stranger. One 30% members-only code is the
       way -- Shopify lets a code outrank an automatic it cannot
       combine with, so members who enter it get 30% and everybody
       else keeps the automatic 20%.

       BOTH KEYS STAY NULL UNTIL THAT CODE EXISTS IN SHOPIFY. While
       either is null the gate says nothing about a member discount,
       because a members' offer nobody can redeem is worse than no
       offer. Fill in the code's real percentage, not the difference,
       and the line appears on the gate and on /vip. */
    MEMBER_OFFER: {
      /* ASIOR30 IS REAL. Read back from Shopify 2026-11-21:

           DiscountCodeNode/1578102915289
           "ASIOR30", status SCHEDULED, 30% off
           startsAt 2026-11-27T20:00:00Z
           endsAt   2026-12-01T05:59:00Z

         The same window as the Black Friday automatic to the minute,
         which is what makes it work. Every discount on this account
         is combinesWith.orderDiscounts FALSE, so ASIOR30 does not add
         10% to the automatic 20% -- it REPLACES it, and Shopify lets
         a code outrank an automatic it cannot combine with. The
         shopper who enters it pays 30% less; everybody else keeps the
         automatic 20%. That is the founder's "20% sitewide and an
         extra 10% for members", built the only way Shopify will
         actually honour it.

         PCT is the code's real percentage, never the difference. If
         ASIOR30 is paused or its window moves in Shopify, both keys
         go back to null in the same change or the gate is promising
         something nothing will honour. */
      PCT: 30,
      CODE: 'ASIOR30',
    },
    /* The FALLBACK only. While MEMBER_OFFER is live the gate computes
       the label from it ("Get 30% off"), so this is what the button
       says when there is no member offer to name -- it states what
       the button does rather than a figure nothing would honour.
       Never put a percentage here. */
    SUBMIT: 'Get early access',

    /* The address in the gate's foot. Same one the rest of the site
       uses; see SUPPORT_EMAIL in scripts/build.js. */
    SUPPORT_EMAIL: 'asiorclothing@gmail.com',

    /* ---- the SMS half ------------------------------------------

       An optional phone field beside the email one, with the consent
       paragraph visible at the point of collection rather than
       behind a toggle. SMS is never subscribed as a side effect of
       an email signup: the number is its own value, its own request
       and its own list, and an email alone sends nothing to SMS.

       CONSENT is not copy, it is compliance. 47 CFR 64.1200(f)
       requires prior express WRITTEN consent for marketing texts,
       and the clause most brands miss is "not a condition of any
       purchase". Klaviyo subscribes the number to a marketing list
       the moment it is submitted, so this paragraph is what makes
       that legitimate. Trimmed as far as it goes and no further --
       have the final wording reviewed by a lawyer.

       WORTH KNOWING: the SMS List's only flow (VieNw4) is still a
       DRAFT, so a number captured here is stored and answered by
       nothing until someone sets that flow live. Survivable in a way
       the old back-in-stock capture was not -- this form promises no
       message -- but it is why the welcome text is in
       OWNER-ACTIONS.md. */
    /* ---- THE A/B ---------------------------------------------

       Two versions of the gate's copy, split by a sticky bucket, with
       the bucket written onto the Klaviyo profile and onto the Gate
       Unlocked event so the result can actually be read back. An A/B
       whose variant is not recorded anywhere is just a coin flip.

       WHAT IS BEING TESTED: which number to lead with. Both
       variants are true and both end at the same place -- the
       shopper who signs up gets ASIOR30 and pays 30% either way.

         a  the public figure first, then what signing up adds
            "20% off sitewide. when you sign up, extra 10%."
         b  the member figure first, the public one as the floor
            "30% off when you sign up. 20% for everyone else."

       WHAT MAY GO IN A VARIANT: copy, and only copy -- LEDE and
       SUBMIT. Not the fields, not the consent text, not the list,
       not whether the number is required. A variant that changes
       what a visitor agrees to is not an experiment, it is two
       different privacy policies, and a variant that changes the
       form changes what the numbers mean.

       HOW TO READ IT: in Klaviyo, segment the list on the
       gate_variant property, or break the Gate Unlocked metric down
       by it. The denominator is Gate Shown, which fires once per
       session per bucket -- without it you have signups per variant
       and no idea how many people saw each.

       ON: false turns the whole thing off and everybody gets
       VARIANTS.a. SPLIT is the share who get b. */
    AB: {
      ON: true,
      KEY: 'asior_gate_ab',
      SPLIT: 0.5,
      VARIANTS: {
        a: {},
        b: {
          /* Copy only, and no SUBMIT here: the button's label is
             computed from MEMBER_OFFER so both variants say the same
             true figure and the test is the lede's framing alone. */
          LEDE: '30% off when you sign up. 20% for everyone else.',
        },
      },
    },

    SMS: {
      ON: true,

      /* REQUIRED, at the founder's instruction on 2026-11-21: the
         number is how somebody gets the 30% code, so it is not an
         optional extra on this form any more.

         Two things follow from it and both are load-bearing.

         First, a required field cannot be folded away. The rule has
         always been that the number and its TCPA disclosure move
         together; with the field permanently on screen the paragraph
         is permanently on screen too, which is what 47 CFR
         64.1200(f) wants anyway.

         Second, "not a condition of any purchase" in CONSENT below
         stays true and has to. The gate is a marketing wall on public
         URLs -- checkout is on Shopify's own domain and is not gated
         at all -- so nobody is required to accept texts in order to
         buy anything. Do not make SMS a condition of checkout; that
         sentence would stop being true and the consent would stop
         being valid. */
      REQUIRED: true,
      CONSENT: 'By entering your number you agree to receive recurring automated '
             + 'marketing texts from Asior at that number. Consent is not a condition '
             + 'of any purchase. Message frequency varies and message & data rates may '
             + 'apply. Reply STOP to cancel, HELP for help.',
    },

    /* ---- the quiet second action -------------------------------
       Links, not an embedded feed: a live Instagram grid needs the
       Basic Display API, a server to hold the token and a refresh
       every 60 days, which is a standing job on a site of static
       files. Both handles are the ones in the shared footer. */
    FOLLOW: {
      ON: true,
      LINKS: [
        { label: 'instagram', href: 'https://www.instagram.com/asior_clothing/' },
        { label: 'tiktok', href: 'https://www.tiktok.com/@asiorclothing.com' },
      ],
    },

    /* ---- the lookbook ------------------------------------------

       It is a PAGE now, not a strip on this screen.

       Off since 2026-11-15 at the founder's request: six photographs
       sitting open under the form made the gate a scrolling page
       rather than one screen with a name on it, and the site already
       has a real lookbook at /community.html (titled Lookbook, in the
       nav as Lookbook, nine frames) plus a /lookbook rewrite pointing
       at it. A visitor sees it once they are through.

       Deliberately NOT linked from the gate. Every storefront page is
       gated, so a link here would show the gate again -- the only way
       to make it work would be adding the lookbook to ALWAYS_OPEN,
       which puts the clothes in front of the wall and is the opposite
       of what the gate is for. Refill this array to put the strip
       back on the gate. */
    LOOKBOOK: [],

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
      /* The one list, like everything else on this site since
         2026-11-21. See KLAVIYO_EMAIL_LIST_ID in assets/site.js. */
      listId: 'TFEDaD',
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
