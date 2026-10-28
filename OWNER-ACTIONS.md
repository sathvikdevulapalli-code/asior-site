# Owner actions

Things that need a decision or a Shopify Admin edit. Nothing here can be
done from this repo: product copy, prices and policies live in Shopify,
and this codebase never writes to Shopify Admin or Klaviyo.

Everything below was read back from the live store, on 2026-10-26
unless an item says otherwise. Each item says what is true now, so none
of it has to be taken on trust.

---

## 000. Higher-resolution originals (2026-10-28)

The full-bleed photographs cannot be made sharp on a retina laptop from
what is in the repo. Measured as served file pixels over device pixels,
where 1.0 is exactly sharp:

| | source in repo | 390 @3x | 1024 @2x | 1440 @2x | 1920 @1x |
|---|---|---|---|---|---|
| Hero (shorts duo) | **1536px** | 1.31 | 0.75 | 0.53 | 0.80 |
| Campaign band | 1717px | 1.37 | 0.84 | 0.60 | 0.89 |
| Story band | 1717px | 1.37 | 0.84 | 0.60 | 0.89 |

Phones are fine. Everything from a 1024 retina screen up is soft, and
no amount of markup fixes it: the pixels are not in the files.
Upscaling is banned and would not help anyway.

**What is needed:** a 4000px-wide export of three photographs —

1. the hero (two models on the steps, the one sent by email as
   1536x2304)
2. `OLI04001` (the campaign band)
3. `OLI04155` (the story band)

Pixieset originals are 4000x6000, so these exist; the copies in
`images/originals/` are only 1717x2576. Drop the full-size files in and
the variants regenerate from them.

Note the hero is the *weakest* image on the site at 1536px, below even
the 1717px originals, because it came in as an email attachment rather
than from the shoot.

## 00. Kill THIRTY before the ads run (2026-10-28)

Read back from the live store today. Seven discounts are ACTIVE:

| Code | Off | Risk |
|---|---|---|
| **THIRTY** | **30%** | **a dictionary word anyone can guess** |
| ASIORTEN | 10% | intended, the only code the site names |
| AFFILIATE x2 | 5% | random 8-character codes, not guessable |
| SIGNUP x2 | 5% | random 8-character codes, not guessable |
| Any 2 pieces 15% off | 15% | automatic, intended |

**THIRTY is the one that matters.** It is a plain English word, active,
30% off, and nothing stops a visitor typing it into the checkout. Send
paid traffic at the store with that live and some of it will find it.
The AFFILIATE and SIGNUP codes are random strings like `JDHF4DCC`, so
they only leak if someone shares them — lower priority, same fix.

None of these is named anywhere on the site; this is purely a Shopify
Admin cleanup. The site has no way to stop a code being typed at
checkout, so it cannot be fixed from this repo.

## 0. Six product photos to upload (Ayush, 2026-10-27)

The banner is done in this repo. The six **product** photos cannot be:
product images live in Shopify, and this codebase never writes to
Shopify Admin. They need uploading by hand, with the
alt text below set on each media item — the site reads `altText` from
Shopify and falls back to the product name, so it is not something the
repo can supply.

Upload the **originals**, not compressed copies. The site requests
resized WebP variants from Shopify's CDN (`w400`/`w800`/`w1200`), so
compressing before upload only loses quality. That is the opposite of
the banner, which is served from this repo and so was compressed here.

Shopify appends new media to the end, which is what "don't remove or
reorder the existing photos" asks for, so no reordering is needed.

| Product | File | Alt text to set |
|---|---|---|
| Asior Polo | `asior-polo-stone-wall.jpg` | Two models against a stone wall in the black Asior polo |
| Asior Polo | `asior-polo-steps.jpg` | Two models on concrete steps in the black Asior polo and black Asior shorts |
| JAG Set | `jag-set-crewneck-sweats.jpg` | Model in the grey Asior crewneck and matching sweatpants |
| Holes Tee | `holes-tee-trees.jpg` | Model in the black Asior holes tee, leopard pattern showing through |
| JAG Shorts | `jag-shorts-steps.jpg` | Two models on concrete steps in grey Asior shorts with a leopard side stripe |
| ASR Shorts | `asr-shorts-steps.jpg` | Two models on concrete steps in black Asior shorts with a tonal leopard print |

**Two things worth knowing before you upload.**

*Ayush's numbering does not match the order the photos were attached.*
The email asks for "photo 5" as the banner and describes it as the two
models on concrete steps in grey shorts — but the fifth attachment is
the stone-wall polo shot. Every photo was matched by its description
instead, which is unambiguous, and the product list cross-checks it:
item 5 says JAG Shorts gets the same photo as the banner, and that is
the grey-shorts shot. The descriptions and the cross-reference agree,
so the number is the part that is wrong. Worth a reply to Ayush before
anyone works from those numbers again.

*The Holes Tee photo disagrees with its Shopify description.* The
description reads "Distressed print across the body". The photograph
shows actual cut-out holes with a leopard-patterned layer visible
through them, which is not a print. This is the open question from the
earlier audit, and the photo answers it — but confirm the construction
before rewriting the description, and fix it at the same time as the
other description defects below.

A smaller one: the JAG Set and JAG Crewneck currently lead with
hash-named PNGs rather than shoot photography, so the new crewneck
photo will sit behind one in the grid tile. Making it the tile means
reordering, which Ayush asked not to do — so it is left alone. Say the
word if you want it promoted.

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

---

## Ad landing URLs (2026-10-28)

Stock read from Shopify today. Best-stocked, every size buyable:

| Product | Units | URL |
|---|---|---|
| ASIOR Polo | 14 | `https://asiorclothing.com/products/scripture-polo.html?utm_source=meta&utm_medium=paid&utm_campaign=fall-sellout&utm_content=scripture-polo` |
| Holes Tee | 10 | `https://asiorclothing.com/products/holes-tee.html?utm_source=meta&utm_medium=paid&utm_campaign=fall-sellout&utm_content=holes-tee` |
| JAG Sweats | 10 | `https://asiorclothing.com/products/jaguar-sweats.html?utm_source=meta&utm_medium=paid&utm_campaign=fall-sellout&utm_content=jaguar-sweats` |

Home and shop:

- `https://asiorclothing.com/?utm_source=meta&utm_medium=paid&utm_campaign=fall-sellout&utm_content=home`
- `https://asiorclothing.com/shop.html?utm_source=meta&utm_medium=paid&utm_campaign=fall-sellout&utm_content=shop`

Note: JAG Sweats is not in the Fall collection, so under a
`fall-sellout` campaign the honest Fall alternatives are ASR Shorts (9)
and JAG Shorts (9). The Helia Pendant has the most units of anything
(15) but it is an accessory, not a piece to lead an ad with.

These UTMs survive the whole way: they are captured first-touch on
landing and written onto the Shopify cart as attributes, so they appear
on the order. Verified end to end against a mocked Storefront API on
2026-10-28 — `cartCreate` carried
`utm_source=instagram, utm_medium=paid, utm_campaign=fall-sellout`.
