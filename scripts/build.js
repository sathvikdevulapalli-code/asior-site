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

const ROOT = path.join(__dirname, '..');
const BASE = 'https://asiorclothing.com';

const SHOPIFY_DOMAIN = 'b0vvek-yz.myshopify.com';
const SHOPIFY_TOKEN = '90d08a1b479f1a4245738f227c5c6749';
const API = `https://${SHOPIFY_DOMAIN}/api/2024-10/graphql.json`;

const STATIC_PAGES = [
  '/', '/shop.html', '/community.html', '/contact.html',
  '/manufacturing.html', '/privacy-policy.html', '/terms-of-service.html',
  '/lanyard.html',
];

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
        handle title descriptionHtml updatedAt
        featuredImage { url altText width height }
        images(first: 4) { edges { node { url } } }
        variants(first: 40) { edges { node {
          sku availableForSale price { amount currencyCode } compareAtPrice { amount }
        } } }
      } }
    }
  }`);
  return data.products.edges.map(e => e.node);
}

/* Strip Shopify's HTML down to a plain sentence for meta/OG description.
   Truncated on a word boundary so it never ends mid-word. */
function plainDescription(html, fallback) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  if (text.length <= 160) return text;
  return text.slice(0, 157).replace(/\s+\S*$/, '') + '…';
}

function productJsonLd(p, url) {
  const variants = p.variants.edges.map(e => e.node);
  const inStock = variants.some(v => v.availableForSale);
  const prices = variants.map(v => parseFloat(v.price.amount)).filter(n => !isNaN(n));
  const currency = variants[0] ? variants[0].price.currencyCode : 'USD';
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title.replace(/\s*\[preorder\]\s*/i, '').trim(),
    image: p.images.edges.map(e => e.node.url),
    brand: { '@type': 'Brand', name: 'Asior' },
    offers: {
      '@type': 'Offer',
      price: prices.length ? Math.min(...prices) : undefined,
      priceCurrency: currency,
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      url,
    },
  };
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
  const title = `${name} | Asior`;
  const desc = plainDescription(p.descriptionHtml,
    `${name} from Asior — limited-run streetwear made in small batches.`);
  const img = p.featuredImage ? p.featuredImage.url : `${BASE}/assets/og-default.jpg`;
  const alt = p.featuredImage && p.featuredImage.altText ? p.featuredImage.altText : name;

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
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`)
    .replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${esc(img)}">`)
    .replace(/<meta property="og:image:alt" content="[^"]*">/, `<meta property="og:image:alt" content="${esc(alt)}">`);

  // Shopify's own images aren't 1200x630; drop the dimension hints
  // rather than state wrong ones.
  if (p.featuredImage) {
    html = html
      .replace(/<meta property="og:image:width" content="[^"]*">\n?/, '')
      .replace(/<meta property="og:image:height" content="[^"]*">\n?/, '');
  }

  // tell the page which product it is, plus the prerendered JSON-LD
  html = html.replace('<script src="/assets/site.js"></script>',
    `<script>window.__PRODUCT_HANDLE = ${JSON.stringify(p.handle)};</script>\n`
    + `<script type="application/ld+json">${productJsonLd(p, url)}</script>\n`
    + '<script src="/assets/site.js"></script>');

  return html;
}

function writeSitemap(products) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    ...STATIC_PAGES.map(p => ({ loc: BASE + p, lastmod: today })),
    ...products.map(p => ({
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
const HEADER_FULL = `  <div class="teaser-bar"><a href="index.html#signup">Sign Up For 10% Off Your First Order</a></div>
  <header>
    <a class="mark" href="index.html">Asior</a>
    <nav>
      <a href="shop.html">Shop</a>
      <a href="community.html">Community</a>
      <a href="contact.html">Contact</a>
      <a href="manufacturing.html">Manufacturing</a>
      <a href="cart.html" class="cart-link" aria-label="Cart"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" width="15" height="15"><path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg></a>
    </nav>
  </header>

  <div class="page-top-space"></div>
`;

/* privacy-policy.html and terms-of-service.html carry no nav and no
   teaser bar on purpose: they're the two pages a visitor might read
   before ever unlocking the gate (linked from the SMS/email consent
   copy), and a full nav there would be the same catalog-bypass risk
   as above. */
const HEADER_MINIMAL = `  <header>
    <a class="mark" href="index.html">Asior</a>
  </header>

  <div class="page-top-space"></div>
`;

const FOOTER_HTML = `  <footer id="order">
    <div class="fmark">Asior</div>
    <div class="fmeta"><a href="mailto:asiorclothing@gmail.com">asiorclothing@gmail.com</a></div>
    <div class="social">
      <a href="https://www.instagram.com/asior_clothing/" aria-label="Instagram" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1"/></svg>
      </a>
      <a href="https://www.tiktok.com/@asiorclothing" aria-label="TikTok" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 3h-3v12.1a2.7 2.7 0 1 1-2-2.6v-3.1a5.8 5.8 0 1 0 5 5.7V9.4a7.5 7.5 0 0 0 4 1.2V7.5c-2.1-.2-3.7-1.8-4-4.5z"/></svg>
      </a>
    </div>
    <div class="policy-links">
      <a href="privacy-policy.html">Privacy Policy</a>
      <a href="terms-of-service.html">Terms of Service</a>
      <a href="account.html">Account</a>
    </div>
  </footer>
`;

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
];

function replaceBetween(html, startMarker, endMarker, replacement) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  if (start === -1 || end === -1) return null;
  return html.slice(0, start) + startMarker + '\n' + replacement + '  ' + endMarker + html.slice(end + endMarker.length);
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
    console.log(`✓ sitemap.xml with ${writeSitemap(products)} URLs`);
  } catch (err) {
    // Fail the deploy. Netlify then keeps the last good build live,
    // which is far better than publishing a site whose shop links all
    // 404 because /products/ never got generated.
    console.error('✗ product/sitemap build failed:', err.message);
    process.exit(1);
  }

  try {
    console.log(`✓ shared header/footer synced across ${syncSharedMarkup()} pages`);
  } catch (err) {
    failed = true;
    console.error('✗ shared header/footer sync failed:', err.message);
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
