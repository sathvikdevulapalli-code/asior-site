# Prompt for Cowork (desktop, browser control)

Copy everything below the line into Cowork.

---

You have browser control on my desktop. I need you to pull our campaign
photography out of a Pixieset gallery and get it into our website repo at a
resolution the site can actually use. Work carefully and tell me what you
find — do not guess at anything you can't see.

## 1. Download the photos

Gallery: https://shotbyolvr.pixieset.com/asior/

Use **asiorclothing@gmail.com** if it asks for an email, and open Gmail in
another tab if it emails a download PIN or a confirmation link. If the gallery
asks for a password I don't have, stop and tell me rather than guessing.

Download **the highest resolution the gallery offers** — "Originals" or "Full
resolution", not "Web size" or "Social". If there's a single "Download all",
use it. If downloads are capped, download the sets listed in section 3 first
and tell me what was capped.

Save the untouched downloads to `~/Asior/pixieset-originals/`. Don't edit,
crop, upscale, or run anything AI over them. Never replace a photo with a
generated one — real camera files only.

## 2. Why resolution matters here

The site's banners are full-bleed (`width: 100vw`). On a 1440px screen at 2×
that's a 2880px-wide panel. The files we have now are **1717px wide**, so the
banner is being drawn from about 60% of the pixels it wants, and the lookbook
frames are 800px wide against a 673px display width at 2× — under half.

So the target widths are:

| Use | Current | Need (min width) |
|---|---|---|
| Homepage hero + campaign band | 1717px | **2880px** |
| Lookbook frames | 800px | **1600px** |
| Product/grid shots | varies | **1600px** |

If the originals are bigger than that, good — keep the originals in
`~/Asior/pixieset-originals/` and commit the resized copies (next section).
Don't commit multi-megabyte camera files to the repo; it's a Vercel static
site and the repo needs to stay small.

## 3. What I specifically need, in priority order

**(a) The two banner photos at full resolution.** These matter most.

- The group shot of four models on concrete steps — two in black tees, one in
  a black tank, one in a black top, white/grey sweat shorts. This is the
  homepage hero. In the repo it's `oli-group`.
- The two models against the concrete wall, black tees and sweat shorts. This
  is the campaign band further down the homepage. In the repo it's `oli04001`.

The gallery filenames probably start `OLI` followed by a number — `OLI04001`
is the second one. Tell me the exact gallery filename you matched to each.

**(b) The rest of the Fall campaign set.** We already use these six, currently
at 1600px wide, and want them bigger: `OLI04013`, `OLI03931`, `OLI04155`,
`OLI04236`, `OLI04252`, `OLI04281`.

**(c) Lookbook frames.** We have 15 generic ones at 800×1200 named
`look-01.jpg` … `look-15.jpg`. Grab the best 15–25 full-length looks from the
gallery at 1600px+ to replace them. Portrait orientation, the garment clearly
readable.

**(d) A real photograph of the Kova Eternal Lotus tee**, if there is one in
the gallery. The image currently on that product in Shopify is an AI render,
and the site has code specifically to detect and demote it. A real shot
retires that workaround. If there's no Kova photo in the gallery, say so.

**(e) Detail shots** — close-ups of the embroidery, the leopard trim on the
polo cuffs, fabric texture, labels. The product pages show a big lead photo
and then pair the rest side by side, so 3–5 frames per garment look best.

## 4. Resize and name them

For each photo you're committing, make a copy resized so the **width** is:

- 2880px for the two banner photos in (a)
- 1600px for everything else

Keep the aspect ratio — don't crop, don't stretch. Save as JPEG, quality 88–90.
Use macOS Preview, Photos, or `sips` in Terminal:

```
sips --resampleWidth 2880 input.jpg --out output.jpg
```

Name them lowercase with no spaces, keeping the gallery's number so we can
trace them back: `oli04001.jpg`, `oli04013.jpg`, and so on. For the hero, name
it `oli-group.jpg`. New lookbook frames: `look-16.jpg`, `look-17.jpg`, …
starting at 16 so nothing existing is overwritten.

## 5. Put them in the repo

Repo: `github.com/sathvikdevulapalli-code/asior-site`

```
git clone https://github.com/sathvikdevulapalli-code/asior-site.git
cd asior-site
git checkout -b photos/pixieset-2026-10
```

Put the resized files in `images/`. **Do not delete or overwrite any file
that's already in `images/`** — add alongside them. I'll wire them in and
remove the old ones myself, and I need to be able to diff old against new.

Commit and push the branch:

```
git add images/
git commit -m "Add full-resolution campaign photography from the Pixieset gallery"
git push -u origin photos/pixieset-2026-10
```

Tell me the branch name when it's pushed. Don't open a pull request, don't
merge anything, and don't touch any other file in the repo.

## 6. The manifest — don't skip this

This is the part I can't work out on my own, and I'm not allowed to guess at
product facts. Create `images/MANIFEST.csv` in the same commit, one row per
file you added:

```
filename,gallery_filename,orientation,width,height,what_is_worn,product_handle,people_in_frame,notes
oli04001.jpg,OLI04001.jpg,portrait,2880,4320,"black tee, grey sweat shorts",holes-tee,2,"lead campaign frame"
```

For `product_handle` use the handle from our Shopify catalogue where you're
confident, and leave it **blank** where you're not — a blank is fine, a wrong
guess means the lookbook links to the wrong product. The handles in use are:

```
scripture-polo, holes-tee, asr-shorts, jag-shorts, jaguar-sweats,
jaguar-crewneck, jag-set-1, ja-yu-blossom-tee, helia-pendant,
kova-eternal-lotus-graphic-t-shirt, jag-lanyard
```

Also flag in `notes` anything I should know: a frame where the garment is
cropped off, a shot that's noticeably darker or warmer than the rest, anyone
who appears in only one photo, or anything that looks retouched.

## 7. Don't do these

- Don't upload anything to Shopify Admin or Klaviyo. That's live, and it's my
  call, not yours.
- Don't generate, upscale with AI, or "enhance" any image.
- Don't change the models' faces, body shapes, the garments, prints, or colours.
- Don't delete anything from the gallery or the repo.
- Don't commit the full-size originals — leave those in
  `~/Asior/pixieset-originals/`.

## 8. Report back

Tell me: the branch name, how many files you added, the pixel dimensions you
achieved for the two banner photos, anything the gallery wouldn't let you
download at full size, and anything from section 3 you couldn't find.
