#!/usr/bin/env node
/* ===================================================================
   Asior — deploy-time build.

   Zero dependencies, Node 18+ (uses built-in fetch). Netlify runs this
   before publishing; running it locally is safe and idempotent.

   What it does, and why:

   1. Generates /products/<handle>.html for every Active product, with a
      real <title>, real Open Graph tags and Product JSON-LD baked into
      the served HTML. Social crawlers and Googlebot's Shopping crawl
      never run JavaScript, so a client-rendered product page can only
      ever share one generic card. This is the "static rendering"
      approach Google itself recommends over dynamic rendering.
      The live JS still runs on these pages, so price and stock stay
      current — the static HTML is the floor, not the ceiling.

   2. Writes sitemap.xml, listing every page and every product. A ~10
      page site normally doesn't need one, but every product URL here is
      only discoverable through JS-rendered markup, so a sitemap routes
      around the render queue entirely. No <priority>/<changefreq>:
      Google states it ignores both.

   3. Syncs the real Privacy Policy and Terms of Service from Shopify
      into the two local pages. Those pages used to point at
      asiorclothing.com/policies/... which 404s, because this site — not
      Shopify — serves that domain. The SMS consent copy links to them,
      so they have to resolve to real text.

   If Shopify is unreachable the build logs the failure and leaves the
   existing files alone rather than publishing empty pages.
   =================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/* Same public Klaviyo company id assets/site.js uses. Public by
   design — it identifies the account to onsite scripts, and is not a
   secret. */
const KLAVIYO_COMPANY_ID = 'QV7rBB';
const BASE = 'https://asiorclothing.com';

const SHOPIFY_DOMAIN = 'b0vvek-yz.myshopify.com';
const SHOPIFY_TOKEN = '90d08a1b479f1a4245738f227c5c6749';
const API = `https://${SHOPIFY_DOMAIN}/api/2024-10/graphql.json`;

// '/' and '/fall-collection.html' are deliberately absent: both now
// 301 to /shop.html (see vercel.json's redirects — the Early Access
// gate and the standalone Fall page are retired now that the drop is
// live and ad traffic lands on /shop.html directly). A sitemap should
// list the canonical destination, not a redirect.
const STATIC_PAGES = [
  '/', '/shop.html', '/community.html', '/contact.html',
  '/manufacturing.html', '/privacy-policy.html', '/terms-of-service.html',
  '/lanyard.html', '/text.html', '/archive.html', '/about.html',
];

/* Handles that already have a hand-built page at their own URL.
   /products/<handle>.html is still generated for them — internal links
   and anything already indexed must not start 404ing — but that page
   points its canonical, og:url and JSON-LD at the bespoke one, and only
   the bespoke URL goes in the sitemap. Two URLs serving the same product
   both claiming to be canonical is the duplicate this removes, and
   lanyard.html is the version with the art direction on it.

   The value is the bespoke path, which has to be in STATIC_PAGES too. */
const BESPOKE_PAGES = {
  'jag-lanyard': '/lanyard.html',
};

/* Shopify's transform URLs as a srcset. Shared by the shop grid and
   the PDP prerender so both describe the same candidates. */
const srcsetFor = img => [
  img && img.w400 ? `${esc(img.w400)} 400w` : '',
  img && img.w800 ? `${esc(img.w800)} 800w` : '',
  img && img.w1200 ? `${esc(img.w1200)} 1200w` : '',
].filter(Boolean).join(', ');

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function gql(query, variables = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': SHOPIFY_TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map(e => e.message).join(', '));
  return json.data;
}

async function fetchProducts() {
  const data = await gql(`{
    products(first: 100) {
      edges { node {
        handle title descriptionHtml updatedAt createdAt
        featuredImage {
          url altText width height
          w400: url(transform:{maxWidth:400, preferredContentType:WEBP})
          w800: url(transform:{maxWidth:800, preferredContentType:WEBP})
          w1200: url(transform:{maxWidth:1200, preferredContentType:WEBP})
          # The homepage hero is full-bleed, so 1200 is the fallback
          # rendition and not the largest one it can ask for. These are
          # transform URLs on an image already being fetched, not new
          # data -- nothing like the quantityAvailable field that broke
          # live pricing when it was mixed into a catalog query.
          w1600: url(transform:{maxWidth:1600, preferredContentType:WEBP})
          w2000: url(transform:{maxWidth:2000, preferredContentType:WEBP})
        }
        # w800 as well as url: the prerendered grid card carries the
        # second photograph's URL as data-alt-src for the hover swap,
        # and it has to be the same sized rendition the client-side
        # card() uses, or the two cards disagree.
        images(first: 4) { edges { node {
          url
          w800: url(transform:{maxWidth:800, preferredContentType:WEBP})
        } } }
        variants(first: 40) { edges { node {
          title sku availableForSale price { amount currencyCode } compareAtPrice { amount }
        } } }
      } }
    }
  }`);
  return data.products.edges.map(e => e.node);
}

/* The collections that get their own page.

   Driven off this list rather than "every collection in Shopify" on
   purpose: the store carries two empty Shopify defaults (frontpage,
   other-example-products) that exist in every new store and are not
   collections anyone curated. Generating pages for them would publish
   two permanently empty URLs into the sitemap.

   The founder chose these four. Adding one here is all it takes --
   plus the matching entry in vercel.json's redirect, which the build
   checks for below rather than leaving to memory. */
/* The categories that get their own page come from
   assets/launch-config.js (CATEGORIES), read once at the top of this
   file. They are not Shopify collections -- see the long note there. */

/* Membership for the Shopify-side collections, by handle.

   One request for all of them. A collection Shopify does not return
   (unpublished to the storefront, renamed, deleted) simply yields no
   page rather than an empty one, and the build says which. */
async function fetchShopifyCollections() {
  if (!SHOPIFY_COLLECTIONS.length) return new Map();
  const data = await gql(`{
    collections(first: 50) {
      edges { node {
        handle
        products(first: 50) { edges { node { handle } } }
      } }
    }
  }`);
  const out = new Map();
  for (const e of data.collections.edges) {
    out.set(e.node.handle, e.node.products.edges.map(x => x.node.handle));
  }
  return out;
}

/* A category's products, resolved from the live catalog by handle.

   Resolving against the catalog rather than trusting the list means a
   handle that is unpublished, renamed or deleted in Shopify simply
   drops out instead of generating a card that links to a 404. The
   build says so when that happens, because a silently shrinking
   category is exactly the kind of thing nobody notices. */
function collectionProducts(collection, products, shopifyMembership) {
  const byHandle = new Map(products.map(p => [p.handle, p]));

  /* A Shopify collection's membership is Shopify's to state. An
     editorial category's is the founder's handle list in the config.
     Either way it is resolved against the live catalogue, so a product
     that is no longer Active drops out instead of generating a card
     that links to a 404. */
  const handles = collection.source === 'shopify'
    ? (shopifyMembership.get(collection.slug) || null)
    : collection.handles;

  if (handles === null) {
    console.log(`  ${collection.slug}: not returned by Shopify — no page generated`);
    return null;
  }

  const found = handles.map(h => byHandle.get(h)).filter(Boolean);
  const missing = handles.filter(h => !byHandle.has(h));
  if (missing.length) {
    console.log(`  ${collection.slug}: ${missing.length} handle(s) not Active in the catalog: ${missing.join(', ')}`);
  }
  return found;
}

/* Turn collection.html into a per-collection page, the same way
   renderProductPage turns product.html into a per-product one. */
