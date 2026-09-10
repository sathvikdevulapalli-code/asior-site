/* ===================================================================
   Asior — Fall Collection grid renderer.

   One renderer, used by both index.html (the post-Early-Access "you're
   in" state, right on the gate page) and fall-collection.html (the
   standalone, directly-linkable Fall URL) — so the placeholder-vs-real
   logic, the card markup, and the markdown-pricing math exist in
   exactly one place. Reads window.ASIOR_LAUNCH.FALL_PRODUCTS and
   .FALL_COMMERCE_READY (assets/launch-config.js) — nothing here decides
   readiness, it only renders what those two facts say is true.

   Placeholder mode (FALL_COMMERCE_READY is false, which is the only
   honest state until Shopify/Klaviyo verifies real handles): renders
   the 7 named pieces from FALL_PRODUCTS with no image, no price, no
   invented anything — "price coming" is the whole story. Real mode:
   fetches each mapped handle from Shopify and renders exactly what
   Shopify says, compare-at markdown included only when Shopify actually
   supplies a compare_at_price higher than the selling price.

   Depends on assets/site.js (A.shopifyFetch/imgTag/escapeHtml) having
   already run, and assets/launch-config.js having already set
   window.ASIOR_LAUNCH — load this script after both.
   =================================================================== */
(function () {
  'use strict';

  function placeholderCard(p) {
    return `
      <div class="product placeholder" aria-disabled="true">
        <div class="product-img placeholder-img">
          <span class="placeholder-label">image coming</span>
        </div>
        <div class="name-row">
          <div class="name">${window.Asior.escapeHtml(p.name)}</div>
        </div>
        <div class="price-placeholder">price coming</div>
      </div>`;
  }

  /* Real Shopify data only. minPrice === maxPrice is the single-variant
     (or same-price-across-sizes) case, where a compare-at price can be
     shown unambiguously; a genuine price range never gets a struck-
     through number next to it, because there would be no single correct
     pair to show.

     Queries each handle directly (product(handle: $handle), the same
     query product.html already uses) rather than paging through
     products(first: N) and filtering client-side by handle. That
     approach silently missed real products: Shopify's default order for
     an unsorted products() query is not "newest first", so a shop with
     more than N products already in the catalog can leave a just-added
     Fall piece outside the fetched page entirely — it would then
     render as a placeholder with no error, no images, no price, and
     nothing in the console to explain why. Querying by handle has no
     page to fall outside of. */
  async function fetchByHandles(handles) {
    const A = window.Asior;
    const results = await Promise.all(handles.map(async (h) => {
      const data = await A.shopifyFetch(`
        query($handle: String!) {
          product(handle: $handle) {
            title
            handle
            featuredImage { ${A.IMAGE_FIELDS} }
            variants(first: 20) {
              edges { node { availableForSale price { amount } compareAtPrice { amount } } }
            }
          }
        }`, { handle: h });
      return data.product;
    }));
    return results.filter(Boolean).map((node) => {
      const variants = node.variants.edges.map(v => v.node);
      const prices = variants.map(v => parseFloat(v.price.amount));
      const compares = variants
        .map(v => v.compareAtPrice ? parseFloat(v.compareAtPrice.amount) : null)
        .filter(Boolean);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const compare = minPrice === maxPrice && compares.length && compares[0] > minPrice ? compares[0] : null;
      return {
        handle: node.handle,
        name: node.title.replace(/\s*\[preorder\]\s*/i, '').trim(),
        image: node.featuredImage,
        isPreorder: /\[preorder\]/i.test(node.title),
        soldOut: variants.length > 0 && variants.every(v => !v.availableForSale),
        minPrice, maxPrice, compare,
      };
    });
  }

  function priceBadge(p) {
    const A = window.Asior;
    if (p.minPrice !== p.maxPrice) return `From $${p.minPrice}`;
    if (!p.compare) return `$${p.minPrice}`;
    const save = Math.round(p.compare - p.minPrice);
    return `<span class="compare">$${p.compare}</span> $${p.minPrice} <span class="save">save $${save}</span>`;
  }

  function realCard(p, eager) {
    const A = window.Asior;
    const media = p.image
      ? A.imgTag(p.image, {
          alt: 'Asior ' + p.name, eager: eager,
          sizes: '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px',
        })
      : '';
    return `
      <a class="product" href="/products/${p.handle}.html">
        <div class="product-img">
          ${media}
          <div class="price-badge tnum">${priceBadge(p)}</div>
        </div>
        <div class="name-row">
          <div class="name">${A.escapeHtml(p.name)}</div>
          ${p.isPreorder ? `<span class="preorder-tag">Preorder</span>` : ''}
          ${p.soldOut ? `<span class="preorder-tag">Sold Out</span>` : ''}
        </div>
      </a>`;
  }

  function revealOnScroll(gridEl) {
    const items = gridEl.querySelectorAll('.product:not(.placeholder)');
    if (!items.length || !('IntersectionObserver' in window)) {
      items.forEach(el => el.classList.add('in'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add('in'), (i % 4) * 60);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });
    items.forEach(el => observer.observe(el));
  }

  /* opts: { gridEl, emptyEl (optional), subEl (optional) }
     emptyEl/subEl are only used for the "not everything's here yet"
     caption — pass nulls if the page doesn't have a spot for that copy
     (index.html's post-access state has its own headline instead, see
     index.html).

     Deliberately does NOT gate on FALL_COMMERCE_READY: that flag means
     "the full 7-piece launch is complete", not "is any single piece
     real". A FALL_PRODUCTS entry with a handle is Shopify's own word
     that the piece is real, in stock, and priced — showing a
     placeholder for it anyway just because the rest of the launch
     isn't finished would be hiding a legitimately active product, which
     is the wrong kind of caution here. Every entry is judged only by
     whether IT has a handle; entries without one stay honest
     placeholders regardless of how many others are already live. */
  async function renderFallGrid(opts) {
    const products = (window.ASIOR_LAUNCH && window.ASIOR_LAUNCH.FALL_PRODUCTS) || [];
    const mapped = products.filter(p => p.handle);

    if (mapped.length === 0) {
      opts.gridEl.innerHTML = products.map(placeholderCard).join('');
      if (opts.subEl) opts.subEl.textContent = 'Dropping september 10 — limited run. Real photos and pricing land the moment Shopify confirms them.';
      return;
    }

    try {
      const real = await fetchByHandles(mapped.map(p => p.handle));
      const byHandle = new Map(real.map(p => [p.handle, p]));
      // Keep the founder's configured order; a handle that's set in
      // config but not (yet) found in Shopify falls back to its
      // placeholder card rather than silently disappearing from the
      // grid.
      const cards = products.map((p, i) => {
        const found = p.handle ? byHandle.get(p.handle) : null;
        return found ? realCard(found, i < 3) : placeholderCard(p);
      });
      opts.gridEl.innerHTML = cards.join('');
      // Some, but not all, of the 7 are real yet — say so honestly
      // rather than leave the caption implying either "nothing's here"
      // or "the whole drop is live".
      if (opts.subEl) {
        opts.subEl.textContent = mapped.length < products.length
          ? 'Live now — the rest of the lineup lands as each piece is confirmed.'
          : '';
      }
      revealOnScroll(opts.gridEl);
    } catch (err) {
      // A failed Shopify fetch used to leave the grid completely empty
      // here — worse than showing nothing was real, it looked like the
      // section itself was broken. Fall back to the full placeholder
      // grid instead: every name still shows, nothing fake renders, and
      // a refresh is one honest sentence away rather than a dead box.
      opts.gridEl.innerHTML = products.map(placeholderCard).join('');
      if (opts.emptyEl) opts.emptyEl.textContent = "Couldn't load live pricing right now — try refreshing.";
    }
  }

  window.Asior = window.Asior || {};
  window.Asior.renderFallGrid = renderFallGrid;
})();
