#!/usr/bin/env node
/* ===================================================================
   Fails the build on marketing slop.

   Brief v13 section 0 lists phrases and components that must never
   ship. A list in a document is a thing people forget; this is the
   same list as a test, so it is enforced instead of remembered.

   Scans what RENDERS. Comments are stripped first: a comment explaining
   why the site does not say "hurry" is not the site saying "hurry", and
   a checker that cannot tell the difference gets switched off.
   =================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* Each entry is [pattern, why]. The "why" is printed on a hit, because
   a failing test that only says "banned phrase" sends the next person
   hunting for the rule instead of the fix. */
const BANNED = [
  [/elevate your style/i, 'v13 §0 phrase ban'],
  [/discover our collection/i, 'v13 §0 phrase ban'],
  [/crafted with passion/i, 'v13 §0 phrase ban'],
  [/\btimeless\b/i, 'v13 §0 phrase ban'],
  [/join the movement/i, 'v13 §0 phrase ban'],
  [/\bunleash\b/i, 'v13 §0 phrase ban'],
  [/premium quality/i, 'v13 §0 phrase ban'],
  [/why choose us/i, 'v13 §0 phrase ban'],
  [/\bour mission\b/i, 'v13 §0 phrase ban'],
  [/as seen in/i, 'v13 §0: no press strip'],
  [/\d+\s+people (are\s+)?viewing/i, 'v13 §0: no fake concurrency'],
  // A literal "only 3 left" is a claim. `Only ${v.stockCount} left` is a
  // live Shopify number, which brief v13 §8 explicitly allows at qty
  // 1-3, so the interpolated form is not matched.
  [/only \d+ left/i, 'stock claims come from live Shopify data only'],
  [/selling fast|almost gone|hurry/i, 'v13 §0: no fake urgency'],
  // The one discount that exists is ASIORTEN at 10%. Anything else is
  // a number this store cannot honour at checkout.
  [/\b5%\s*(off|discount)/i, 'only ASIORTEN (10%) exists'],
  /* "free shipping" was banned here because no such rate existed and
     the phrase was pure slop. A real one does now: Domestic zone,
     "Free shipping", $0.00, condition TOTAL_PRICE >= $99.00, active,
     created 2026-10-22 and read back from the live delivery profile.
     The guard that matters is ASIOR_SHIPPING.VERIFIED, which gates
     every rendered mention. Re-add this line the day that rate is
     removed from Shopify. */
  // Generator filenames, so an AI render cannot reach a page unnoticed.
  [/Firefly_|Midjourney|DALL-?E|StableDiffusion|GeminiFlash|nano-banana/i,
   'v13 §0: AI-generated imagery must not be rendered'],
];

/* Star glyphs, anywhere in rendered text. v13 bans star ratings of any
   kind; the numeric rating display is covered by its own flag in
   product.html rather than here, because a bare number is not a star. */
const STARS = /[★☆⭐]/;

/* The em dash (U+2014). Sathvik does not want one anywhere a customer
   reads, and they creep back in every time copy is rewritten.

   Comments are stripped before this runs, like every other rule, so a
   comment may still contain one -- the rule is about what renders, not
   about how the source is punctuated. */
const EM_DASH = /\u2014/;

function pages(dir, out) {
  out = out || [];
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'scripts') continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) pages(full, out);
    /* .js as well as .html: assets/site.js builds the shipping and
       returns sentences at runtime, so they are never in the built
       HTML and a rule that only read .html could not see them. */
    else if (name.endsWith('.html') || name.endsWith('.js')) out.push(full);
  }
  return out;
}

let hits = 0;
for (const file of pages(ROOT)) {
  const raw = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  /* Strip HTML comments, block comments and line comments before
     matching, so the rules may be written down next to the code that
     obeys them. Replaced with newlines rather than deleted, so the
     reported line numbers still point at the real line. */
  const html = raw
    .replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  /* The phrase and star rules describe what a page renders, so they
     run on HTML only. Pointed at a .js file they fire on the code that
     implements them -- isGeneratedImage()'s own "Firefly_" detector,
     and the free-shipping helper that exists to stay switched off.
     The em-dash rule is the one that has to read both. */
  const isJs = rel.endsWith('.js');
  for (const [re, why] of (isJs ? [] : BANNED)) {
    const m = re.exec(html);
    if (!m) continue;
    const line = html.slice(0, m.index).split('\n').length;
    console.error(`  ${rel}:${line}  "${m[0]}"  - ${why}`);
    hits++;
  }
  if (!isJs && STARS.test(html)) {
    console.error(`  ${rel}  star glyph - v13 §0: no star ratings`);
    hits++;
  }
  const em = EM_DASH.exec(html);
  if (em) {
    const line = html.slice(0, em.index).split('\n').length;
    const ctx = html.split('\n')[line - 1].trim().slice(0, 72);
    console.error(`  ${rel}:${line}  em dash (U+2014) in rendered copy - use a full stop, a colon or a comma`);
    console.error(`      ${ctx}`);
    hits++;
  }
}

/* ---- the hero preload has to name a hero image --------------------

   index.html preloaded images/look-02.webp for months after the hero
   stopped using it. The tag kept working -- the file still exists, it
   is a category tile further down the page -- so nothing failed and
   nothing noticed: the browser just fetched a non-LCP image at high
   priority while the two frames it actually paints queued behind it.

   A preload that names an image the hero does not reference is always
   that mistake, so it fails the build rather than waiting to be
   spotted again. */
{
  const home = path.join(ROOT, 'index.html');
  if (fs.existsSync(home)) {
    const html = fs.readFileSync(home, 'utf8');
    const heroBlock = (html.match(/<!-- HERO:START -->([\s\S]*?)<!-- HERO:END -->/) || [])[1] || '';
    const heroImages = new Set(
      [...heroBlock.matchAll(/images\/([A-Za-z0-9._-]+)\.(?:jpg|jpeg|png|webp|avif)/gi)]
        .map(m => m[1].replace(/\.[0-9a-f]{8}$/, '').replace(/-(?:800|full|\d+w)$/, '')));
    for (const tag of html.match(/<link[^>]+rel="preload"[^>]*as="image"[^>]*>/gi) || []) {
      const href = (tag.match(/href="images\/([A-Za-z0-9._-]+)\.(?:jpg|jpeg|png|webp|avif)"/i) || [])[1];
      if (!href) continue;
      const base = href.replace(/\.[0-9a-f]{8}$/, '').replace(/-(?:800|full|\d+w)$/, '');
      if (heroImages.size && !heroImages.has(base)) {
        console.error(`  index.html  preloads images/${href} as the LCP image, but the hero does not use it`);
        console.error(`      hero frames are: ${[...heroImages].join(', ')}`);
        hits++;
      }
    }
  }
}

if (hits) {
  console.error(`\ncheck-slop: ${hits} banned item(s) in the built site.`);
  process.exit(1);
}
console.log('check-slop: clean');