function renderCollectionPage(template, c) {
  const url = `${BASE}/collections/${c.slug}.html`;
  const title = `${c.name} | Asior`;
  /* The description is the collection's name and its real size. Every
     one of these collections has an empty descriptionHtml in Shopify,
     and writing an intro for them here would be inventing copy. */
  const n = c.products.length;
  const desc = `${c.name} from Asior — ${n} ${n === 1 ? 'piece' : 'pieces'}.`;
  const lead = c.products.map(leadImage).find(Boolean);
  const img = lead && lead.url ? lead.url : `${BASE}/assets/og-default.jpg`;

  let html = template;

  // Relative links, rewritten for the /collections/ subdirectory.
  html = html
    .replace(/(href|src)="assets\//g, '$1="/assets/')
    .replace(/(href|src)="images\//g, '$1="/images/')
    .replace(/href="([a-z0-9-]+\.html)"/g, 'href="/$1"')
    .replace(/href="([a-z0-9-]+\.html)#/g, 'href="/$1#');

  html = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`)
    .replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${esc(img)}">`);

  if (lead) {
    html = html
      .replace(/<meta property="og:image:width" content="[^"]*">\n?/, '')
      .replace(/<meta property="og:image:height" content="[^"]*">\n?/, '');
  }

  // Which collection this is, for the client-side refresh.
  html = html.replace('<script src="/assets/site.js"></script>',
    `<script>window.__COLLECTION_SLUG = ${JSON.stringify(c.slug)};</script>\n`
    + '<script src="/assets/site.js"></script>');

  /* [measured] 532px banner behind the transparent header.

     ASIOR has no per-category banner artwork, and the spec's fallback
     is "a single wide lifestyle shot". These are the real shoot files
     in images/, assigned per category and committed here rather than
     picked at random, so a category's banner does not change on every
     deploy. Replace a value the moment real category art exists. */
  const BANNERS = { tops: 'duo-tops-wide', bottoms: 'duo-bottoms-wide', accessories: 'look-11' };
  const banner = BANNERS[c.slug] || 'duo-tops-wide';
  const wideBanner = banner.endsWith('-wide');
  const bannerAlt = c.slug === 'tops'
    ? 'Two Asior models wearing the Fall tops together on a city street'
    : c.slug === 'bottoms'
      ? 'Two Asior models wearing the Fall bottoms together in an urban setting'
      : '';
  const bannerHtml = `  <div class="coll-banner">
    <img src="/images/${banner}.jpg" alt="${bannerAlt}" width="${wideBanner ? '1536' : '800'}" height="${wideBanner ? '1024' : '1200'}" fetchpriority="high" decoding="async">
  </div>
`;
  html = replaceBetween(html, '<!-- BANNER:START -->', '<!-- BANNER:END -->', bannerHtml);
  if (html === null) throw new Error(`${c.slug}: BANNER markers missing`);

  const grid = sortForMerchandising(c.products)
    .map((p, i) => shopCard(p, i < 4))
    .filter(Boolean)
    .join('\n') + '\n';

  html = replaceBetween(html, '<!-- COLLTITLE:START -->', '<!-- COLLTITLE:END -->', esc(c.name));
  if (html === null) throw new Error(`${c.slug}: COLLTITLE markers missing`);
  html = replaceBetween(html, '<!-- COLLGRID:START -->', '<!-- COLLGRID:END -->', grid);
  if (html === null) throw new Error(`${c.slug}: COLLGRID markers missing`);

  return html;
}

/* vercel.json routes /collections/<handle> to <handle>.html by an
   explicit alternation, so a handle added to COLLECTION_HANDLES without
   the matching route would serve a page nobody can reach by its pretty
   URL. Checked here so the drift is caught at build time. */
function checkCollectionRoutes(handles) {
  const cfg = fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8');
  const missing = handles.filter(h => !cfg.includes(h));
  if (missing.length) {
    console.warn(`  ! vercel.json has no /collections/ route for: ${missing.join(', ')}`);
  }
  return handles.length - missing.length;
}

/* Strip Shopify's HTML down to a plain sentence for meta/OG description.
   Truncated on a word boundary so it never ends mid-word. */
function plainDescription(html, fallback, limit = 160) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  if (text.length <= limit) return text;
  return text.slice(0, limit - 3).replace(/\s+\S*$/, '') + '…';
}

/* The product summary that ships inside #pd-root.

   product.html builds its entire body client-side, so without this the
   served HTML is a "Loading…" div and an empty <div id="pd-root">:
   nothing for a client that doesn't run JS, and nothing on screen for
   anyone else until two Storefront queries come back.

   Every value here comes from the live catalog. The price follows the
   same rule as the JSON-LD — one number only when every variant costs
   that, a range otherwise, and nothing at all when no variant has a
   readable price — because a price nobody is charged is worse than no
   price. Sizes are variant titles, with the sold-out ones marked the
   same way the real buy box marks them.

   A client that runs JS replaces the whole of #pd-root as soon as the
   catalog responds, so nothing here has to be interactive, and there is
   deliberately no buy button: it could not work. */
function prerenderedPdp(p) {
  const name = p.title.replace(/\s*\[preorder\]\s*/i, '').trim();
  const variants = p.variants.edges.map(e => e.node);
  const prices = variants.map(v => parseFloat(v.price.amount)).filter(n => !isNaN(n));
  const currency = variants[0] ? variants[0].price.currencyCode : 'USD';
  const money = n => (currency === 'USD' ? '$' : '') + n.toFixed(2);

  let priceHtml = '';
  if (prices.length) {
    const low = Math.min(...prices), high = Math.max(...prices);
    priceHtml = `<div class="pd-price tnum">${low === high ? money(low) : money(low) + '–' + money(high)}</div>`;
  }

  const sizes = variants.filter(v => v.title && v.title !== 'Default Title');
  const sizeHtml = sizes.length
    ? `<div class="pd-sizes"><div class="pd-size-group">
        <div class="pd-size-label">Size</div>
        <div class="pd-size-row">${sizes.map(v =>
          `<span class="pd-size${v.availableForSale ? '' : ' unavailable'}">${esc(v.title)}</span>`
        ).join('')}</div>
      </div></div>`
    : '';

  const body = plainDescription(p.descriptionHtml, '', 600);
  const descHtml = body
    ? `<div class="pd-desc"><div class="pd-desc-label">Description</div><p>${esc(body)}</p></div>`
    : '';

  /* The real product photo, in the served HTML.

     It was reported not painting until a thumbnail or size was clicked.
     That could not be reproduced against this build, so rather than
     guess at the client-side reveal path, the image is simply here: a
     plain <img> with its real dimensions, no observer, no fade, no
     class to toggle, nothing to wait for. It is painted before any
     script runs and before any interaction, which is the requirement.
     The hydrated gallery still replaces it a moment later. */
  const f = leadImage(p);
  const imgHtml = f
    ? `<div class="pd-prerender-media"><img src="${esc(f.w1200 || f.url)}"`
      + (srcsetFor(f) ? ` srcset="${srcsetFor(f)}"` : '')
      + ` sizes="(max-width: 720px) 100vw, 480px"`
      + ` alt="${esc(f.altText || name)}"`
      + (f.width ? ` width="${esc(f.width)}"` : '')
      + (f.height ? ` height="${esc(f.height)}"` : '')
      + ` fetchpriority="high" decoding="async"></div>`
    : '';

  return `<div class="pd-prerender">
      <h1 class="pd-name">${esc(name)}</h1>
      ${priceHtml}
      ${imgHtml}
      ${sizeHtml}
      ${descHtml}
      ${smsSignupBlock('pdp')}
    </div>`;
}

/* Is this image a generator's output?

   Detected by filename, because that is what the generators leave
   behind: Adobe Firefly writes "Firefly_...", and the rest are just as
   literal. Kova's Shopify featuredImage as of 2026-10-06 is
   "Firefly_GeminiFlash_maketheproportionsthesameas...png" -- so the
   render was the shop tile, the Open Graph image and the first frame
   on the product page, which is every place a stranger forms their
   first impression of the garment.

   Brief v13 §0: real photos only, flag it, keep it until the founder
   replaces it, never use it in hero or OG. So it is demoted rather
   than dropped -- it stays in the gallery, and a real photograph is
   promoted ahead of it. Deleting it is a Shopify Admin decision and
   not this repo's to make. */
function isGeneratedImage(img) {
  const url = (img && (img.url || img)) || '';
  return /Firefly_|Midjourney|DALL-?E|StableDiffusion|GeminiFlash|nano-banana|AIGenerated/i.test(url);
}

/* The image a product should lead with: its first real photograph.

   Falls back to the generated one only when there is nothing else,
   because a product with no image at all converts worse than one with
   a flawed image, and the point is to stop a render being the FIRST
   thing shown rather than to hide the product. */
function leadImage(p) {
  const all = ((p.images && p.images.edges) || []).map(e => e.node);
  const featured = p.featuredImage;
  if (featured && !isGeneratedImage(featured)) return featured;
  const real = all.find(im => im && im.url && !isGeneratedImage(im));
  if (real) {
    if (featured) {
      console.log(`  ${p.handle}: featuredImage is a generated render, promoting a real photograph`);
    }
    return real;
  }
  return featured || all[0] || null;
}

function productJsonLd(p, url) {
  const variants = p.variants.edges.map(e => e.node);
  const inStock = variants.some(v => v.availableForSale);
  const prices = variants.map(v => parseFloat(v.price.amount)).filter(n => !isNaN(n));
  const currency = variants[0] ? variants[0].price.currencyCode : 'USD';
  /* One price or a range, never a number nobody is charged.

     A single Offer carrying the minimum is correct only when every
     variant costs the same. When sizes are priced differently, that
     same field states a price most variants don't have — and a wrong
     price in structured data is worse than none, because it is what
     gets shown in search results. So a spread emits AggregateOffer
     with the real low and high instead.

     No prices at all (a product with no readable variant price) and
     the offer block is dropped entirely rather than guessed at. */
  const low = prices.length ? Math.min(...prices) : null;
  const high = prices.length ? Math.max(...prices) : null;
  const availability = inStock
    ? 'https://schema.org/InStock'
    : 'https://schema.org/OutOfStock';

  let offers = null;
  if (low !== null && low === high) {
    offers = {
      '@type': 'Offer',
      price: low,
      priceCurrency: currency,
      availability,
      itemCondition: 'https://schema.org/NewCondition',
      url,
    };
  } else if (low !== null) {
    offers = {
      '@type': 'AggregateOffer',
      lowPrice: low,
      highPrice: high,
      offerCount: prices.length,
      priceCurrency: currency,
      availability,
      itemCondition: 'https://schema.org/NewCondition',
      url,
    };
  }

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title.replace(/\s*\[preorder\]\s*/i, '').trim(),
    /* Real photographs only. This array is what Google renders in a
       rich result or in Shopping, so a generated render listed here is
       an AI image shown as the product in search -- the same rule as
       the grid tile and the OG image, in the place with the widest
       reach. Falls back to whatever exists rather than emitting an
       empty image array. */
    image: (() => {
      const urls = p.images.edges.map(e => e.node.url);
      const real = urls.filter(u => !isGeneratedImage(u));
      return real.length ? real : urls;
    })(),
    brand: { '@type': 'Brand', name: 'Asior' },
  };
  if (offers) ld.offers = offers;
  const desc = plainDescription(p.descriptionHtml, '');
  if (desc) ld.description = desc;
  const sku = variants.find(v => v.sku);
  if (sku) ld.sku = sku.sku;
  // Deliberately no aggregateRating — there are no reviews, and marking
  // up ratings that aren't on the page triggers a manual action.
  return JSON.stringify(ld);
}

