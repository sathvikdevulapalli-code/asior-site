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

Key pages: `shop.html` (catalog/grid), `product.html` (PDP, driven by
`?id=<handle>`, generated per-product into `/products/<handle>.html` at
build time), `cart.html`, `lanyard.html` (a standalone product page,
outside the generated set). `community.html`, `contact.html`,
`manufacturing.html`, `account.html` round out the nav.

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
- `PUBLIC_LAUNCH_TIME`, `DROP_CLOSE_TIME`: the drop's open/close instants.
  Every countdown on the site (banner, PDP buy box, etc.) reads
  `DROP_CLOSE_TIME` and only this value — if the date changes, it only
  changes here.
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
including "5% off", a welcome-signup percentage, free shipping, or
"subscriber pricing". None of those exist in Shopify.

Discount *amounts* are never computed here. Shopify rounds per line
(3 x $42.99 at 10% is 3 x $4.29 = $12.87, not $12.897), so the figure
shown must come from the Storefront cart's `discountAllocations` /
`discountCodes` or it will disagree with checkout.

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
- `reviews.rating` / `reviews.rating_count` — real Judge.me numbers.
  Four reviews exist in total. If ratings are shown at all, every one
  is shown including the 1.0: suppressing negative reviews is an FTC
  problem, not a design choice.
- Do **not** render `shopify.fabric` or the other `shopify.*` taxonomy
  values. Those are Shopify's auto-suggestions, not verified facts.

**Shipping** (live Shopify config, 2026-10-05) lives in
`assets/promo-config.js`:
- Dispatch 1–2 business days. That is handling time, not delivery.
- US rates: Economy $4.90 (0–5 lb), Standard $6.90 (0–1 lb) / $9.90
  (1–5 lb). Transit: Economy 5–8 business days, Standard 3–4. Each
  transit time belongs to its own rate and may not be quoted next to a
  different one.
- **No country count may be stated anywhere.** Delivery zones are active
  for 244 countries, the policy text still says "US only for now", and
  the founder has not decided which is true. Until he does, the site
  says nothing about where it ships beyond the US rates above.

**Support email** is one address site-wide, from `SUPPORT_EMAIL` in
`scripts/build.js`. It is Shopify's contact address. Do not switch it to
`hello@` until someone confirms that inbox is read.

**No refund policy exists** — not in Shopify, and `/refund-policy.html`
is a 404 — while product copy promises 14-day returns. Returns copy is
gated on the real policy existing; see `RETURNS_POLICY_PUBLISHED` in
`scripts/build.js`.

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
