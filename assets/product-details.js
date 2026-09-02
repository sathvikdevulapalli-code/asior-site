/* ===================================================================
   Asior — per-garment detail sheet.

   THIS IS THE FILE TO EDIT WHEN YOU MEASURE A GARMENT.

   Everything here is information only you can supply: real tape-measure
   numbers, real model height, real fabric. None of it is invented, and
   the site never fabricates it — if a field below is null, the product
   page simply doesn't show that row. An empty size chart full of "--"
   is worse than no size chart, because it reads as broken.

   Why it matters: sizing uncertainty is the single biggest cause of
   abandonment on apparel product pages. 84% of shoppers use sizing
   information to pick a size. Filling in one product below is likely
   the highest-value hour of work available on this site.

   ---------------------------------------------------------------
   HOW TO FILL IT IN

   1. Lay the garment flat, buttoned/zipped, smoothed out.
   2. Measure in INCHES, to the nearest half inch. Centimetres are
      calculated for you, don't enter them.
   3. Measure the GARMENT, not a body. These are flat-lay garment
      measurements and the page labels them as such.

      Tops     chest  = armpit to armpit, doubled
               length = high point of shoulder straight down to hem
               sleeve = centre back neck to sleeve cuff
      Bottoms  waist  = across the flat waistband, doubled
               inseam = crotch seam to leg opening
               rise   = crotch seam up to top of waistband

   4. Model line: state the model's height and the size they wear.
      "Model is 6'1\", wearing L." Costs one line, answers the question
      photography alone can't.
   5. Keys must match the Shopify handle and the Shopify size values
      exactly, or the row won't match up.
   =================================================================== */

window.ASIOR_MEASUREMENT_COLUMNS = {
  top:    [{ key: 'chest',  label: 'Chest' },  { key: 'length', label: 'Length' }, { key: 'sleeve', label: 'Sleeve' }],
  bottom: [{ key: 'waist',  label: 'Waist' },  { key: 'inseam', label: 'Inseam' }, { key: 'rise',   label: 'Rise' }],
};

window.ASIOR_PRODUCT_DETAILS = {
  /* ---- Worked example of a filled-in entry ----------------------
     Delete nothing here; just replace the nulls as you measure.

     'some-handle': {
       garment: 'top',
       fabric: '100% cotton, 240gsm heavyweight jersey',
       fit: 'Boxy, relaxed through the body. Runs true to size.',
       model: { height: "6'1\"", wearing: 'L' },
       measurements: {
         S: { chest: 20,   length: 27,   sleeve: 8 },
         M: { chest: 21.5, length: 28,   sleeve: 8.5 },
         L: { chest: 23,   length: 29,   sleeve: 9 },
       },
     },
     --------------------------------------------------------------- */

  'kova-eternal-lotus-graphic-t-shirt': {
    garment: 'top',
    fabric: null,
    fit: null,
    model: { height: null, wearing: null },
    measurements: {
      S: { chest: null, length: null, sleeve: null },
      M: { chest: null, length: null, sleeve: null },
      L: { chest: null, length: null, sleeve: null },
    },
  },

  'ja-yu-blossom-tee': {
    garment: 'top',
    fabric: null,
    fit: null,
    model: { height: null, wearing: null },
    measurements: {
      S: { chest: null, length: null, sleeve: null },
      M: { chest: null, length: null, sleeve: null },
      L: { chest: null, length: null, sleeve: null },
    },
  },

  'jaguar-crewneck': {
    garment: 'top',
    fabric: null,
    fit: null,
    model: { height: null, wearing: null },
    measurements: {
      XS: { chest: null, length: null, sleeve: null },
      S:  { chest: null, length: null, sleeve: null },
      M:  { chest: null, length: null, sleeve: null },
      L:  { chest: null, length: null, sleeve: null },
    },
  },

  'jaguar-sweats': {
    garment: 'bottom',
    fabric: null,
    fit: null,
    model: { height: null, wearing: null },
    measurements: {
      XS: { waist: null, inseam: null, rise: null },
      S:  { waist: null, inseam: null, rise: null },
      M:  { waist: null, inseam: null, rise: null },
      L:  { waist: null, inseam: null, rise: null },
    },
  },

  /* Preorder. shipBy is a real, stated window — the FTC Mail Order Rule
     requires a reasonable basis for the date you advertise, and if you
     state no date at all you're bound to 30 days by default. Put a date
     here you can actually hit, and update it if the drop slips. */
  'jag-sweats-preorder': {
    garment: 'bottom',
    fabric: null,
    fit: null,
    shipBy: null, // e.g. 'the week of 6 October 2026'
    model: { height: null, wearing: null },
    measurements: {
      XS: { waist: null, inseam: null, rise: null },
      S:  { waist: null, inseam: null, rise: null },
      M:  { waist: null, inseam: null, rise: null },
      L:  { waist: null, inseam: null, rise: null },
    },
  },

  /* Two-piece: crewneck measurements and sweats measurements both
     apply, so this one carries both tables. */
  'jag-set-1': {
    garment: 'set',
    fabric: null,
    fit: null,
    model: { height: null, wearing: null },
    measurements: {
      top: {
        XS: { chest: null, length: null, sleeve: null },
        S:  { chest: null, length: null, sleeve: null },
        M:  { chest: null, length: null, sleeve: null },
        L:  { chest: null, length: null, sleeve: null },
      },
      bottom: {
        XS: { waist: null, inseam: null, rise: null },
        S:  { waist: null, inseam: null, rise: null },
        M:  { waist: null, inseam: null, rise: null },
        L:  { waist: null, inseam: null, rise: null },
      },
    },
  },

  /* Not a preorder — it's in stock and orderable today. */
  'jag-lanyard': {
    garment: 'accessory',
    fabric: null,
    fit: null,
    model: { height: null, wearing: null },
    measurements: null,
  },

  /* Jewellery: no size chart, but the dimensions people actually ask
     for. chainLength and pendantSize are plain strings. */
  'helia-pendant': {
    garment: 'accessory',
    fabric: null,
    fit: null,
    chainLength: null, // e.g. '20 in'
    pendantSize: null, // e.g. '1.2 in x 0.8 in'
    model: { height: null, wearing: null },
    measurements: null,
  },
};