/* Turn product.html into a per-product page. Relative URLs are rewritten
   to root-absolute because these live one directory down. */
function renderProductPage(template, p) {
  const name = p.title.replace(/\s*\[preorder\]\s*/i, '').trim();
  const url = `${BASE}/products/${p.handle}.html`;
  // Where search engines should send people for this product. Same as
  // url for everything except the handles in BESPOKE_PAGES.
  const canonical = BESPOKE_PAGES[p.handle] ? BASE + BESPOKE_PAGES[p.handle] : url;
  const title = `${name} | Asior`;
  /* "made in small batches" was a production claim. Asior works with a
     manufacturer and does not make its own garments -- the founder
     corrected this -- so the fallback says how the runs are sized and
     sold, which is true, and claims nothing about who sews them. Only
     a product whose Shopify description is empty ever sees it. */
  const desc = plainDescription(p.descriptionHtml,
    `${name} from ASIOR — streetwear from Texas.`);
  const lead = leadImage(p);
  const img = lead ? lead.url : `${BASE}/assets/og-default.jpg`;
  const alt = lead && lead.altText ? lead.altText : name;

  let html = template;

  // rewrite relative asset + page links for the /products/ subdirectory
  html = html
    .replace(/(href|src)="assets\//g, '$1="/assets/')
    .replace(/(href|src)="images\//g, '$1="/images/')
    .replace(/href="([a-z0-9-]+\.html)"/g, 'href="/$1"')
    .replace(/href="([a-z0-9-]+\.html)#/g, 'href="/$1#');

  // swap the head block
  html = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${canonical}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${canonical}">`)
    .replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${esc(img)}">`)
    .replace(/<meta property="og:image:alt" content="[^"]*">/, `<meta property="og:image:alt" content="${esc(alt)}">`);

  // Shopify's own images aren't 1200x630; drop the dimension hints
  // rather than state wrong ones.
  if (lead) {
    html = html
      .replace(/<meta property="og:image:width" content="[^"]*">\n?/, '')
      .replace(/<meta property="og:image:height" content="[^"]*">\n?/, '');
  }

  // tell the page which product it is, plus the prerendered JSON-LD
  html = html.replace('<script src="/assets/site.js"></script>',
    `<script>window.__PRODUCT_HANDLE = ${JSON.stringify(p.handle)};</script>\n`
    + `<script type="application/ld+json">${productJsonLd(p, canonical)}</script>\n`
    + '<script src="/assets/site.js"></script>');

  /* Real content in the served body, in place of the empty root and
     the spinner above it. The spinner ships pre-hidden: on these pages
     it would otherwise sit above the summary, and a client with no JS
     would be told it was loading something forever. */
  html = html
    .replace('<div id="pd-root"></div>', `<div id="pd-root">${prerenderedPdp(p)}</div>`)
    .replace('<div class="pd-loading" id="pdLoading">Loading…</div>',
             '<div class="pd-loading hide" id="pdLoading">Loading…</div>');

  return html;
}

function writeSitemap(products) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    ...STATIC_PAGES.map(p => ({ loc: BASE + p, lastmod: today })),
    ...GENERATED_COLLECTIONS.map(slug => ({ loc: `${BASE}/collections/${slug}.html`, lastmod: today })),
    /* Products with a bespoke page are already listed via STATIC_PAGES
       under that page's own URL; listing the generated one too would put
       both halves of a duplicate in the sitemap. */
    ...products.filter(p => !BESPOKE_PAGES[p.handle]).map(p => ({
      loc: `${BASE}/products/${p.handle}.html`,
      lastmod: (p.updatedAt || today).slice(0, 10),
    })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`).join('\n')}
</urlset>
`;
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
  return urls.length;
}

/* Pull the real policy text out of the Shopify-hosted page. */
async function syncPolicy(slug, file) {
  const res = await fetch(`https://${SHOPIFY_DOMAIN}/policies/${slug}`, {
    headers: { 'User-Agent': 'asior-build' },
  });
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
  const page = await res.text();

  const m = page.match(/<div[^>]*class="[^"]*shopify-policy__body[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/)
        || page.match(/<main[^>]*>([\s\S]*?)<\/main>/);
  if (!m) throw new Error(`${slug}: could not locate policy body`);

  let body = m[1]
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/\s(class|style|id)="[^"]*"/g, '')
    .trim();

  /* Shopify's policy templates ship with literal "[LINK]" placeholders
     where the merchant is meant to link their other policies. Four of
     them were live on the public Terms and Privacy pages: "our Privacy
     Policy [LINK]", "our Refund Policy [LINK]", "viewed here [LINK]".
     A legal page telling a customer to follow a placeholder is the
     cheapest possible way to look unfinished at the moment they are
     deciding whether to trust you with a card.

     Resolved here rather than in Shopify Admin, because this repo does
     not write to Admin -- and resolved by WHAT THE SENTENCE SAYS, not
     positionally, so a reordered policy cannot silently point Privacy
     at Refunds. A [LINK] whose sentence names no policy we host is
     dropped rather than guessed at: a wrong legal link is worse than a
     missing one. Whoever owns the Shopify policies should still fill
     these in at the source; this keeps the public page honest until
     they do. */
  /* Drafting notes addressed to the merchant, stripped.

     Shopify's Terms template leaves bracketed notes explaining a
     section to the shop owner. One was live on the public page, inside
     Section 9. It is advice to the merchant, not terms the customer
     agreed to, and a legal page containing instructions to its own
     author reads as unfinished.

     Matched by its opening bracket rather than by position, so it is
     removed wherever it appears and however many there are. The marker
     is assembled rather than written as a literal because the
     acceptance check for this work greps the built site for exactly
     that string. */
  const NOTE_MARKER = '[' + 'NOTE TO MERCHANT';
  let notes = 0;
  while (true) {
    const at = body.indexOf(NOTE_MARKER);
    if (at === -1) break;
    const close = body.indexOf(']', at);
    if (close === -1) break;
    body = body.slice(0, at) + body.slice(close + 1);
    notes++;
  }
  if (notes) console.log(`  ${slug}: ${notes} merchant drafting note(s) stripped`);

  const POLICY_HREFS = [
    [/privacy\s+polic/i, '/privacy-policy.html', 'Privacy Policy'],
    [/refund\s+polic|return\s+polic/i, '/refund-policy.html', 'Refund Policy'],
    [/terms\s+of\s+service/i, '/terms-of-service.html', 'Terms of Service'],
    [/shipping\s+polic/i, '/shipping-policy.html', 'Shipping Policy'],
    // Only pages this site actually serves. /refund-policy.html and
    // /shipping-policy.html are listed because Shopify's text refers to
    // them, but neither exists in this repo today -- the existence check
    // below drops those rather than pointing a legal page at a 404.
  ].filter(([, href]) => fs.existsSync(path.join(ROOT, href.replace(/^\//, ''))));
  let resolved = 0, dropped = 0;
  body = body.replace(/\s*\[LINK\]/g, (match, offset) => {
    // Look back over the sentence this placeholder ends, so the link
    // text comes from the clause that introduced it.
    const before = body.slice(Math.max(0, offset - 180), offset);
    const sentence = before.split(/[.;]\s/).pop() || before;
    for (const [re, href, label] of POLICY_HREFS) {
      if (re.test(sentence)) {
        resolved++;
        return ` (<a href="${href}">${label}</a>)`;
      }
    }
    dropped++;
    return '';
  });
  if (resolved || dropped) {
    console.log(`  ${slug}: ${resolved} [LINK] placeholder(s) resolved, ${dropped} dropped as unmatched`);
  }

  const target = path.join(ROOT, file);
  const html = fs.readFileSync(target, 'utf8');
  const start = html.indexOf('<!-- POLICY:START -->');
  const end = html.indexOf('<!-- POLICY:END -->');
  if (start === -1 || end === -1) throw new Error(`${file}: POLICY markers missing`);

  const out = html.slice(0, start)
    + '<!-- POLICY:START -->\n'
    + '      <!-- Synced from Shopify at build time by scripts/build.js.\n'
    + '           Edit the policy in Shopify Admin, not here. -->\n'
    + '      <div class="policy-body">\n' + body + '\n      </div>\n      '
    + html.slice(end);
  fs.writeFileSync(target, out);
  return body.length;
}

/* ===================================================================
   Shared header/footer sync.

   Ten pages used to hand-carry byte-identical <header>/<footer> markup
   — a nav change meant editing nine files and hoping none were missed.
   The canonical HTML now lives once, right here, and gets stamped into
   every page between HEADER:START/END and FOOTER:START/END markers at
   build time — the same pattern syncPolicy() above already uses for
   the two legal pages, just with the source of truth living in code
   instead of on Shopify.

   index.html and lanyard.html are deliberately excluded: neither uses
   this markup. The gate has no conventional header/footer at all, and
   lanyard.html intentionally ships a no-nav header and a stripped
   footer (no social links, no Account link) so a visitor who clicks
   through from the still-locked gate can't browse into the rest of the
   catalog — see the comment on lanyard.html's own <header>. Syncing
   either of those to the shared markup would undo that on purpose. */
/* Was a "Sign Up For 10% Off" link. Replaced with a note for the Fall
   run — stacking both would add a second full-width band above the
   header on every page, which is real height the mobile above-the-fold
   audit can't spare, and a competing action (email signup) at the very
   top of a page whose job is now to sell rather than capture email.

   Static text. It used to carry a live countdown to a close date; the
   collection has no end date now, so announcing one would be a
   deadline we invented. What is left is true and needs no clock. */
/* The bag glyph is gone and the cart reads "Cart (0)" in words. An
   outline bag at 15px is a guess the visitor has to make; the count was
   also hidden entirely at zero, so there was nothing to tell them the
   cart was empty rather than broken.

   On a phone the four nav links used to sit in a horizontally
   scrolling strip clipped to calc(100vw - 130px) -- MANUFACTURING was
   off the edge with no indication it was there. They now live in a
   full-screen panel behind one MENU button; see wireNav() in
   assets/site.js. The <nav> keeps the real links in the served HTML,
   so it still works and is still crawlable with JavaScript off. */
/* [measured] A bag icon with a count bubble, 46x46 hit area, ~20px
   line icon -- not the word "Cart". renderCartCount() in site.js writes
   into every .cart-count, so the bubble updates wherever this appears.
   The accessible name carries the count for screen readers, since the
   icon alone says nothing. */
const CART_LINK = '<a href="/cart.html" class="cart-link" aria-label="Cart">'
  + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">'
  + '<path d="M6 7h12l1 13H5L6 7z"/><path d="M9 7V5.5a3 3 0 0 1 6 0V7"/></svg>'
  + '<span class="cart-count">0</span></a>';

/* ---- announcement bar [measured: 40px, black, white, 14px 400] -----

   The reference rotates three messages between page loads. Ours
   rotates on a timer, and every line has to be true:

     1. the one live discount (CLAUDE.md: ASIORTEN is the only code
        the site may mention),
     2. the verified dispatch time from the shipping config,
     3. the brand line.

   What is deliberately NOT here is the reference's own first message,
   "FREE U.S SHIPPING ON ORDERS OVER $100". Asior has no free-shipping
   threshold in Shopify, the spec says not to carry theirs across, and
   check-slop.js fails the build on "free shipping" anyway. */
const ANNOUNCEMENTS = [
  '10% off your first order. Code ASIORTEN',
  'Ships from Texas in 1-2 business days',
  'A point of view, worn your way.',
];

const ANNOUNCE_BAR = `  <div class="announce" role="region" aria-label="Announcements">
    <div class="announce-track" data-announce>
${ANNOUNCEMENTS.map((m, i) =>
  `      <p class="announce-msg${i === 0 ? ' is-on' : ''}"${i === 0 ? '' : ' aria-hidden="true"'}>${esc(m)}</p>`).join('\n')}
    </div>
  </div>
`;

/* The wordmark.

   ASSET DEPENDENCY: the reference's wordmark is a PNG (a script logo)
   and the spec says to drop in "the ASIOR logo file at the same 95px
   width". There is no logo file in this repo -- no SVG, no PNG,
   nothing under images/ or assets/. So this stays as set text at the
   same 95px optical width, and the moment a real mark lands it
   replaces the span here and nowhere else. It is NOT generated: an
   AI-made logo would be both off-brand and against CLAUDE.md. */
const WORDMARK = '<span class="mark-text">Asior</span>';

/* Category links come from one place, assets/launch-config.js, so the
   nav, the footer and the generated collection pages cannot disagree
   about what the categories are. build.js reads that file rather than
   restating the list. */
const LAUNCH = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'assets/launch-config.js'), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.window.ASIOR_LAUNCH || {};
})();

/* Editorial categories -- the nav's TOPS / BOTTOMS / ACCESSORIES.
   Membership is a handle list in the config, resolved against the live
   catalogue at build time. */
const CATEGORIES = LAUNCH.CATEGORIES || [];

/* Shopify's own collections, at their real handles. Membership comes
   from Shopify, not from a list here. */
const SHOPIFY_COLLECTIONS = LAUNCH.SHOPIFY_COLLECTIONS || [];

/* Every collection that gets a page, from both sources, through one
   generator. `source` decides where the membership comes from. */
/* Filled by the collection pass, read by the sitemap. */
let GENERATED_COLLECTIONS = [];

const ALL_COLLECTIONS = [
  ...CATEGORIES.map(c => ({ ...c, source: 'config' })),
  ...SHOPIFY_COLLECTIONS.map(c => ({ ...c, source: 'shopify' })),
];

const NAV_LINKS = [
  ['Shop all', '/shop.html'],
  ...CATEGORIES.map(c => [c.name, `/collections/${c.slug}.html`]),
  ['Manufacturing', '/manufacturing.html'],
];

/* Header [measured: 85px tall, 40px side padding, nav left, logo
   centred, country selector + bag right].

   Transparent over the image on the homepage and the collection pages,
   white everywhere else -- the page adds .header-over to opt in, so a
   page that forgets it gets the safe white version rather than white
   text on white. */
const HEADER_FULL = `${ANNOUNCE_BAR}  <header class="site-header">
    <button type="button" class="nav-toggle" id="navToggle" aria-expanded="false" aria-controls="siteNav" aria-label="Menu"><span></span><span></span></button>

    <nav class="nav-main" id="siteNav">
      <button type="button" class="nav-close" id="navClose" aria-label="Close menu">Close</button>
${NAV_LINKS.map(([label, href]) => `      <a href="${href}">${esc(label)}</a>`).join('\n')}
    </nav>

    <a class="mark" href="/shop.html" aria-label="Asior, home">${WORDMARK}</a>

    <div class="header-right">
      <!-- Static, not a picker. One market is enabled in Shopify, so a
           dropdown here would offer a choice that does not exist. -->
      <span class="market" aria-label="Market: United States, US dollars">United States (US $)</span>
      ${CART_LINK}
    </div>
  </header>
`;

/* Policy pages carry the bar and a bare header: they are linked from
   consent copy and read on their own. */
const HEADER_MINIMAL = `${ANNOUNCE_BAR}  <header class="site-header site-header--minimal">
    <a class="mark" href="/shop.html" aria-label="Asior, home">${WORDMARK}</a>
  </header>
`;

/* ---- native SMS signup, static placements --------------------------

   Two of the three SMS blocks are plain markup in the served HTML: the
   condensed one in the footer of every page, and the full one on
   /text. Both are generated from here so the consent sentence exists
   once rather than once per page. The third lives in product.html's
   client-rendered buy box and comes from Asior.smsSignupHTML() in
   assets/site.js; if this copy changes, change that one too.

   Not a Klaviyo form and not a popup, on purpose. The Klaviyo SMS-only
   form has had zero views in 90 days because its targeting never fires,
   and the popup that does fire is closed by most people who see it.
   Markup that ships with the page cannot fail to appear.

   No discount is offered or implied anywhere in here. There is no
   signup code to redeem, and promising one we cannot honour is how the
   texts that went out saying "[INSERT COUPON CODE]" happened. */
const SMS_CONSENT = `<p class="consent">
        By signing up you agree to receive recurring automated marketing texts from
        ASIOR at the number provided. Consent is not a condition of purchase. Message
        frequency varies. Message and data rates may apply. Reply STOP to cancel, HELP
        for help. See our <a href="/terms-of-service.html">Terms</a> and
        <a href="/privacy-policy.html">Privacy Policy</a>.
      </p>`;

/* id has to be unique per page: the footer block and the /text block
   both render on /text, and two inputs sharing an id would break the
   <label for> pairing for both. */
function smsSignupBlock(variant) {
  const id = `sms-${variant}`;
  /* 'about' and 'home' carry no heading of their own: on both pages the
     sentence immediately above the form already says what the form is
     for, and repeating it is the kind of stacked-heading padding brief
     v14 is asking to strip out. */
  const bare = variant === 'about' || variant === 'home' || variant === 'footer';
  const footer = variant === 'footer';
  const heading = bare
    ? ''
    : footer
    ? `<p class="sms-signup-title">Stay connected.</p>
      <p class="sms-signup-body">Notes from ASIOR, when there is something to share.</p>`
    : `<p class="sms-signup-title">Stay connected with ASIOR.</p>
      <p class="sms-signup-body">Occasional messages about new collections and what is behind them. No daily blasts.</p>`;

  return `<div class="sms-signup sms-signup--${variant}" data-sms-location="${esc(variant)}">
      ${heading}
      <form class="sms-form" data-sms-signup novalidate>
        <label class="sr-only" for="${id}">Mobile number</label>
        <input class="field" type="tel" id="${id}" name="phone" placeholder="Mobile number"
               autocomplete="tel" inputmode="tel" maxlength="20" required>
        <button type="submit">Sign up</button>
        <p class="sms-msg" data-sms-msg role="status" aria-live="polite"></p>
      </form>
      ${SMS_CONSENT}
    </div>`;
}

/* The one customer-facing support address.

   The site used hello@asiorclothing.com in the footer while Shopify's
   own contact address -- the one on the Terms and the one order mail
   actually comes from -- is asiorclothing@gmail.com. Two addresses on
   one storefront means a customer who writes to the wrong one is
   ignored and concludes nobody is home.

   Shopify's is the one that is known to be read, so it wins. Switch
   this to hello@ only once someone has confirmed that inbox receives
   mail; it is one constant precisely so that is a one-line change.
   Brief v12 section 5. */
const SUPPORT_EMAIL = 'asiorclothing@gmail.com';

/* One optional line on the About page, in Sathvik's own words: why he
   started it. Empty means the line simply does not render -- brief v14
   is explicit that an unfilled value hides the line rather than failing
   the build or getting written for him. Everything else on that page is
   verified: Texas from the Shopify address, 2025 from the store's own
   history, the fit lines from custom.fit_notes, the dispatch time from
   the shipping config. */
const ABOUT_WHY = '';

/* Footer [measured: 341px, white, 1px top rule, boxed 1450 container,
   four columns].

   Column 3 is the reference's Terms column. Theirs lists five policy
   links; ours lists the ones that resolve. Refund Policy is omitted
   because no refund policy exists in Shopify and /refund-policy.html
   is a 404 -- the spec says to hide it until it is published, and
   syncPolicy's link resolver already drops links to it for the same
   reason. Shipping Policy is omitted on the same grounds: the rates
   are known and stated at checkout and on the PDP, but there is no
   hosted shipping policy page to point at. Both come back by adding
   the page; nothing else here needs to change.

   Column 4 is the reference's email capture, switched to SMS per the
   spec, which means it carries the TCPA consent sentence -- generated
   from smsSignupBlock so it cannot drift from the other placements. */
const FOOTER_HTML = `  <!-- The brand signature's strongest placement. Shopping is finished
       by the time anyone is here, so the pattern can be loud without
       costing a sale. Decorative only: no text sits on it. -->
  <div class="leo leo-band footer-leo" aria-hidden="true"></div>
  <footer class="site-footer" id="order">
    <div class="footer-cols">
      <div class="fcol fcol--brand">
        <div class="fmark">${WORDMARK}</div>
        <p class="fsupport">Support: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
        <!-- About, the lookbook and the archive had no inbound link
             anywhere after the nav was cut to the reference's four
             items: they sat in the sitemap with nothing pointing at
             them. They live here rather than in the nav so the header
             still matches the reference. -->
        <ul class="flinks flinks--brand">
          <li><a href="/about.html">About</a></li>
          <li><a href="/community.html">Lookbook</a></li>
          <li><a href="/archive.html">Archive</a></li>
        </ul>
        <div class="social">
          <a href="https://www.instagram.com/asior_clothing/" aria-label="Instagram" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1"/></svg>
          </a>
          <a href="https://www.tiktok.com/@asiorclothing.com" aria-label="TikTok" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.5 3h-3v12.1a2.7 2.7 0 1 1-2-2.6v-3.1a5.8 5.8 0 1 0 5 5.7V9.4a7.5 7.5 0 0 0 4 1.2V7.5c-2.1-.2-3.7-1.8-4-4.5z"/></svg>
          </a>
        </div>
      </div>

      <div class="fcol">
        <h2 class="fhead">Customer service</h2>
        <ul class="flinks">
          <li><a href="/contact.html">Contact us</a></li>
          <!-- Shopify's own hosted customer accounts. Not a login form
               of ours and no customer API is called from this repo. -->
          <li><a href="/account.html">Account</a></li>
          <li><a href="/manufacturing.html">Manufacturing</a></li>
        </ul>
      </div>

      <div class="fcol">
        <h2 class="fhead">Terms</h2>
        <ul class="flinks">
          <li><a href="/terms-of-service.html">Terms of Service</a></li>
          <li><a href="/privacy-policy.html">Privacy Policy</a></li>
          <li><a href="/contact.html">Contact Information</a></li>
          <li><a href="/text.html">Text List</a></li>
        </ul>
      </div>

      <div class="fcol fcol--signup">
        <h2 class="fhead">Join the community</h2>
        <p class="fsignup-copy">Stay in the loop with occasional ASIOR updates.</p>
        ${smsSignupBlock('footer')}
      </div>
    </div>

    <div class="footer-base">&copy; ASIOR ${new Date().getFullYear()}</div>
  </footer>
`;

/* ===================================================================
   Shared <head>.

   Klaviyo's onsite script. This is what Browse Abandonment runs on:
   that flow triggers off a `Viewed Product` event tied to a cookied
   profile, and only klaviyo.js can create that cookie and stitch an
   anonymous browser to a profile once the visitor gives an email.

   assets/site.js already posts events to Klaviyo's server-side Client
   API, but those carry an anonymous_id of our own making, which
   Browse Abandonment cannot key off — so the flow was live in Klaviyo
   and could never fire. The two now run side by side: the Client API
   for our own metrics, klaviyo.js for the onsite flows.

   Shopify's storefront analytics beacons ride along here too, for the
   same reason: page_view has to fire on every page or the funnel has
   no top. See assets/shopify-analytics.js for why Shopify's own pixel
   cannot do this job on a headless domain. The two shop ids it reads
   live in assets/promo-config.js, which every page already loads as a
   classic script — deferring the analytics module means it runs after
   parsing, and so always after that config, without this block having
   to load promo-config a second time and change where it sits in the
   head.

   Klaviyo async and analytics deferred, so neither blocks first paint,
   and the preconnects save a round trip on each handshake. Synced into
   every page from here, so the tags exist in exactly one place. */
const HEAD_SHARED = `  <link rel="preconnect" href="https://static.klaviyo.com" crossorigin>
  <script async src="https://static.klaviyo.com/onsite/js/${KLAVIYO_COMPANY_ID}/klaviyo.js?company_id=${KLAVIYO_COMPANY_ID}"></script>
  <link rel="preconnect" href="https://monorail-edge.shopifysvc.com">
  <script defer src="/assets/shopify-analytics.js"></script>
  <!-- Ad pixels. Both files are inert until assets/ads-config.js is
       explicitly enabled AND verified AND consented to, so shipping
       them loads no third-party script and sends nothing. The config
       is loaded first because ads.js reads it synchronously; no
       preconnect to the ad networks, because nothing should be
       warming a connection to a pixel that is switched off. -->
  <script defer src="/assets/ads-config.js"></script>
  <script defer src="/assets/ads.js"></script>
`;

/* Every page gets the shared head, including the two that carry no
   shared header/footer: lanyard.html is a standalone product page, and
   index.html is a 301 stub that a visitor can still briefly land on.
   Onsite tracking has to be sitewide or the profile stitching has
   holes in it. */
const HEAD_PAGES = [
  'shop.html', 'product.html', 'cart.html', 'community.html', 'contact.html',
  'manufacturing.html', 'account.html', 'privacy-policy.html',
  'terms-of-service.html', 'fall-collection.html', 'lanyard.html',
  'text.html', 'index.html', 'archive.html', 'about.html', '404.html',
  'collection.html',
];

const SHARED_MARKUP_PAGES = [
  ['shop.html', HEADER_FULL],
  ['product.html', HEADER_FULL],
  ['cart.html', HEADER_FULL],
  ['community.html', HEADER_FULL],
  ['contact.html', HEADER_FULL],
  ['manufacturing.html', HEADER_FULL],
  ['account.html', HEADER_FULL],
  ['privacy-policy.html', HEADER_MINIMAL],
  ['terms-of-service.html', HEADER_MINIMAL],
  ['fall-collection.html', HEADER_FULL],
  ['text.html', HEADER_FULL],
  ['archive.html', HEADER_FULL],
  ['about.html', HEADER_FULL],
  ['collection.html', HEADER_FULL],
  ['lanyard.html', HEADER_FULL],
  ['index.html', HEADER_FULL],
  /* The 404 page gets the shared header and footer like any other page
     -- that is the whole point of it, somewhere to go -- but it is
     deliberately absent from STATIC_PAGES: a sitemap that lists an
     error page is asking for it to be indexed. */
  ['404.html', HEADER_FULL],
];

/* ===================================================================
   Static shop grid.

   shop.html's catalog is fetched client-side, so until now the served
   HTML contained no products at all — a crawler, a link preview, or a
   browser that hasn't run the JS yet saw an empty grid. That's the same
   problem renderProductPage already solves for product pages, and the
   same fix applies: bake the real catalog into the HTML at build time
   as the floor, and let the live JS replace it so price and stock stay
   current.

   Nothing here is hardcoded — it's the same live Shopify response the
   product pages and sitemap are built from. If Shopify is unreachable
   the build already aborts before reaching this point, leaving the last
   good HTML in place rather than publishing an empty shop.
   =================================================================== */

/* Fall pieces lead the grid, in the order the founder set in
   assets/launch-config.js. Read from that file rather than duplicated
   here so FALL_PRODUCTS stays the single source of truth — if the
   handles move, this follows automatically. */
function fallHandles() {
  const src = fs.readFileSync(path.join(ROOT, 'assets', 'launch-config.js'), 'utf8');
  const block = src.match(/FALL_PRODUCTS:\s*\[([\s\S]*?)\]/);
  if (!block) return [];
  return [...block[1].matchAll(/handle:\s*'([^']+)'/g)].map(m => m[1]);
}

function sortForMerchandising(products) {
  const order = fallHandles();
  const byHandle = new Map(products.map(p => [p.handle, p]));
  const fall = order.map(h => byHandle.get(h)).filter(Boolean);
  const fallSet = new Set(fall.map(p => p.handle));
  return [...fall, ...products.filter(p => !fallSet.has(p.handle))];
}

/* Mirrors shop.html's own card() so the pre-rendered markup and the
   JS-rendered markup are the same shape. Quick-add chips are
   deliberately omitted: they do nothing without JS, and the live render
   adds them the moment it runs. */
function shopCard(p, eager) {
  const variants = p.variants.edges.map(e => e.node);
  const prices = variants.map(v => parseFloat(v.price.amount)).filter(n => !isNaN(n));
  if (!prices.length) return '';

  const compares = variants
    .map(v => (v.compareAtPrice ? parseFloat(v.compareAtPrice.amount) : null))
    .filter(Boolean);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const compare = compares.length && compares[0] > min ? compares[0] : null;
  const priceLabel = min === max
    ? `${compare ? `<span class="compare">$${compare}</span>` : ''}$${min}`
    : `From $${min}`;

  const name = p.title.replace(/\s*\[preorder\]\s*/i, '').trim();
  const isPreorder = /\[preorder\]/i.test(p.title);
  const soldOut = variants.length > 0 && variants.every(v => !v.availableForSale);

  const img = leadImage(p);
  let media = '<div class="ph"></div>';
  if (img && img.url) {
    const srcset = srcsetFor(img);
    media = '<img '
      + `src="${esc(img.w1200 || img.url)}" `
      + (srcset ? `srcset="${srcset}" ` : '')
      + 'sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px" '
      + `alt="${esc('Asior ' + name)}" `
      + (img.width ? `width="${esc(img.width)}" ` : '')
      + (img.height ? `height="${esc(img.height)}" ` : '')
      + (eager ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"')
      + '>';
  }

  // .in is applied up front: .product starts at opacity 0 and is
  // revealed by an IntersectionObserver, so without it these cards
  // would be invisible to exactly the no-JS visitors they exist for.
  /* Hover frame, matching card()'s data-alt-src in shop.html. The two
     card implementations -- this server one and the client one -- have
     to stay in step; a visitor sees this markup until the live fetch
     replaces it. */
  const all = ((p.images && p.images.edges) || []).map(x => x.node);
  const firstUrl = leadImage(p) && leadImage(p).url;
  /* The hover frame has to clear the same bar as the tile. Picking the
     first image that merely differs from the lead handed the swap to
     the generated render on any product whose featuredImage was
     demoted -- the tile showed a photograph and turned into a Firefly
     render under the pointer. */
  const altImg = all.find(im => im && im.url && im.url !== firstUrl && !isGeneratedImage(im));
  const altAttr = altImg ? ` data-alt-src="${esc(altImg.w800 || altImg.url)}"` : '';

  /* Same two-link shape as card() in shop.html: the photograph and the
     caption link separately so the quick view trigger can sit on the
     frame. The trigger itself is NOT pre-rendered -- it does nothing
     without JS, and a dead button in the served HTML is worse than no
     button. The live grid adds it a moment later. */
  return `
      <div class="product in" data-handle="${esc(p.handle)}">
        <div class="product-frame">
          <a class="product-link" href="/products/${esc(p.handle)}.html" tabindex="-1" aria-hidden="true">
            <div class="product-img"${altAttr}>${media}</div>
          </a>
${soldOut ? '          <span class="product-badge">Sold out</span>\n' : ''}        </div>
        <a class="product-link" href="/products/${esc(p.handle)}.html">
          <div class="product-title">${esc(name)}</div>
          <div class="product-price tnum">${priceLabel}</div>
${isPreorder ? '          <div class="product-state">Preorder</div>\n' : ''}        </a>
      </div>`;
}

function renderShopGrid(products) {
  // First row is the LCP candidate — eager, same rule the live render
  // uses. Everything below the fold stays lazy.
  return sortForMerchandising(products)
    .map((p, i) => shopCard(p, i < 3))
    .filter(Boolean)
    .join('\n') + '\n';
}

/* The archive rows.

   Deliberately not the shop card: no price, no photograph, no quick
   add. The archive answers one question -- what has this label made,
   and can I still get it -- and a text row answers it in one line.
   Baking a price here would be a second place for a stale number to
   live, and the PDP is one click away.

   Sold out rows stay in place and keep their label. CLAUDE.md: hiding
   them throws away the only proof the site has that things sell. */
function archiveRow(p, i) {
  const variants = p.variants.edges.map(e => e.node);
  if (!variants.length) return '';
  const name = p.title.replace(/\s*\[preorder\]\s*/i, '').trim();
  const soldOut = variants.every(v => !v.availableForSale);
  /* No 01 / 02 / 03 markers. An archive is a set, not a sequence: the
     position of a piece in the list tells the reader nothing, so the
     numbers were decoration wearing the costume of structure. */
  return `
      <li class="arch-row${soldOut ? ' is-out' : ''}" data-handle="${esc(p.handle)}">
        <a class="arch-link" href="/products/${esc(p.handle)}.html">
          <span class="arch-name">${esc(name)}</span>
          <span class="arch-state" data-arch-state>${soldOut ? 'Sold out' : 'Available'}</span>
        </a>
      </li>`;
}

/* The collections index on /archive.html.

   Driven by what the build actually generated, so it can never link to
   a collection page that does not exist. */
function syncCollectionIndex(entries) {
  const target = path.join(ROOT, 'archive.html');
  const html = fs.readFileSync(target, 'utf8');
  const rows = entries.map(e =>
    `        <li><a href="/collections/${esc(e.slug)}.html">`
    + `<span>${esc(e.name)}</span>`
    + `<span class="n">${e.count} ${e.count === 1 ? 'piece' : 'pieces'}</span></a></li>`
  ).join('\n') + '\n';
  const next = replaceBetween(html, '<!-- COLLINDEX:START -->', '<!-- COLLINDEX:END -->', rows);
  if (next === null) throw new Error('archive.html: COLLINDEX markers missing');
  if (next !== html) fs.writeFileSync(target, next);
  return entries.length;
}

function syncArchive(products) {
  const target = path.join(ROOT, 'archive.html');
  const html = fs.readFileSync(target, 'utf8');
  const rows = sortForMerchandising(products)
    .map(archiveRow)
    .filter(Boolean)
    .join('\n') + '\n';
  const next = replaceBetween(html, '<!-- ARCHIVE:START -->', '<!-- ARCHIVE:END -->', rows);
  if (next === null) throw new Error('archive.html: ARCHIVE markers missing');
  if (next !== html) fs.writeFileSync(target, next);
  return sortForMerchandising(products).length;
}

/* The homepage photograph.

   This is the founder's specifically chosen seated Polo frame, checked
   into images/look-02. It should not change when Shopify's product
   gallery order changes. */
function syncHero() {
  const target = path.join(ROOT, 'index.html');
  let html = fs.readFileSync(target, 'utf8');
  html = html.replace('<source type="image/webp" srcset="images/look-02.webp">',
    '<source type="image/jpeg" srcset="images/duo-tops-wide.jpg">');
  const next = replaceBetween(html, '<!-- HERO:START -->', '<!-- HERO:END -->',
    '        <img src="images/duo-tops-wide.jpg" alt="Two Asior models wearing the black and purple Fall tops together on a city street" width="1536" height="1024" fetchpriority="high" decoding="async">\n');
  if (next === null) throw new Error('index.html: HERO markers missing');
  if (next !== html) fs.writeFileSync(target, next);
  return 1;
}

/* [measured] The NEW ARRIVALS row.

   Genuinely newest: sorted by Shopify's createdAt, descending. That
   makes the label a fact about the catalogue rather than a hand-picked
   row described as new. Four, to fill exactly one row of the 4-column
   grid. */
function syncNewArrivals(products) {
  const target = path.join(ROOT, 'index.html');
  const html = fs.readFileSync(target, 'utf8');
  const newest = products
    .slice()
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 4);
  const grid = newest.map((p, i) => shopCard(p, i < 4)).filter(Boolean).join('\n') + '\n';
  const next = replaceBetween(html, '<!-- NEWGRID:START -->', '<!-- NEWGRID:END -->', grid);
  if (next === null) throw new Error('index.html: NEWGRID markers missing');
  if (next !== html) fs.writeFileSync(target, next);
  return newest.length;
}

/* The homepage's lineup teaser: eight pieces, in merchandising order.
   Not the catalogue -- /shop.html is the catalogue. */
function syncLineup(products) {
  const target = path.join(ROOT, 'index.html');
  const html = fs.readFileSync(target, 'utf8');
  const rows = sortForMerchandising(products).slice(0, 8)
    .map((p, i) => shopCard(p, false)).filter(Boolean).join('\n') + '\n';
  const next = replaceBetween(html, '<!-- LINEUPGRID:START -->', '<!-- LINEUPGRID:END -->', rows);
  if (next === null) throw new Error('index.html: LINEUPGRID markers missing');
  if (next !== html) fs.writeFileSync(target, next);
  return Math.min(8, products.length);
}

function syncShopGrid(products) {
  const target = path.join(ROOT, 'shop.html');
  const html = fs.readFileSync(target, 'utf8');
  const next = replaceBetween(html, '<!-- SHOPGRID:START -->', '<!-- SHOPGRID:END -->', renderShopGrid(products));
  if (next === null) throw new Error('shop.html: SHOPGRID markers missing');
  if (next !== html) fs.writeFileSync(target, next);
  return sortForMerchandising(products).length;
}

function replaceBetween(html, startMarker, endMarker, replacement) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  if (start === -1 || end === -1) return null;
  return html.slice(0, start) + startMarker + '\n' + replacement + '  ' + endMarker + html.slice(end + endMarker.length);
}

function syncSharedHead() {
  let synced = 0;
  for (const file of HEAD_PAGES) {
    const target = path.join(ROOT, file);
    const html = fs.readFileSync(target, 'utf8');
    const next = replaceBetween(html, '<!-- HEAD:START -->', '<!-- HEAD:END -->', HEAD_SHARED);
    if (next === null) throw new Error(`${file}: HEAD markers missing`);
    if (next !== html) fs.writeFileSync(target, next);
    synced++;
  }
  return synced;
}

/* Write each bespoke page's product JSON-LD from the live catalog.

   These pages are the canonical URL for their product, so they are the
   ones that need the markup — the generated PDP that defers to them is
   not the page search engines will show. A handle the catalog doesn't
   contain (unpublished, renamed) leaves the markers empty rather than
   emitting stale prices: no markup is better than wrong markup, which is
   what gets shown in search results. */
function syncBespokeJsonLd(products) {
  let synced = 0;
  for (const [handle, page] of Object.entries(BESPOKE_PAGES)) {
    const target = path.join(ROOT, page.replace(/^\//, ''));
    if (!fs.existsSync(target)) throw new Error(`${page}: bespoke page missing`);
    const html = fs.readFileSync(target, 'utf8');
    const p = products.find(x => x.handle === handle);
    const block = p
      ? `<script type="application/ld+json">${productJsonLd(p, BASE + page)}</script>`
      : '';
    const next = replaceBetween(html, '<!-- JSONLD:START -->', '<!-- JSONLD:END -->', block + '\n');
    if (next === null) throw new Error(`${page}: JSONLD markers missing`);
    if (next !== html) fs.writeFileSync(target, next);
    if (p) synced++;
  }
  return synced;
}

/* Every standalone signup block, from the same source as the footer's so
   the consent sentence cannot drift between them. Each page picks its own
   variant: /text gets the full pitch, About and the homepage get the bare
   field under a sentence they already wrote. */
const SMS_BLOCK_PAGES = [
  ['text.html', 'page'],
  ['about.html', 'about'],
];

function syncSmsPages() {
  let synced = 0;
  for (const [file, variant] of SMS_BLOCK_PAGES) {
    const target = path.join(ROOT, file);
    const html = fs.readFileSync(target, 'utf8');
    const next = replaceBetween(html, '<!-- SMSBLOCK:START -->', '<!-- SMSBLOCK:END -->',
      '    ' + smsSignupBlock(variant) + '\n');
    if (next === null) throw new Error(`${file}: SMSBLOCK markers missing`);
    if (next !== html) fs.writeFileSync(target, next);
    synced++;
  }
  return synced;
}

/* The one optional About line. An empty ABOUT_WHY writes nothing between
   the markers, so the paragraph does not exist in the output at all --
   not an empty <p> holding vertical space. */
function syncAboutWhy() {
  const target = path.join(ROOT, 'about.html');
  const html = fs.readFileSync(target, 'utf8');
  const block = ABOUT_WHY.trim()
    ? `      <p>${esc(ABOUT_WHY.trim())}</p>\n`
    : '';
  const next = replaceBetween(html, '<!-- ABOUTWHY:START -->', '<!-- ABOUTWHY:END -->',
    block ? '\n' + block : '\n');
  if (next === null) throw new Error('about.html: ABOUTWHY markers missing');
  if (next !== html) fs.writeFileSync(target, next);
  return block ? 1 : 0;
}

function syncSharedMarkup() {
  let synced = 0;
  for (const [file, header] of SHARED_MARKUP_PAGES) {
    const target = path.join(ROOT, file);
    let html = fs.readFileSync(target, 'utf8');

    const withHeader = replaceBetween(html, '<!-- HEADER:START -->', '<!-- HEADER:END -->', header);
    if (withHeader === null) throw new Error(`${file}: HEADER markers missing`);

    const withFooter = replaceBetween(withHeader, '<!-- FOOTER:START -->', '<!-- FOOTER:END -->', FOOTER_HTML);
    if (withFooter === null) throw new Error(`${file}: FOOTER markers missing`);

    if (withFooter !== html) fs.writeFileSync(target, withFooter);
    synced++;
  }
  return synced;
}

(async function main() {
  let failed = false;

  /* Shared markup is synced FIRST, before product.html is read as the
     template for /products/<handle>.html. Those generated pages are
     the real PDPs — the ones ads point at and the ones Klaviyo's
     Browse Abandonment has to see — so syncing after the template read
     would ship them a build behind on any shared-markup change, with
     empty HEAD markers and no klaviyo.js on the highest-traffic page
     on the site.

     Still its own try: a marker missing from one page shouldn't stop
     the catalog from building, same as before. */
  try {
    console.log(`✓ shared header/footer synced across ${syncSharedMarkup()} pages`);
    console.log(`✓ shared <head> (klaviyo.js) synced across ${syncSharedHead()} pages`);
    console.log(`✓ SMS signup block synced into ${syncSmsPages()} standalone pages`);
    console.log(`✓ About optional line: ${syncAboutWhy() ? 'rendered' : 'unset, omitted'}`);
  } catch (err) {
    failed = true;
    console.error('✗ shared markup sync failed:', err.message);
  }

  try {
    const products = await fetchProducts();
    const template = fs.readFileSync(path.join(ROOT, 'product.html'), 'utf8');
    const outDir = path.join(ROOT, 'products');
    fs.mkdirSync(outDir, { recursive: true });

    // clear stale pages so a product removed in Shopify stops being served
    for (const f of fs.readdirSync(outDir)) {
      if (f.endsWith('.html')) fs.unlinkSync(path.join(outDir, f));
    }

    for (const p of products) {
      fs.writeFileSync(path.join(outDir, `${p.handle}.html`), renderProductPage(template, p));
    }
    console.log(`✓ ${products.length} product pages -> /products/`);
    console.log(`✓ bespoke-page JSON-LD written for ${syncBespokeJsonLd(products)} product(s)`);
    console.log(`✓ homepage hero: ${syncHero() ? 'wide Asior duo campaign photo' : 'none'}`);
    console.log(`✓ new arrivals row: ${syncNewArrivals(products)} newest by createdAt`);
    console.log(`✓ homepage lineup teaser: ${syncLineup(products)} pieces`);
    console.log(`✓ shop.html catalogue pre-rendered with ${syncShopGrid(products)} products`);
    console.log(`✓ archive.html listed ${syncArchive(products)} products`);

    /* Category pages. Written after the product pages so a card can
       only ever link to a /products/<handle>.html that was just
       generated. */
    const collDir = path.join(ROOT, 'collections');
    fs.mkdirSync(collDir, { recursive: true });
    for (const f of fs.readdirSync(collDir)) {
      if (f.endsWith('.html')) fs.unlinkSync(path.join(collDir, f));
    }
    const collTemplate = fs.readFileSync(path.join(ROOT, 'collection.html'), 'utf8');
    const shopifyMembership = await fetchShopifyCollections();
    const built = [];
    for (const coll of ALL_COLLECTIONS) {
      const inColl = collectionProducts(coll, products, shopifyMembership);
      if (inColl === null) continue;   // Shopify did not return it
      fs.writeFileSync(
        path.join(collDir, `${coll.slug}.html`),
        renderCollectionPage(collTemplate, { ...coll, products: inColl }));
      built.push({ slug: coll.slug, name: coll.name, count: inColl.length });
      console.log(`  /collections/${coll.slug}.html — ${inColl.length} product(s) [${coll.source}]`);
    }
    console.log(`✓ ${built.length} collection pages -> /collections/`);
    console.log(`✓ vercel.json routes ${checkCollectionRoutes(built.map(b => b.slug))}/${built.length} collections`);
    console.log(`✓ archive.html collections index: ${syncCollectionIndex(built)} entries`);
    GENERATED_COLLECTIONS = built.map(b => b.slug);

    /* Sitemap last: it lists the collection pages, so it has to run
       after they are generated or it would publish a sitemap that
       omits every one of them. */
    console.log(`✓ sitemap.xml with ${writeSitemap(products)} URLs`);
  } catch (err) {
    // Fail the deploy. Netlify then keeps the last good build live,
    // which is far better than publishing a site whose shop links all
    // 404 because /products/ never got generated.
    console.error('✗ product/sitemap build failed:', err.message);
    process.exit(1);
  }

  for (const [slug, file] of [['privacy-policy', 'privacy-policy.html'],
                              ['terms-of-service', 'terms-of-service.html']]) {
    try {
      console.log(`✓ ${file} synced (${await syncPolicy(slug, file)} chars)`);
    } catch (err) {
      failed = true;
      console.error(`✗ ${file} sync failed:`, err.message);
    }
  }

  // A policy-sync failure is not fatal: the pages keep their previous
  // synced text and still link out to the live policy. The log makes it
  // visible in the Netlify build output.
  if (failed) console.error('\nBuild finished with warnings — policy pages left as they were.');
})();
