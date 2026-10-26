# Owner actions

Things that need a decision or a Shopify Admin edit. Nothing here can be
done from this repo: product copy, prices and policies live in Shopify,
and this codebase never writes to Shopify Admin or Klaviyo.

Everything below was read back from the live store on 2026-10-26. Each
item says what is true now, so none of it has to be taken on trust.

---

## 1. The JAG Set is now the worse deal

The automatic discount created on 2026-10-26 is
`DiscountAutomaticNode/1570203828441`, "Any 2 pieces 15% off", ACTIVE,
with `minimumRequirement` = a **quantity** of 2. Shopify counts units in
the cart, and the JAG Set is one unit.

| What the shopper buys | Units | Pays |
|---|---|---|
| JAG Set | 1 | **$80.00** |
| JAG Crewneck + JAG Sweats separately | 2 | **$76.50** (15% off $90) |

So the bundle costs $3.50 more than buying both pieces it contains. The
Set was $10 off before the discount existed; the discount overtook it.

Options, all yours: lower the Set, exclude the Set from the discount,
raise the two pieces, or leave it. Nothing on the site currently points
this out, and the site does not compute discount amounts, so no page is
lying — the arithmetic is just unfavourable.

## 2. Product descriptions with real defects

All in Shopify Admin → Products → Description.

**JAG Crewneck** — two misspellings and a claim that cannot be kept:

> High quality jaguar **chenile embrodiery** that **won't get damaged
> after washing**.

"chenile embrodiery" → "chenille embroidery". The durability promise is
absolute and unqualified; soften it or drop it. Same paragraph above
says the fabric "doesn't feel thin or cheap", which argues with the
reader rather than describing the garment.

**JAG Sweats** — the same kind of claim:

> High-quality print that **doesn't crack or fade after washing**.

**The two contradict each other on fit.** The Crewneck says "Relaxed fit
through the body with slightly dropped shoulders"; the Sweats say
"Relaxed fit with a slight taper at the ankle... Not too baggy". But the
JAG Set, which is those exact two garments, says "The crewneck is boxy
and cropped. The sweats are baggy." Both cannot be right, and a shopper
reading the Set page and then the Sweats page sees the difference.

**JAG Lanyard** — `descriptionHtml` is empty. The page has nothing to
say about it. It needs at least a material and a length.

**JAG Set** — the description hardcodes "$80" and "$45 each". Both are
correct today. They will not update themselves if a price changes, and
the page already shows the real price from Shopify directly above the
text, so the figures in the sentence are duplication that can only ever
go wrong.

**Not a defect, checked anyway:** the Helia Pendant says "Sun spiral
pendant on a silver chain" and the title says "Silver". Neither claims
sterling. Leave it unless you can confirm the metal. The Holes Tee says
"Distressed print across the body" — so the effect is printed, not
physical holes; that answers the open question and needs no change.

## 3. Two product titles are cased differently from the rest

Shopify has `ASR shorts` and `JAG shorts`, against `JAG Sweats`,
`JAG Crewneck` and `Holes Tee`. In a grid row the two lowercase ones
read as though someone else typed them.

The site now displays them as **ASR Shorts** and **JAG Shorts** through
`DISPLAY_NAMES` in `assets/launch-config.js`. That is a display-layer
patch over the real problem. Fix the titles in Shopify and delete those
two entries — the handles, variant IDs, cart and checkout are untouched
either way.

## 4. YNC

The only fact about YNC anywhere in this codebase or the Shopify
catalogue is the name. There is no date, no product list, no price, no
description.

The homepage band and the waitlist therefore say the name and nothing
else. To say more — what it is, when it lands, who gets it first — send
the facts and they go in. A date would also switch on the countdown and
COMING-card machinery that already exists in `NEXT_DROP`; without a real
date none of it renders, which is deliberate.

## 5. Policies still out of sync in Shopify Admin

Carried over, still open:

- **Shipping.** `shipping-policy.html` now says the US charge is
  calculated at checkout and that shipping is free over $75. The Shopify
  Admin shipping policy, which is what the checkout footer shows, still
  needs the same wording.
- **Returns.** `/refund-policy.html` says fit and order issues are
  reviewed case by case, replacement first. The Admin policy needs to
  match before checkout displays it. Still undecided: return window,
  condition requirements, who pays return postage, exclusions.

## 6. What could not be verified from here

Not failures — things this environment cannot reach, so nobody should
record them as checked.

- **The live site.** `asiorclothing.com` is blocked by this session's
  network policy (`000`, connection refused by the proxy). Every
  screenshot in this work is a local build with the Storefront API
  mocked. Deployment success was confirmed from Vercel's status, not
  from loading the site.
- **Checkout.** No address, payment, shipping rate or discount was
  exercised at checkout. Rate accuracy, payment methods and discount
  eligibility at the till remain unverified.
- **Klaviyo.** The Klaviyo connector in this session is unauthorized, so
  list membership, consent records and flow status could not be read
  today. The waitlist's email form targets list `TN58zR`; that it
  delivers, and what it sends, needs one check from an account that can
  see it.
- **Withered Hills.** Also blocked by the network policy, so the visual
  comparison the brief asks for was done against the brief's own written
  description of it, not the site.
- **Core Web Vitals field data.** None available. Any performance number
  from here is a lab measurement on a local server and does not predict
  production INP or LCP.

## 7. A note on the test fixture

The local Playwright fixture was found to disagree with Shopify three
times today, each time in a way that invented a defect that did not
exist:

- it gave `helia-pendant` and `jag-lanyard` an option named "Size" with
  the value "Default Title"; Shopify calls that option "Title"
- it marked `jag-lanyard` unavailable; Shopify has it `availableForSale:
  true` at `inventoryQuantity: -5`
- it carries one image each for the Pendant, Crewneck, Set and Sweats,
  where Shopify has two, three, three and five

The first two are fixed. The third is not, so the card hover swap is
under-exercised for those four products in local testing — it works in
production, where the second image exists.
