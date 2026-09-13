/* ===================================================================
   Asior — customer photos / reviews.

   Empty on purpose. No reviews or customer photos exist yet, and
   nothing here is ever invented to fill the gap — same rule
   assets/product-details.js follows for measurements. product.html
   reads window.ASIOR_REVIEWS[handle] and renders its "From Customers"
   section only when an entry exists with at least one item; a missing
   or empty entry means the section renders nothing at all, not a
   placeholder graphic or empty state — an unbuilt trust block should
   never look like a broken one.

   When real photos/quotes come in, add an entry here keyed by the
   Shopify handle:

     window.ASIOR_REVIEWS = {
       'scripture-polo': [
         { image: 'https://cdn.shopify.com/.../photo.jpg',
           name: 'A.',        // first name / initial the customer gave permission to show
           size: 'M',         // optional — the size they ordered
           quote: 'Runs true to size, fabric feels great.' },
       ],
     };

   image should be a real, already-hosted URL (Shopify Files or the
   CDN) — do not add local files here without also adding them under
   /images. Nothing needs to change in product.html itself; it re-reads
   this object on every page load.
   =================================================================== */
window.ASIOR_REVIEWS = {};
