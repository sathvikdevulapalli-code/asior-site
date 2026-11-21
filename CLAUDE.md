# Asior Clothing — storefront

Static storefront for asiorclothing.com. This is **not** the manufacturing
landing page / client order form this repo used to be — that project is
gone. This repo is now the Fall 2026 drop storefront: browse, cart,
checkout.

## Team
- Sathvik: founder, strategy
- Ayush: operations

## Architecture

Zero-framework HTML/CSS/JS, deployed on Vercel straight from this repo
(`vercel.json` — `framework: null`). No Next.js, no Shopify Liquid theme:
no `templates/`, `sections/`, `snippets/`, or `.liquid` files exist or
should be searched for. Data and checkout come from Shopify's Storefront
API (public token in `assets/site.js`); email/SMS is Klaviyo's public
Client API. Neither is touched from this repo's admin side — no writes to
Shopify Admin, no Klaviyo campaign edits, ever, from here.

Key pages: `shop.html` (catalog/grid — and the homepage, since `/`
301s to it), `product.html` (PDP, driven by `?id=<handle>`, generated
per-product into `/products/<handle>.html` at build time), `cart.html`,
`lanyard.html` (a standalone product page, outside the generated set).
`archive.html` (every product, sold out included, labelled AVAILABLE /
SOLD OUT), `about.html`, `community.html` (the lookbook — the URL keeps
its old name so existing links don't break, with `/lookbook`
rewriting to it), `contact.html`,
`manufacturing.html`, `account.html` round out the nav. `404.html` is
served by Vercel for any unmatched path; it carries the shared header
and footer but is deliberately absent from the sitemap.

Shared plumbing lives in `assets/site.js`: `shopifyFetch`, image
helpers (`imgTag`/`srcsetFor`), cart mutations
(`addToShopifyCart`/`getOrCreateCart`, which return Shopify's
`checkoutUrl`), Klaviyo helpers, and small localStorage-backed
personalization (`getViewed`/`recordView` for "recently viewed",
`recordSizeChoice`/`preferredSize` for a quiet "your size" hint —
never used to preselect a size for a customer). `assets/drop-countdown.js`
renders the sitewide countdown off a single timestamp.

## FALL_PRODUCTS is the source of truth

`assets/launch-config.js` (`window.ASIOR_LAUNCH`) is the single source of
truth for the drop:
- `FALL_PRODUCTS`: the real Fall pieces (handle + customer-facing name).
  Anything not in this array is not part of the Fall collection — don't
  add products back to it without the founder saying so.
- `PUBLIC_LAUNCH_TIME`: the instant the drop opened. There is no
  `DROP_CLOSE_TIME` and no countdown anywhere on the site; the key was
  removed when the collection stopped having an end date, and nothing
  reads it.
- `FALL_COMMERCE_READY`: whether the full Fall set is live for real
  purchase.
- `EARLY_ACCESS_CODE_SHA`: SHA-256 of the early-access code, a marketing
  gate, not real security (store pages are public URLs regardless).

Never invent product facts — prices, inventory, compare-at pricing,
measurements, sizes, or copy — that aren't actually coming from Shopify
or this config file.

## Discounts

One live code: **ASIORTEN, 10% off, once per customer, no expiry.** It is
the only code the site may mention. Any other discount copy is a bug —
including "5% off", a welcome-signup percentage, or "subscriber
pricing". None of those exist in Shopify.

Two more real offers exist, both set up in Shopify on 2026-10-26 at the
founder's direction to sell through the current stock:

- **Free US shipping at $50** ($99, then $75, then $50). Domestic zone,
  `Free shipping`, $0.00, condition `TOTAL_PRICE >= 50.00`.
  `FREE_THRESHOLD` in `promo-config.js` mirrors it. Shopify is the
  source of truth for this number: when it moves there it moves in
  that one constant and nowhere else. It drifted once — the rate was
  lowered to $50 in Shopify while this repo still said 75, so for a
  while every surface told shoppers they needed $25 more than they
  did. Read it back from the delivery profile rather than trusting
  this line.
  During the scheduled BFCM automatic 20% sale (Nov 27, 2026 2:00 PM CT
  through Nov 30 11:59 PM CT), the storefront threshold is $62.50 before
  discount so Shopify's post-discount $50 shipping rule remains accurate.
- **Any 2 pieces 15% off**, a Shopify automatic discount
  (`DiscountAutomaticNode/1570203828441`), 15% off the order at a
  minimum quantity of 2, no code. Read back from the discount node on
  2026-10-26: `minimumRequirement` is a **quantity** of 2 (units in the
  cart, not distinct line items) and `combinesWith` is
  `{ orderDiscounts: false, productDiscounts: false, shippingDiscounts:
  true }`. So it does **not** stack with ASIORTEN, and it **does** stack
  with free shipping. Never imply it stacks with the code; never imply
  taking it costs the free shipping either.
  `window.ASIOR_OFFERS.MULTI_BUY` in `promo-config.js` mirrors it; set it
  to null the day the discount ends and every mention disappears.

Neither is a code, so ASIORTEN is still the only code the site names.

Where the 2-piece offer appears, and in what words. One helper,
`multiBuyOfferLine(qty)` in `assets/site.js`, produces the only
sentence: "Add any second piece for 15% off" below the minimum and
"15% off applied at checkout" at or above it. It is used by the
product page, under Add to bag, and by the cart drawer, under the
free-shipping bar. The quantity is the real cart quantity, cached by
`renderCartCount` and announced on the `asior:cartqty` event, never a
count kept separately. At exactly one item the drawer also offers up
to two real pieces to be the second one, labelled "Pair it with": live
catalogue, live `quantityAvailable`, nothing drawn if either fetch
fails, nothing drawn for a product whose size does not name one
variant (it could not be added from the drawer), and adding goes
through `addToShopifyCart` like every other add. No badge on any grid
card. All of it is gated on `MULTI_BUY`.

While that automatic discount is live, ASIORTEN steps aside rather than
sitting beside it: the product page's trustline drops the code, and the
cart page and the announcement bar both say the code does not combine
with the 2-piece offer. During the scheduled BFCM window, storefront
promotion copy also hides ASIORTEN. This is display-only; Shopify still
accepts the code if a shopper enters it. Two offers stated side by side with nothing
said add up to 25% in a shopper's head. The wording names the 2-piece
offer specifically and does not say "one offer per order", which was
the earlier phrasing and is wrong: free shipping stacks with both.

Discount *amounts* are never computed here. Shopify rounds per line
(3 x $42.99 at 10% is 3 x $4.29 = $12.87, not $12.897), so the figure
shown must come from the Storefront cart's `discountAllocations` /
`discountCodes` or it will disagree with checkout.

