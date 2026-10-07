# "How to create your account" — the printed one-pager

`docs/marketing/how-to-create-your-account-handout.pdf` — one US Letter sheet,
portrait, for the front desk, a welcome pack, an email attachment or a noticeboard.

```bash
npm install --no-save playwright          # ffmpeg is not needed here
node scripts/marketing/signup-handout/render.js [--png] [--size letter|a4]
```

## Why Chromium and not a PDF library

The whole point of this page is that it carries the studio's real type (Kanit
ExtraBold Italic, Barlow, JetBrains Mono) and the app's real screens. Drawing
those in reportlab would mean keeping a second, diverging copy of the brand and
of three app screens. Rendering the same HTML the films are built from keeps one
source of truth.

The output is **real text, not a picture of text**: the fonts are embedded and
subset, with ToUnicode maps, so it is selectable, searchable, and sharp at any
print resolution. `DejaVuSans` also appears in the file — that is Chromium
falling back for two glyphs the latin subsets do not carry, the `‹` back chevron
and the `↻` refresh arrow, both of which live inside the phone thumbnails at a
third of a millimetre. Not worth a wider font subset.

## It is one page, and that is enforced

`render.js` measures the laid-out page before writing the PDF and **fails** if
the content is taller than the sheet, naming the overflow in pixels. A page that
silently breaks in two is the failure mode that does not announce itself — the
PDF still opens, still looks right on screen, and only goes wrong at the printer.

So when you add a line, expect the render to refuse it, and take the space from
somewhere. The budget at the time of writing, on Letter, is 1022px of content in
a 1056px sheet, and it is full. `#help` is pinned to the bottom with
`margin-top:auto`, so any slack shows up as air above the troubleshooting panel.

`--size a4` is the same page in a 1123px-tall box; everything else is unchanged.

## What is on it, and why

1. **The Enrollio rule, before the steps.** It is the one mistake that cannot be
   reported: `portal-signup` answers `200 { ok: true }` whether or not the
   address is on the roster — deliberately, so signup cannot be used to test
   which families attend the studio. A parent who uses the wrong address gets no
   code and no explanation. Saying it in advance is the only place left, which is
   why it is a band near the top rather than a footnote.
2. **Four steps**, in the app's own words and order (`ChooserPage`,
   `PortalLogin`, `PortalSignUp`). The 6-character minimum is
   `CLIENT_MIN_PASSWORD`.
3. **Three thumbnails** of the real screens, so the page a parent is looking at
   matches the paper in their hand. They are the app's markup at 0.32 scale, not
   screenshots — which is also why the device outline is a `box-shadow` on the
   unscaled wrapper: a 2px ring inside the transform lands at two thirds of a
   pixel and vanishes in print.
4. **"If the code does not arrive"**, because junk folders and the one-hour
   expiry are what the studio will otherwise be asked about by phone.

## If you re-cut it

Unlike the films, this sheet stops before the portal home, so it carries no
program names and needs no check against `portal_programs`.

Shared with the films: `../assets/fonts.css` (base64 latin subsets, embedded so
a render is identical offline) and `public/brand/logos/didc-mark-3d.png`, read
from the repo at render time. Copy and colours are the DIDC tokens; the pink
tint on the Enrollio band is 4%, which keeps the saturated pink down to the
heading, the rule and a few accents.
