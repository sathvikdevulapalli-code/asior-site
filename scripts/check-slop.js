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
  [/free shipping/i, 'no free-shipping rule exists in Shopify'],
  // Generator filenames, so an AI render cannot reach a page unnoticed.
  [/Firefly_|Midjourney|DALL-?E|StableDiffusion|GeminiFlash|nano-banana/i,
   'v13 §0: AI-generated imagery must not be rendered'],
];

/* Star glyphs, anywhere in rendered text. v13 bans star ratings of any
   kind; the numeric rating display is covered by its own flag in
   product.html rather than here, because a bare number is not a star. */
const STARS = /[★☆⭐]/;

function pages(dir, out) {
  out = out || [];
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'scripts') continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) pages(full, out);
    else if (name.endsWith('.html')) out.push(full);
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
  for (const [re, why] of BANNED) {
    const m = re.exec(html);
    if (!m) continue;
    const line = html.slice(0, m.index).split('\n').length;
    console.error(`  ${rel}:${line}  "${m[0]}"  — ${why}`);
    hits++;
  }
  if (STARS.test(html)) {
    console.error(`  ${rel}  star glyph — v13 §0: no star ratings`);
    hits++;
  }
}

if (hits) {
  console.error(`\ncheck-slop: ${hits} banned item(s) in the built site.`);
  process.exit(1);
}
console.log('check-slop: clean');
