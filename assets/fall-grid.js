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
     pair to show. */
  async function fetchByHandles(handles) {
    const A = window.Asior;
    const data = await A.shopifyFetch(`{
      products(first: 50) {
        edges {
          node {
            title
            handle
            featuredImage { ${A.IMAGE_FIELDS} }
            variants(first: 20) {
              edges { node { availableForSale price { amount } compareAtPrice { amount } } }
            }
          }
        }
      }
    }`);
    const byHandle = new Map(data.products.edges.map(e => [e.node.handle, e.node]));
    return handles.map(h => {
      const node = byHandle.get(h);
      if (!node) return null;
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
    }).filter(Boolean);
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
     emptyEl/subEl are only used for the "not ready" message — pass
     nulls if the page doesn't have a spot for that copy (index.html's
     post-access state has its own headline instead, see index.html). */
  async function renderFallGrid(opts) {
    const products = (window.ASIOR_LAUNCH && window.ASIOR_LAUNCH.FALL_PRODUCTS) || [];
    const ready = Boolean(window.ASIOR_LAUNCH && window.ASIOR_LAUNCH.FALL_COMMERCE_READY);
    const mapped = products.filter(p => p.handle);

    if (!ready || mapped.length === 0) {
      opts.gridEl.innerHTML = products.map(placeholderCard).join('');
      if (opts.subEl) opts.subEl.textContent = 'Dropping september 10 — limited run. Real photos and pricing land the moment Shopify confirms them.';
      return;
    }

    try {
      const real = await fetchByHandles(mapped.map(p => p.handle));
      const byHandle = new Map(real.map(p => [p.handle, p]));
      // Keep the founder's configured order; a handle that's ready in
      // config but not (yet) found in Shopify falls back to its
      // placeholder card rather than silently disappearing from the
      // grid.
      const cards = products.map((p, i) => {
        const found = p.handle ? byHandle.get(p.handle) : null;
        return found ? realCard(found, i < 3) : placeholderCard(p);
      });
      opts.gridEl.innerHTML = cards.join('');
      if (opts.subEl) opts.subEl.textContent = '';
      revealOnScroll(opts.gridEl);
    } catch (err) {
      if (opts.emptyEl) opts.emptyEl.textContent = "Couldn't load the Fall Collection right now, try refreshing.";
      else opts.gridEl.innerHTML = products.map(placeholderCard).join('');
    }
  }

  window.Asior = window.Asior || {};
  window.Asior.renderFallGrid = renderFallGrid;
})();
