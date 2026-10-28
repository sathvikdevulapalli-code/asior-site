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
its old name so existing links don't break), `contact.html`,
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

- **Free US shipping at $75** (was $99). Domestic zone, `Free shipping`,
  $0.00, condition `TOTAL_PRICE >= 75.00`. `FREE_THRESHOLD` in
  `promo-config.js` mirrors it.
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
with the 2-piece offer. Two offers stated side by side with nothing
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
- **Free shipping over $75**, active, condition `TOTAL_PRICE >= 75.00`
  (lowered from $99 on 2026-10-26).
  This is the one shipping figure the site states outright.
- The old flat rates still exist as `(backup)` methods behind USPS, now
  $10.90/$19.90 Standard and $12.90/$34.90 Economy. They are a fallback
  if the carrier API fails, not the advertised price. The $4.90 / $6.90
  / $9.90 figures this file used to list are gone. `shipping-policy.html`
  was still publishing that retired rate card as the live one until
  2026-10-26; it now says the US charge is calculated at checkout and
  states only the $75 threshold.
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
the photograph's left edge. A `+` circle bottom-right of the image
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

**Motion.** Four effects, and nothing else. All of them off under
`prefers-reduced-motion`.

- Hero settle-zoom on load.
- Reveal on scroll: anything with `data-reveal`, and every `.product`
  card, starts faded out and 18px down (10px for the full-bleed bands)
  and settles as it comes within a screen, staggered by column.
- Card hover: the second photograph fades in with a slight zoom.
- Drawer and panel slides at 220ms (cart drawer, search panel).

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