## Sold-out capture goes to the Email List

There is **no back-in-stock flow in Klaviyo** on this account. 18 flows
exist and none is on that trigger, checked 2026-10-26 — and the Fall
pieces are not being restocked, so there is nothing for one to announce.
The site used to post sold-out signups to
`/client/back-in-stock-subscriptions/` and tell the shopper "we'll email
you the moment it's back". Nothing could ever send that mail, so every
one of those signups went nowhere.

What a sold-out size or a sold-out product offers instead is **"get
first access to the next drop"**, subscribing to the same **Email List**
(`KLAVIYO_EMAIL_LIST_ID`, `TFEDaD`) the footer signup feeds. The Email
Welcome Series flow on that list is live, so the signup is answered.
`klaviyoNextDropSignup(email, meta)` in `assets/site.js` owns it; it is
the only sold-out capture, on the product page and in quick view alike.
Because it is the same list and the same real marketing consent as the
footer, every form calling it carries the footer's consent sentence
verbatim.

Do not reintroduce back-in-stock wording — "email me when it's back",
"notify me when this is back", a restock alert — unless a
back-in-stock flow actually exists in Klaviyo and is Live. "Notify me"
on a `NEXT_DROP` COMING card is a different thing and is fine: it goes
to the early-access list and that mail does get sent.

## Data sources

Everything the site states about a product or an order comes from one of
these. Nothing else is a source, and nothing may be written from memory.

**Shopify product metafields** (storefront PUBLIC_READ, created 2026-10-05):
- `custom.fit_notes` (multi-line text) — the fit sentence above the size
  picker. Filled for the Polo and both shorts; empty elsewhere.
- `custom.size_chart` (JSON) —
  `{"unit":"in","columns":["Chest","Length"],"rows":{"S":[20,27]}}`.
  Empty everywhere as of this writing; the founder measures. Render the
  table only when it parses, and drop the "How to Measure" accordion
  when it does not.
- `custom.model_info`, `custom.fabric_care` (text) — empty; render only
  when set.
- `reviews.rating` / `reviews.rating_count` — real Judge.me numbers
  (four reviews in total). **The site does not render ratings in any
  form**, and these fields are not read. Not stars, not a numeric
  average, not a review count, not "rated by N people" — nowhere, on
  any page. Four reviews is not a sample anyone should be shown an
  average of, and a partial display was the standing FTC risk (showing
  some and not the 1.0). Removing them entirely settles both. If this
  is ever reversed, every review shows, including the 1.0.
- Do **not** render `shopify.fabric` or the other `shopify.*` taxonomy
  values. Those are Shopify's auto-suggestions, not verified facts.

**Shipping** (read back from the Shopify delivery profile 2026-10-23)
lives in `assets/promo-config.js`:
- US domestic is **live USPS carrier-calculated**, not a flat rate. The
  shopper's real rate is computed at checkout from their address, with
  a 15% handling adjustment on top. The site must therefore not quote a
  single US price; it says shipping is calculated at checkout.
- **Free shipping over $50**, active, condition `TOTAL_PRICE >= 50.00`
  (read back from the live delivery profile 2026-11-09; $99 on
  2026-10-22, $75 on 2026-10-26, $50 by 2026-11-09).
  This is the one shipping figure the site states outright.
- The old flat rates still exist as `(backup)` methods behind USPS, now
  $10.90/$19.90 Standard and $12.90/$34.90 Economy. They are a fallback
  if the carrier API fails, not the advertised price. The $4.90 / $6.90
  / $9.90 figures this file used to list are gone. `shipping-policy.html`
  was still publishing that retired rate card as the live one until
  2026-10-26; it now says the US charge is calculated at checkout and
  states only the $50 threshold.
- International: USPS, DHL Express, DHL eCommerce and FedEx, all
  carrier-calculated and shown at checkout.
- Dispatch 1–2 business days. That is handling time, not delivery. It
  is stated on `shipping-policy.html` and nowhere else.
- Sathvik confirmed US and international shipping on 2026-10-11. The
  public policy says international destinations and rates are shown at
  checkout; it does not claim a country count. The Shopify Admin policy
  still needs to be synchronized with `shipping-policy.html` so the
  checkout footer agrees.

**Support email** is one address site-wide, from `SUPPORT_EMAIL` in
`scripts/build.js`. It is Shopify's contact address. Do not switch it to
`hello@` until someone confirms that inbox is read.

**Returns policy:** the storefront policy at `/refund-policy.html` says
fit or order issues are reviewed case by case; replacements are usually
the first solution, and refunds may be agreed by email. Sathvik
confirmed this on 2026-10-11. The matching Shopify Admin policy still
needs to be synchronized before checkout displays it.
`RETURNS_POLICY_PUBLISHED` in `assets/promo-config.js` controls the
matching PDP/quick-view sentence. Do not add a return window or promise
a specific refund timeline without confirmation.

## Attribution

The numbers that started this, read back 2026-11-14: Instagram's own
dashboard counted **75 bio-link clicks**; Shopify Analytics reported
**50 sessions in 30 days and attributed 100% of them to `direct`**,
zero to social. Klaviyo's Active on Site showed 5, which counts known
profiles only. None of those figures was broken. Instagram's in-app
browser sends **no `Referer`** to an external site, and the bio link
carried **no UTM tags**, so every one of those visitors arrived looking
exactly like somebody who typed the domain in.

**Three tiers, strongest first**, in `getUTMParams()` in
`assets/site.js`:

