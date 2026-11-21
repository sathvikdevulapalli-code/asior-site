/* ===================================================================
   Asior — the /links page, in order.

   One array, read top to bottom. This is the whole page: to change
   what the link in bio points at, reorder or edit LINKS and nothing
   else needs touching. Same reason FALL_PRODUCTS lives in
   launch-config.js rather than being restated per page.

   Every href here is a destination that already exists — the nav
   pages, and the two social accounts the footer has linked for
   months. Nothing is invented, and nothing points at a page that
   isn't live.

   `note` is optional and is shown quietly under the label. It is for
   facts (what a page is), never for urgency.
   =================================================================== */
window.ASIOR_LINKS = {
  /* Prepended to every internal link so a click from the bio can be
     told apart from a click from anywhere else. Overridden by whatever
     the incoming URL already carries — see links.html: if someone
     arrives on /links from a creator's post with their own utm_content,
     that attribution is the one worth keeping, and stamping ours over
     it would reassign the credit to ourselves. */
  /* Instagram's in-app browser drops the referrer, so link-in-bio
     traffic lands in Shopify as "direct" -- 136 of 180 sessions over
     60 days. These parameters are the only way that traffic is
     attributable at all.

     source is the platform, campaign is the placement. It was
     source=linkinbio with no campaign, which named the placement
     twice and the platform never, so Instagram still never appeared
     in the reports. */
  DEFAULT_UTM: {
    utm_source: 'instagram',
    utm_medium: 'social',
    utm_campaign: 'linkinbio',
  },

  LINKS: [
    { label: 'Shop all',        href: '/shop.html',        note: 'Everything in stock' },
    { label: 'Fall collection', href: '/collections/fall-collection.html' },
    { label: 'Tops',            href: '/collections/tops.html' },
    { label: 'Bottoms',         href: '/collections/bottoms.html' },
    { label: 'Accessories',     href: '/collections/accessories.html' },
    { label: 'Lookbook',        href: '/community.html',   note: 'The collection, worn' },
    { label: 'Waitlist',        href: '/waitlist.html',    note: 'First to know when something drops' },
    { label: 'Archive',         href: '/archive.html',     note: 'Everything made so far' },
    { label: 'Instagram',       href: 'https://www.instagram.com/asior_clothing/', external: true },
    { label: 'TikTok',          href: 'https://www.tiktok.com/@asiorclothing.com', external: true },
    { label: 'Contact',         href: '/contact.html' },
  ],
};