1. **Tagged** — UTM or click-id params on the URL (`utm_source`,
   `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `ttclid`,
   `fbclid`, `gclid`). Measured.
2. **Inferred** — `inferTouch()`. The in-app browser from the
   User-Agent first, then the referrer's hostname.
3. **Nothing**, which is what a typed URL or a bookmark honestly looks
   like. No touch is invented for it.

Every inferred touch is stamped `asior_attr: 'inferred-app'` or
`'inferred-referrer'`, and a tagged one `'tagged'`. **That stamp is not
decoration.** A derived source reported as a measured one is how an
analytics number becomes a lie, and this value is what lets the founder
tell "Instagram, because the link said so" from "Instagram, because the
browser looked like it" on a Shopify order.

**A guess never outranks a fact, and a fact never outranks an earlier
fact.** First touch wins, so a creator who found the customer is not
displaced by the branded search that customer ran a week later — but a
stored *inference* is replaced by a real tagged arrival, because
otherwise an inferred `instagram` would sit in front of a real
`utm_content` naming which post it was. Both halves have tests.

**Instagram is tested before Facebook and the order is load-bearing.**
Instagram's UA contains `FBAN`/`FBAV` — it is a Meta app — so testing
Facebook first attributes every Instagram visitor to Facebook.

**Where it goes.** Two destinations, both already plumbed:

- **The Shopify order**, via `cartAttributes()`, which rides
  `getUTMParams()` and so needed no change. Attributes ride through
  checkout and land on the order in Shopify Admin, which is where
  revenue is actually reconciled. `createCart` retries without
  attributes if the API rejects them — attribution never costs a sale.
- **A countable visit**, via `trackArrival()`: one Klaviyo `Site Visit`
  event per **session**, carrying `source`, `medium`, `attribution` and
  `landing_page`, on the anonymous id. Once per session and not once per
  page, because 22 pages of browsing is one visit and counting page
  views here would inflate the figure in exactly the direction that
  flatters us. A browser that refuses `sessionStorage` is skipped
  entirely: a visitor who cannot be deduplicated is better uncounted
  than counted 22 times.

**Shopify's session analytics will keep saying `direct` whatever we
infer, and that is not a bug to chase.** A headless storefront does not
fire Shopify's own session beacon; Shopify's attribution comes from the
checkout, not from a page view. The order is fixed, the visit is counted
in Klaviyo, and the session number in Shopify Analytics is simply not
the instrument for this question. Do not add a hand-rolled monorail
beacon to try to move it.

**Two things only the founder can do**, and the inference is a floor
under them rather than a replacement:

- **Tag the Instagram bio link.** `?utm_source=instagram&utm_medium=bio`
  plus a `utm_content` per post turns tier 2 into tier 1 and is the only
  way to tell one post from another.
- **Enable Vercel Web Analytics** in the Vercel dashboard. The script is
  already shipped from `HEAD_SHARED`; it counts anonymous page views with
  referrers and needs no profile.

Nothing here probes or fingerprints. The UA string is read, and nothing
is stored that the visitor did not arrive with. `h/track.js` is the
suite — 50 assertions over real Instagram, TikTok, Facebook and Snapchat
webview UA strings, the referrer table, internal navigation, the
tier ordering, the single-count rule, and the buy path with storage
refused.

## Brand and design

The site should read as a small real label run by a person. Research
basis: Peace in War, Corteiz, Eric Emanuel, Online Ceramics, Hellstar,
Madhappy, Aime Leon Dore, Cole Buxton, Represent, Stray Rats.

**Never ship any of these.** `scripts/check-slop.js` greps the built HTML
and fails on a hit, so this list is enforced rather than remembered:

- The phrases "elevate your style", "discover our collection", "crafted
  with passion", "timeless", "join the movement", "unleash", "premium
  quality", "why choose us", "our mission".
- Three-icon feature rows (Quality / Shipping / Secure checkout).
  Testimonial carousels. "As seen in" strips.
- Gradient or blurred-blob heroes, glassmorphism, floating 3D mockups,
  emoji bullets, rounded cards everywhere.
- Load-time discount popups. Fake timers. "X people viewing". Any stock
  count not from live Shopify data.
- Ratings of any kind — stars, numeric averages, review counts.
- AI-generated product or model images. Real photos only.

**Palette:** black page, off-white type. `--bg #0B0B0C`,
`--ink #E8E8EA`, `--muted #9A9AA0` (7.0:1), tiles on
`--surface #161618`, chrome hover `--surface-hi #1E1E21`, inactive tabs
`--panel-bg #141416`, hairlines `--line #26262A`, control boundaries
`--field-line #6C6C73` (3.4:1). The primary action inverts: off-white
fill, near-black caps, square. The announcement bar is `#141416` with
off-white caps. No other colour except the product photographs
themselves.

Black theme, founder's decision 2026-10-26. The white palette from
2026-10-25 is retired. `scripts/check-slop.js` fails the build if
`--bg` in `assets/site.css` is a light value (relative luminance
0.1 or more), so a flip back to white cannot land by accident — if it
is ever reversed on purpose, that guard changes in the same commit.
Body text clears 4.5:1 on `#0B0B0C` and control boundaries clear 3:1.

**Not pure white on pure black.** Helvetica at 14px blooms in that
pairing, which is why the page is a near-black and the type an
off-white, and why small text takes a weight step rather than more
size.

The site went white on 2026-10-25 to match the reference UI and back
to black on 2026-10-26, both at the founder's direction. The
reference's structure stays; its background does not. Any rule that
hardcodes a colour instead of reading a token is a bug, not a style —
that is what made each flip a day's work rather than a token change,
and the leftovers that had to be hunted both times were
`theme-color` metas, hero gradients and the card's touch control.

**Type:** the system Helvetica stack, no webfont for the interface
(`Helvetica, 'Helvetica Neue', Arial, sans-serif`). Body 14px/400. The
only loaded face is Pinyon Script, and it draws the Asior signature
and nothing else. Nav and labels all caps; product copy sentence case.
Square corners (`--input-radius: 0`), 1px rules instead of cards,
photos edge to edge on mobile.

**The card.** One definition, used by every grid — home, shop,
collection, archive, related, search. 4:5 image on `--surface`,
`object-fit: cover`. Title 14px/500 at normal tracking and **not**
uppercased in CSS — product names are already typed in caps where they
belong in the Shopify data, and transforming here shouts the ones that
are not. Price 14px/400 in `--muted` under it; both left-aligned under
the photograph's left edge.

**The caption is defined once.** `.product-title` and `.product-price`
were declared in three separate places in `site.css`, all at equal
specificity, so the winner was decided per property by document order
and editing any one of them moved only some of the spacing. That is
how the price ended up 3px under its name while the name sat 10px
under the photograph. One block now, and the two stale copies are
gone — if you are about to add a fourth, edit the canonical one.

**Document order is not a cascade.** The same trap caught the product
page twice more, and both are fixed. `.site-header` carries
`min-height: var(--header-h-ref)`, so the mobile block's `height:
64px` never won — min-height beats height — and every phone page
shipped an 85px header. The phone breakpoint now sets the token
instead, which is also what keeps the hero's negative margin and
`scroll-padding-top` in step. And `product.html`'s phone rhythm block
sat *before* the components it overrode, so half of it was dead at
equal specificity; it now lives at the end of that stylesheet and
says so. An override belongs after what it overrides, or it belongs
in the token.

**The phone first screen is a contract.** On a 390×844 phone, a
product page shows the photograph, name, price, model-fit line, size
row, Add to bag and the ASIORTEN line with nothing scrolled. The two
offer lines sit *between* Add to bag and Buy it now — Buy it now
skips the cart, so that is the last place a shopper taking the
express route can read them. Anything added to the buy panel is
measured against that screen before it ships.

**The title is clamped to one line** (`-webkit-line-clamp: 1`,
`min-height: 1.35em`), 10px under the photograph with the price 5px
under it. The clamp is what keeps every price in a row on the same
baseline: a name that wraps pushes its own price down, and on a phone
exactly one name does. Reserving two lines fixes the alignment too,
but leaves a blank line under the ten names that do not wrap and the
price reads as orphaned. The one cost is that "Helia Pendant & Chain,
Silver" shows an ellipsis on a phone card and nowhere else; the full
text stays in the DOM for the accessible name. A `+` circle bottom-right of the image
reveals the size row. Badges are small black boxes with white caps,
top-left. Sold-out products stay in the grid with their badge.

4:5 is the founder's call and it costs crop: the catalogue is shot
from 0.56 to 0.80, so the polo, holes tee, crewneck and pendant lose
about 17% of their height to the frame and the shorts and lanyard
about 30%. The reference can use 4:5 because every one of their tiles
is a product-only shot framed for it. A product-only shoot is the real
fix.

**The header.** One row at every width: nav left, Asior wordmark
centred, market / search / cart right. Transparent with white text
over a hero photograph, solid with off-white text once scrolled or on
any page without one.

The nav panel lives inside `<header>`, which is positioned and so
opens its own stacking context: a panel `z-index` is scoped to the
header, not the page. The scrim is appended to `<body>`, so it
outranks the whole header unless `body.nav-open .site-header` lifts
it. That is not a detail — getting it wrong made the mobile menu
completely untappable, and nothing about it looks broken in a
screenshot. A search icon opens a panel from the top of
the page — `wireSearch()` in `assets/site.js`, on every page, with the
catalogue fetched on first open and never before.

**The hero.** One full-bleed landscape photograph, close to the first
screen's height, with a single CTA near the bottom. A scrim at the top
for the header and a short one at the bottom for the CTA, and no fade
into the page: on white it washed the photograph out, and on black it
is not needed. The homepage hero is one full-bleed
photograph (the four-model group shot), not a split; the founder asked
for that on 2026-10-24. Desktop header is one row from 1180px up: nav
left, wordmark centred, market and bag right.

**Motion.** Split in two, and all of it off under
`prefers-reduced-motion`.

*Four ambient effects, and nothing else.* These are the only things
that move without being asked to. Do not add a fifth.

- Hero settle-zoom on load.
- Reveal on scroll: anything with `data-reveal`, and every `.product`
  card, starts faded out and 18px down (10px for the full-bleed bands)
  and settles as it comes within a screen, staggered by column.
- Card hover: the second photograph fades in with a slight zoom.
- Drawer and panel slides at 220ms (cart drawer, search panel).

*Response motion*, added 2026-11-07 when the founder asked the site to
feel expensive. It answers a hover, a press, a focus or a cart change
and never starts on its own, which is the distinction that matters:
more ambient animation reads as a template, a page that answers you
reads as built. It lives in one block at the end of `assets/site.css`.

- A press on every control, same gesture, same 90ms.
- The nav underline draws from the left; the wordmark signs itself
  with a slower stroke of the same hairline.
- The bag badge bumps once when something is added — and only when
  something is added. `renderCartCount(n, announce)` takes an explicit
  second argument for exactly this, because the count also rises on
  every page load for a returning shopper.
- The focus ring arrives rather than appearing.

**The four easing curves are four different curves.** `--ease-out`,
`--ease-in`, `--ease-inout` and `--ease-img` all held the same
`cubic-bezier(0, 0, .3, 1)`, so a panel arriving, a panel leaving, a
hover and a photograph cross-fading all moved with one gesture. That
is what made the site read as flat in motion however many transitions
it had. Each now does its own job and the tokens say which. Keep them
distinct.

The reveal lives in one place: `wireReveal()` in `assets/site.js` and
the `.js-reveal` block in `assets/site.css`. The hidden state is
applied only once a working `IntersectionObserver` exists, by putting
`.js-reveal` on `<html>` from JS, so no-JS and reduced-motion visitors
are never shown a blank page. Pages must not add `.in` to cards
themselves — call `Asior.observeReveal(grid)` after a re-render
instead, or the animation never plays.

**Stock signals.** Every number is Shopify's own `quantityAvailable`,
fetched live in its own request — never added to `PRODUCT_CARD_FIELDS`,
because mixing it into the catalogue query broke live images and
pricing across browsers earlier this launch. `fetchStock()` in
`assets/site.js` owns it, and everything fails silent: no data means
no line and no badge, never a safe-looking default.

- "N left" on a size at 3 or fewer, on the product page's size boxes
  and on the card's size row. Only where one option names exactly one
  variant: on a Color + Size product a size spans several colours, so
  no single count is true of the box and none is shown.
- "Only N left in {size}" under the price at 3 or fewer.
- `LOW STOCK` badge when a product's total is 5 or fewer and it is
  still buyable. `SOLD OUT` comes from `availableForSale`, never from
  quantity: the JAG Lanyard sits at −5 with `availableForSale: true`,
  so a quantity rule would mark a buyable product sold out.

**`NEW_HANDLES`** in `launch-config.js` — handles the founder wants
badged NEW, empty by default, empty means no badge. A list rather than
a date rule because no date works: every Active product's `createdAt`
predates `PUBLIC_LAUNCH_TIME`.

**`NEXT_DROP`** in `launch-config.js` — `{ name, opensAt, handles }`,
empty by default. While it is empty **none of the drop UI renders**: no
countdown, no COMING cards, no timer. A countdown with no real date is
the fake-urgency dark pattern this file bans and the FTC treats as
deceptive. Fill all three and the site does the rest by itself: a
countdown in the announcement bar and under the hero, those handles as
COMING cards with a Notify Me field wired to the existing early-access
list, and an automatic switch to normal buyable cards at `opensAt`
with no deploy. Clear it back to the empty shape afterwards.

**The homepage CTA follows what there is to do.** Shop normally; "Get
early access" when a drop is configured and unopened, or when live
`availableForSale` says two thirds or more of the catalogue is gone.

**Voice:** short, texted rather than written. Lowercase is fine in body
copy. "nothing in here yet." not "Your cart is currently empty."

**Easter eggs.** Two, added 2026-11-07, both in `wireDelight()` in
`assets/site.js`: typing `asior` anywhere outside a form field reveals
a one-line note pointing at the lookbook, and a message is written to
the console. The rules they follow are the ones any further egg must
follow too — nothing fires on load (a greeting is a popup with a
better name, and CLAUDE.md bans load-time popups), nothing claims a
code, discount, stock level or date, nothing touches the cart or
checkout, and nothing steals focus or blocks a tap. ASIORTEN is the
only code the site may name and it is already public, so there is
nothing for an egg to "unlock" — a hidden offer would be a fake one.

**Sold out stays visible.** A sold-out product or size is left in the
grid with its label. It reads as proof that things sell, which is why
Corteiz and Hellstar do it, and hiding it throws that away.

**AI-generated imagery.** `isGeneratedImage()` in `scripts/build.js`
detects generator filenames (Firefly, Midjourney, DALL-E, Stable
Diffusion, "GeminiFlash", `nano-banana`). Such an image is never the
grid tile, the OG image or the first PDP frame; a real photograph is
promoted ahead of it. Kova's Shopify `featuredImage` is a Firefly render
as of 2026-10-06 and is demoted this way. It is not deleted — that is
the founder's call in Shopify Admin.

## DROP ACCESS

An entry overlay and a product drawer, plus `/drop.html`, a reusable
campaign page. Configured entirely by `assets/drop-config.js`
(`window.ASIOR_DROP`); `assets/drop-access.js` reads it and decides.
Both are loaded, deferred, on all 22 pages from `HEAD_SHARED`.

**The overlay is never a lock.** Escape, the scrim, the close button
and "Continue shopping" all close it, and every card either adds to
the real Shopify cart or links to the real product page. There is no
configuration of it that puts a wall in front of the catalogue, and
`NEVER_ON` plus a live cart-quantity check keep it away from anyone
who has started buying. A waitlist that costs a sale is worse than no
waitlist.

**The gate is. That is a separate thing, and it is deliberate.**
`assets/drop-gate.js` plus `GATE` in `drop-config.js` is a real wall:
a full-screen entry screen on every storefront page, no close
control, Escape does nothing, and joining the Email list is the only
way through. The founder asked for it on 2026-11-14, after being told
in those words that it reverses their own earlier instruction not to
password-protect the live storefront and that it stops new visitors
buying Fall stock while the $50 free-shipping and 2-piece offers are
running to clear that stock. They chose it anyway and chose email as
the only door. **Do not "fix" it back to a dismissible overlay** —
that is the thing they asked to change. `GATE.ON: false` is the one
flag that turns it off, and nothing else needs undoing.

It is a second file from the overlay on purpose: the overlay must
never block a sale, the gate is a wall by definition, and one file
holding both is one flag away from turning the overlay into a wall by
accident.

**It is not security, and nobody may be told it is.** The check runs
in a browser on pages that are public URLs underneath it. No
JavaScript, or `curl`, or reading `drop-gate.js` walks straight past,
and Google indexes every product page exactly as before. It makes a
first-time human visitor join the list before they see the clothes.
That is all it does and all it may be described as doing.

**Three things keep the gate from being an outage**, and all three
have to stay:

- **The watchdog.** The inline bootstrap in `HEAD_SHARED` hides
  `<body>` before the storefront paints, so there is no flash of the
  shop. If `drop-gate.js` then fails to load or throws, nothing else
  would ever unhide it and the whole site is a blank page. The same
  inline script schedules its own unconditional reveal at 4s. A
  broken gate shows the shop; it never shows nothing.
- **`FAIL_OPEN_ON_ERROR`.** Email is the only way in, so Klaviyo
  being down is Asior being down. True admits a visitor whose
  submission genuinely failed to reach Klaviyo — after a real address
  and a real failure. It is a fuse, not a loophole.
- **`ALWAYS_OPEN`.** The privacy, terms, refund and shipping policies
  and `404.html` are never gated. A privacy policy behind an
  email-capture wall is self-defeating, and Shopify's checkout footer
  links to those four from a domain the gate cannot reach.

**One boolean, two places, guarded.** The bootstrap runs before the
deferred config, so `build.js` stamps `GATE.ON` into the head of
every page and `check-slop.js` fails the build if any built page
disagrees with `drop-config.js`. Never hand-edit the stamped value —
run the build.

**The gate's look is the old drop gate, brought back.** On
2026-11-14 the founder asked for the locker from the very start of
the project. It was still in the repo: `video/gate.mp4`, its WebM and
its poster were committed and had a `Cache-Control` rule in
`vercel.json`, referenced by nothing since the old `index.html` gate
was retired; `fonts/inter-tight-var-latin.woff2` was still in
`fonts/`. Anton and Courier Prime were restored from `742d53b`, the
commit that shipped it. The design is that one: the panther film,
the Anton wordmark, Courier Prime for the small system lines, Inter
Tight for everything else, bracket links in the foot, the staged
rise.

**The three faces are self-hosted and that is deliberate.** While
the gate is up it IS the site, so its first paint is the whole first
impression, and a `fonts.googleapis.com` link puts a DNS lookup, a
TLS handshake and a third-party stylesheet in front of it — then a
second host for the files. They are preloaded from `HEAD_SHARED`
with `crossorigin`, which is required even same-origin: font fetches
are always CORS-mode, and a preload without it is made in the wrong
mode, ignored, and quietly fetched twice.

**The film's three outcomes.** MP4 first then WebM, each with an
explicit `codecs=` string, because a browser commits to the first
source it believes it can play and never reconsiders — listing WebM
first is what once put this film behind a play button on Safari, and
MP4 alone has nothing to play on a Windows Firefox without H.264.
There is no `poster` attribute and no `controls`, so iOS has nothing
to decorate with a play button: if autoplay is refused the gate is
simply a still photograph. A film is decoration, and decoration
never keeps anyone out of a shop.

**A moving background cannot be trusted for contrast.** Measured
across the whole 8.5s loop rather than on one frame: the poster is
the *darkest* frame, and later ones take the grass bright enough to
drop the consent line to 3.2:1. Dimming the film until everything
passed worked and was wrong — at that brightness the panther was
gone and the background was a texture, so the measurement had been
solved by deleting the feature. The fix belongs to the text, so it
is `.gate-core::before`: a wash bound to the column, flat across its
height and gone by the edges, with the film left bright. Worst case
across the loop is now 6.9:1. The gate suite samples 14 shots across
the loop and fails under 4.5:1 — if either the wash or the film's
`brightness()` is weakened, the test says so.

**The form is behind the action, not on the screen.** The gate is
an eyebrow, the mark, one solid button and a bracket link; pressing
the button (or the mark, which is the members' entrance) opens a
sheet with the form in it. That is how the original worked and it
is what keeps the gate a picture with a name on it rather than a
login page over a photograph. Escape closes a **sheet** and never
the gate — a dialog that cannot be dismissed from the keyboard is a
trap in the accessibility sense, where the gate itself is one by
design.

**SMS is an optional field, with its consent beside it.** Its own
value, its own request, its own Klaviyo list (`UiFFMg` via
`klaviyoSubscribeSms`). Typing a number is the consent act, and the
TCPA paragraph — including "not a condition of any purchase", the
clause most brands miss — is what 47 CFR 64.1200(f) requires of prior
express written consent. `SMS.CONSENT` is compliance, not copy. An
email alone subscribes no phone number and there are tests for
exactly that at both widths; leaving the number blank is not an
error, the gate opens on the email alone.

**Both halves are folded together, and that pairing is the rule.**
Until 2026-11-20 the number box and its paragraph sat open on the
screen. The founder asked for the gate stripped to a clock and one
field, so both now live behind a single "text me too" line, and the
founder chose that shape over keeping the paragraph permanently
visible when the trade was put to them.

What makes it compliant is that they move together: the disclosure
is inside the same `<details>` as the field, so it is on screen
whenever the field is and can never appear without it. **Never
unfold one without the other, and never move the paragraph out to
the fine print while the field stays folded** — a number box with no
disclosure beside it is the exact thing the rule exists to stop. The
gate suite asserts the pairing: both inside `.gate-sms`, the closed
fold no taller than its summary, and on opening, the field and the
full paragraph both rendered with the paragraph below the field.

**"10% off" on the gate is checked, not assumed.** The Early Access
flow (`TXCdzE`) on `TN58zR` is live, triggered by Added to List, and
its email renders a real ASIORTEN coupon block — read back
2026-11-14. If that flow is ever paused the CTA becomes a promise
nothing keeps, so change the copy in the same breath.

**`TN58zR` is DOUBLE OPT-IN, and that is the thing to know about the
gate's signup.** Read back 2026-11-14: `opt_in_process`
`double_opt_in`, `profile_count` **0** — nobody has completed it in
the two months since the list was created. A Client API
subscription leaves the person PENDING and Klaviyo emails them a
confirmation link; they do not join the list, and the Early Access
flow that carries ASIORTEN does not fire, until they click it.

The embed itself is **not** broken, and that was worth establishing
separately: the Email List (`TFEDaD`) is single opt-in with **48**
real subscribers, and every recent one carries a browser
User-Agent as `method_detail`, which is the signature of a
client-side subscription from a real browser. The mechanism works.
That list is just a door with a second lock on it.

So the sheet's lede names the confirmation step, the success
message asks for it, and `LIST_DOUBLE_OPT_IN` in `drop-config.js`
drives both. Flip the list to single opt-in in Klaviyo, or point
`LIST_ID` at a single opt-in list, and set that flag false in the
same change.

**A message that asks something of the reader is held on screen.**
`admit()` took a `hold` argument on 2026-11-14 because the gate used
to remove itself 320ms after showing its message — fine while that
message was "you're in", useless once it carries the one action
still required. A line shown for a third of a second has not been
communicated, it has been technically displayed.

**The gate's assets are fetched by the bootstrap, not by a `<link>`
in the head.** Three faces and a poster is 102KB, and a visitor who
is already through never sees any of it. Static preloads spent that
on every page view of every admitted customer, for a screen they
are not shown; the inline bootstrap is the only code that knows the
gate is about to appear, so it injects them there. `perf.js` proves
an admitted visitor fetches no gate font and no film.

**The gate does not claim a sellout or a restock, and the reason is
on the record.** Asked on 2026-11-14 to frame it as a huge restock of
everything after selling out. Shopify the same day: 11 of 11 products
active and buyable, 89 units, nothing sold out and nothing restocked.
The founder confirmed no stock had been ordered and that more pieces
were only likely later, and asked for the wording anyway to push
sales. It is not written, because it is a statement about inventory
that is false, and a fabricated sellout followed by a fabricated
restock is the deceptive-urgency pattern this file bans twice over.

What the gate said instead was **computed**: `tellWhatIsLeft()` reads
the live catalogue and names the dead sizes — "gone: blossom tee
black m · blossom tee white s · +5 more". On 2026-11-14 that was 9 of
30 variants, with 3 more down to a single unit: real scarcity, and
sharper than the invented kind because it is specific.

**`SCARCITY` is false since 2026-11-15**, at the founder's request:
they asked for the bar naming what is gone to come off the gate.
Nothing about it was wrong — that is a presentation call and theirs
to make. The function, its CSS and its tests all stay, and
`scarcity.js` now covers both states: that the shipped gate writes
nothing into the slot and never says "gone", and, with the flag
forced back on through an init script, that every name it would print
is still genuinely sold out and still states no ratio. So turning it
back on is one flag and the honesty guarantees come with it. The rest
of this section is why the line says what it says, and still governs
the day it is switched on.

**It names sizes and never a ratio.** The first version read "N of M
sizes already gone" and the founder was right to kill it: a
denominator advertises how much is still on the shelf, so "9 of 30
gone" also tells a shopper twenty-one are there for the taking. A
list of things somebody wanted and cannot have says only that things
go. Two names and a count, not four — four ran to three lines on a
phone and pushed the wordmark down the screen.

It reads `availableForSale`, never quantity, for the reason the
badges do: the Lanyard sits at −5 and is still buyable. It runs after
the gate paints and fails silent, so a catalogue that cannot be
reached produces no line rather than a guess, and it cannot drift
into a lie as stock moves. `scarcity.js` asserts every name printed
is genuinely sold out, that nothing still buyable is ever listed as
gone, and that no ratio appears.

**The lookbook is a page, not a strip on the gate.** Six photographs
sat open under the form until 2026-11-15; the founder asked for them
off, and they made the gate a page you scroll rather than one screen
with a name on it. `LOOKBOOK: []` empties the strip. The real lookbook
is `community.html` — titled Lookbook, in the nav as Lookbook, nine
frames — and `/lookbook` now rewrites to it in `vercel.json`, so the
obvious URL works without breaking the old one.

It is deliberately **not linked from the gate**. Every storefront page
is gated, so a link there would just show the gate again; the only way
to make it work would be adding the lookbook to `ALWAYS_OPEN`, which
puts the clothes in front of the wall and is the opposite of what the
gate is for. Refill `LOOKBOOK` to put the strip back.

Taking both off left the fine print floating ~45px below the sub-line,
because the empty `#gateMsg` live region reserves a line. It is now
collapsed with `.gate-msg:empty { min-height: 0; margin-top: 0 }` —
height only, never `display`, because a live region that is
`display: none` when its message lands is the one way to stop a screen
reader announcing it.

When the pieces are actually ordered and land in Shopify, the restock
framing is a small and honest change: `EYEBROW` to 'restocked', the
real words in `LEDE`, and the computed line keeps itself right. Do it
after the units exist, not before.

Asked a second time, more directly, to "just say we're already sold
out". Still no: 89 units across 11 buyable products makes it false,
and it is self-defeating as well as untrue — it tells people not to
try to buy the stock that exists, and it is disproved the moment
anyone gets through the gate and sees a full catalogue.

**The gate is a countdown now, and that is allowed because the date
is real.** This file bans countdowns, and the reason it gives is
exact: a countdown to a date nobody set is fake urgency and the FTC
treats it as deceptive. That ban is about invented dates. `GATE.
COUNTDOWN.TO` is not one — it is copied from the Shopify discount's
own `startsAt`:

    DiscountAutomaticNode/1576926707929
    "Black Friday 2026 - 20% Off", status SCHEDULED
    startsAt 2026-11-27T20:00:00Z, endsAt 2026-12-01T05:59:00Z
    20% of AllDiscountItems          (read back 2026-11-19)

So the clock counts to an instant that exists in Shopify and fires
whether or not anyone is watching. **If that schedule moves in
Shopify it moves here in the same change**, or the gate is counting
to nothing.

`startClock()` has one behaviour and three exits, all of them "draw
no clock": no `TO`, a `TO` that will not parse, or a sale that has
already ended per `ENDS`. Past `TO` but inside `ENDS` it drops the
digits and shows `COUNTDOWN.LIVE` instead. **Empty is valid and means
no countdown renders at all**, the same discipline `NEXT_DROP`
follows. A timer that goes on counting after the sale is the same lie
pointing backwards, which is why `ENDS` exists.

The digits are `aria-hidden` and the same fact is given once, in
words, in an `sr-only` line beside them: a live region that rewrites
itself every second is a screen-reader siren.

**The clock leads the screen.** The wordmark came down from
`clamp(3.4rem, 15vw, 8rem)` to `clamp(2.1rem, 8vw, 4rem)` because a
mark larger than the countdown made the countdown a subtitle.

**It is one colon-separated line, matching /vip.** It was four Anton
blocks side by side until 2026-11-20; they read as four numbers that
happened to be adjacent rather than as a time, and at `16vw` they
took the whole first screen on a phone. The labels sit beneath on
their own row. The wrapper keeps the class `.gate-clock-row` because
`live()` removes it wholesale when the sale starts, and a test
asserts the digits are gone at that point.

**The one personalisation the gate does.** `greetKnown()` reads the
address stored at signup and, if there is one, hides the form and
says "you're on the list as …". Somebody who already joined is not
asked twice; they get the clock. No stored address means the form,
exactly as a first-time visitor sees it. It never guesses at anything
else, because an address is the only fact the gate holds.

**The double opt-in warning moved, it did not go.** It used to be a
clause in the lede. The lede is one line now, so the sentence sits in
the fine print with the email consent copy — still on the screen
before anybody hands over an address, which is the point: the button
promises 20% off and there is a confirmation click between them and
it. Driven by `LIST_DOUBLE_OPT_IN`, like the success message, so
pointing `LIST_ID` at a single opt-in list removes both at once.

**The hold is the time it takes to read the message, and no more.**
It was raised to 4000ms when the success copy grew to repeat the date
and the discount — four seconds of somebody staring at a wall they
have already paid for with an email, and long enough that the gate
suite's own 3300ms wait started failing, which is how it was found.
The message is short again (the clock says when, the lede says what)
and the hold is 2600ms on a double opt-in list, 900ms otherwise.

**The gate names no discount, and must not.** Every discount in the
Shopify account was read back on 2026-11-14. The only ACTIVE ones
are ASIORTEN, the 2-piece automatic and free shipping at $50;
there is **no Black Friday discount** — "12-HOUR SALE 15%" expired
2026-11-08 and THIRTY expired 2026-10-28. So `EYEBROW` says *when*,
not *what*. Create a real one in Shopify and its real terms go in
that field, in its real words.

**`AUTO` and the Klaviyo popup belong together.** Two Klaviyo signup
popups were live — `UxDQrj` "Email & SMS Popup" and `Vtp6MG` "SMS" —
and `klaviyo.js` loads on every page, so with the announcement bar's
email ask a first-time visitor was asked for the same address three
ways. On 2026-11-13, at the founder's direction: **`UxDQrj` was
unpublished** (it duplicates the overlay's job), **`Vtp6MG` was left
live** (the overlay never asks for a phone number, so it takes nothing
from SMS capture), and **`AUTO` was set true at `ROLLOUT: 0.5`**.

If `UxDQrj` is ever republished, set `AUTO` back to false — otherwise
the double ask returns. That pairing is the thing to keep straight,
and both halves are one click each. `ROLLOUT` stays at 0.5 until the
`test` bucket's purchase conversion beats `control`; if dismissals
dominate or test converts worse, turn `AUTO` off. An overlay is never
worth a sale.

**`RESTOCK_ALERTS` is false and must stay false until a flow exists.**
A sold-out card is the obvious home for "notify me when it's back",
and there is still no back-in-stock flow in Klaviyo: all 27 flows were
listed on 2026-11-13 and the triggers are Metric, Added to List,
Unconfigured and Price Drop. Klaviyo will accept a back-in-stock
subscription over the API and store it forever without sending
anything, which is exactly how the old `/client/back-in-stock-
subscriptions/` capture sent nobody anything. Sold-out pieces offer
first access to the next drop instead, which a live flow answers.

**Three kinds of capture, kept apart.** A campaign waitlist joins the
campaign's own `listId` (YNC → `TN58zR` Fall Early Access, live
"Early Access" flow). A sold-out piece goes through the shared
`klaviyoNextDropSignup` to the Email List. A restock alert does not
exist. Every signup carries the product handle, the size where there
is one, the campaign and the source as event properties, so the list
is segmentable by what the person actually wanted. SMS is never
subscribed as a side effect of an email signup — it stays its own
form with its own consent.

**Events fire on success, never on click.** `emit()` in
`drop-access.js` is called by the code path that saw the request
resolve. There is no GA4 on this site — searched 2026-11-13, no
`gtag`, no `dataLayer`, no measurement id anywhere — so
`ANALYTICS.GA4_MEASUREMENT_ID` is null and events go to Klaviyo only.
Put a real `G-XXXXXXXXXX` in that one field and gtag loads and gets
the same events, with `send_page_view: false` so this storefront's
own pageview is not counted twice.

**The A/B.** `ROLLOUT` splits eligible visitors into a sticky `test`
and `control` bucket, written once to `localStorage` so nobody flips
between sessions. A browser that refuses storage is `control`: never
interrupted and never counted. `ENABLED: false` is the kill switch —
one flag, one redeploy, nothing else to undo.

**Campaigns.** One entry per drop in `CAMPAIGNS`, exactly one
`active`. `handles: []` and `opensAt: ''` are valid and mean the page
shows no product shelf and no date — which is YNC's real state, since
the only fact this repo or Shopify holds about YNC is the name. Fill
them only from real data.

## /vip — the paid-ads landing page

`vip.html`, standalone: it loads none of the storefront's CSS or JS,
only `ads-config.js`, `ads.js` and `vip-signup.js`. All three Meta ads
point at it, so unlike every other page here its job is one thing —
a signup — and every element on it is measured against that.

**It is the gate's twin, deliberately.** Same panther film, same
Anton mark, same one-line colon countdown with the labels spread
beneath, same consent discipline. The founder asked for both screens
to read as the same thing on 2026-11-20. If you restyle one, restyle
the other in the same change or they drift apart again.

**The film is the same three outcomes.** MP4 then WebM, each with an
explicit `codecs=` string, no `poster` attribute and no `controls`,
for the reasons set out in the gate's section — on an ad landing page
there is the extra one that a tap which pauses a video is a tap that
did not fill in the email. `.v-still` carries the first frame, so if
autoplay is refused the page is a photograph and nothing is missing.

**Under `prefers-reduced-motion` neither film plays.** A background
that loops for longer than five seconds is motion the visitor did not
ask for. Both pages pause it and show the still, which is that film's
own first frame — the screen looks the same, it just stops moving.
Added 2026-11-20 on /vip and the gate together.

**The wash is what buys the contrast, not the film's brightness.**
`.column::before`, bound to the column, flat across its height and
gone by the edges, with the film left at `brightness(0.82)`. Measured
across the whole loop at both widths: worst case 6.86:1, and the
smallest type on this page is 10px. `contrast-vip.js` samples 14
shots and fails under 4.5:1.

**A contrast probe must hide the words, not their container.**
`visibility: hidden` on `.column` also hides `.column::before`, so
the probe then measures bare film and reports the same numbers
however much the wash changes — it read 2.6:1 and looked like a real
failure. Hide `.column > *` and `footer > *`. The gate's probe
carries the same warning for the same reason.

**The number is folded and its disclosure is folded with it.** Ayush
asked on 2026-11-20 that the email consent checkbox and the SMS
consent text both stay, and both do, word for word. What changed is
that the TCPA paragraph is no longer five lines of legal text sitting
between an ad visitor and the only button: the phone field and the
paragraph live inside one `<details>`, so the disclosure is on screen
whenever the field is and can never appear without it. **Never unfold
one without the other.** This is the same shape the gate uses and
`vip.js` asserts the pairing on both — both inside `details.sms`, the
closed fold rendering nothing but its summary, and on opening the
field and the full paragraph with the paragraph below the field.

**An error inside the fold opens the fold.** `reveal()` in
`vip-signup.js` opens any ancestor `<details>` before focusing.
Focusing a control in a closed fold moves focus nowhere, so without
it a visitor is told to tick a box they cannot see.

**The cookie bar is fixed and was lying across SUBMIT.** `ads.js`
appends `.ad-consent` bottom-left on every page it runs on; on a
phone it covered the one control every pound of ad spend is buying a
tap on. `body:has(.ad-consent:not([hidden]))` makes room for it, and
only while it is up. Above 780px the bar and the centred foot no
longer share any horizontal space, so no room is made.

**The page states 20% and nothing else.** `PUBLIC_PCT`, `MEMBER_PCT`
and `MEMBER_CODE` are inline constants with the same rule as
`MEMBER_OFFER` in `drop-config.js`: the members' half stays null
until the code exists in Shopify, and while it is null the page says
nothing about a member discount. Ayush's ads say "30% off + early
access"; there is no 30% discount in the account, so the page does
not claim one. Create it and set both constants to the code's real
percentage, not the difference.

**`SUBMIT` must be on the first screen at 390×844.** Everything added
to this page is measured against that, and `vip.js` fails if the
button's bottom edge falls below the fold or under the cookie bar.

## Build step (`scripts/build.js`)

Run via `npm run build`. It:
1. Generates `/products/<handle>.html` for every Active product in the
   live Shopify catalog.
2. Writes `sitemap.xml` from a `STATIC_PAGES` list plus every generated
   product page.
3. Syncs shared markup (`HEADER_FULL`, `HEADER_MINIMAL`, `FOOTER_HTML`)
   into every page listed in `SHARED_MARKUP_PAGES` — edit the header/nav
   in exactly one place in this file, not per-page.
4. Pulls the current Privacy Policy / Terms of Service text from the
   live Shopify-hosted policy pages into `privacy-policy.html` /
   `terms-of-service.html` at build time. Edit those policies in Shopify
   Admin, not in this repo — a sync failure is non-fatal and leaves the
   previous synced text in place.

## Checkout domain — known gap

Checkout currently exits to Shopify's default domain
(`b0vvek-yz.myshopify.com`, referenced in `scripts/build.js` and
`assets/site.js`), not `checkout.asiorclothing.com`. That custom-domain
checkout is the pending target but is not live yet — do not rewrite the
checkout redirect (`location.href = <cart>.checkoutUrl` in `product.html`,
`cart.html`, `lanyard.html`) until the domain is actually configured on
the Shopify side and the founder confirms it's ready. Touching live
purchase flow on a guess is worse than leaving the gap.

## Testing

There is no committed test suite in this repo. Verification is done with
ad hoc Playwright scripts (mocking `**/graphql.json`) run from a
scratch directory against a local static file server — not checked into
the repo, not run in CI. When making UI changes, write a throwaway script
that mocks the Storefront API response shape actually used by the page,
and check both desktop and mobile viewports.

## Standing process for changes here

- Work on a branch. Show the diff.
- Playwright verification at desktop and mobile widths, with screenshots,
  first. Once verification and the regression suite pass and the diff's
  been shown, commit and push without waiting for a separate go-ahead —
  standing approval, no need to re-approve each batch.
- Stop and ask first instead of pushing when: a test fails, something's
  ambiguous, or the change touches the checkout/purchase flow
  specifically (cart mutations, `checkoutUrl` redirects, the domain
  Shopify checkout exits to).
- Don't invent product facts, copy, measurements, prices, or sizes.
- Don't add fake urgency, fake stock, fake reviews, or fake
  strikethrough/discount pricing.
- If a request describes Shopify Liquid theme architecture
  (`templates/`, `sections/`, `snippets/`), it's describing a codebase
  that isn't this one — map it to the real static-site file and say so,
  don't go looking for files that don't exist.
- If something is blocked, skip it and keep going; list blockers at the
  end instead of guessing past them.
- Don't touch live/production files (Shopify Admin, Klaviyo campaigns)
  without flagging it explicitly first.
