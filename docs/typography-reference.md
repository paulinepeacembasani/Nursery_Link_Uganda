# Typography reference: ugandawildlife.org

Measured on 3 October 2026 with Playwright (Chrome) at **1280 × 900** and **375 × 900**: every visible
text element's computed `font-family`, `font-size`, `font-weight`, `line-height`, `letter-spacing` and
`text-transform` (195 elements at 1280 px, 180 at 375 px). Only the text styling is recorded here; no
colours, logo, images or layout are taken.

## How the site loads its fonts

| Source | Families |
| --- | --- |
| **bunny.net** (a Google Fonts mirror, same OFL files) | Taviraj, Lora, Open Sans, Oswald, Inter, Libre Baskerville, Source Serif 4, Bodoni Moda, Yeseva One (and others requested but unused) |
| **Self-hosted** WordPress theme | Libre Franklin |
| **Self-hosted** Brizy uploads (scrambled family names) | Gibson, Avenir Next LT Pro Bold Condensed, Gotham Book/Medium, Sofia Pro, Hubert Jocham Flavour Bold, Dobra, Geomanist |

`document.fonts` lists 163 faces, 36 of them actually loaded. The site uses about 15 families; the roles
below are the ones that recur. One-off uses (Libre Baskerville, Inter phone numbers, Hubert Flavour,
Sofia Pro badges) are left out.

### Licensing

| Family | Licence | Use it? |
| --- | --- | --- |
| Taviraj, Lora, Open Sans, Oswald | SIL Open Font License (Google Fonts) | Yes |
| **Gibson** (nav, footer) | Commercial (Canada Type) | No: closest free alternative **Figtree** (humanist geometric, similar width and x-height) |
| **Avenir Next LT Pro Bold Condensed** (stat numbers) | Commercial (Linotype/Monotype) | No: closest free alternative **Barlow Condensed** 700 |
| **Gotham** (a few buttons) | Commercial (Hoefler&Co.) | No: Montserrat is the usual stand-in, but Open Sans already covers buttons |
| Sofia Pro, Dobra, Geomanist, Hubert Flavour | Commercial | Not needed for any role |

## Role reference

Sizes are **desktop / mobile** (1280 / 375). Line-height is shown as computed px and as a ratio.
"Case" is the computed `text-transform`; several buttons on the site are typed in capitals rather than
transformed, which is noted.

| Role | Element(s) seen | Family | Size (desktop / mobile) | Weight | Line-height | Letter-spacing | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Display (hero) | `p.brz-tp-lg-empty` "Explore the Pearl of Africa" | Taviraj | 65 / 33 px | 400 (600 on mobile) | 84.5 px (1.3) / 42.9 px (1.3) | normal / −1.5 px | none |
| Hero secondary | "Conserving & Sustaining" | Taviraj | 55 / 36 px | 400 | 77 px (1.4) / 43.2 px (1.2) | normal | none |
| H1 / section title | "Featured Ugandan Experiences", "News, Press Releases & Articles" | Taviraj | 52.8 / 52.8 px; 49 / 49 px | 400 | 68.6 px (1.3) | 1 px; −0.7 px | none |
| H2 | "Our Conservation Mission" | Taviraj | 45 / 45 px | 600 | 54 px (1.2) | normal | none |
| H2 (alt) | "Word from the Executive Director" | Taviraj | 45 / 45 px | 400 | 63 px (1.4) | normal | none |
| H3 / card title | "Gorilla Tracking Experience" | Taviraj | 30 / 30 px | 600 (500 on some) | 48 px (1.6) | 0.7 px | none |
| H4 / item title | "Kibale National Park" | Lora | 19 / 19 px | 700 | 32.3 px (1.7) | normal | none |
| Eyebrow / kicker | "Conservation Facts", "Our Mandate" | Oswald; Taviraj | 20 / 20 px; 23 / 23 px | 400 | 32 px (1.6); 46 px (2.0) | 1.6 px; 2 px | uppercase |
| Lead paragraph | "On behalf of the entire team…" | Lora | 22 / 22 px | 400 | 37.4 px (1.7) | normal | none |
| Body | most paragraphs | Lora | 20 / 15–20 px | 400 | 30–32 px (1.5–1.6) | normal | none |
| Body (small) | news teasers, notices | Open Sans | 15 / 15 px | 400 | 21 px (1.4) | normal | none |
| Body (all-caps blurbs) | "UGANDA boasts over 350 species…" | Avenir Next Cond. | 25 / 19 px | 400 | 35 px (1.4) / 26.6 px | normal | **uppercase** |
| Nav links | "About Us" | Gibson | 17 / (menu) px | 400 | 61.2 px (bar height) | 0.3 px | none |
| Button | "Explore More", "Learn More", "READ MORE" | Gotham Medium; Open Sans | 17 px; 15 / 15 px | 600–700 | 24–27 px (1.6) | 0.5 px | none (some typed in capitals) |
| Button (small, caps) | "Donate", "Support our Efforts" | Open Sans | 14 / 14 px | 600–700 | 19.6 px (1.4) | 1–1.5 px | uppercase |
| Stat number | "345", "1,060+" | Avenir Next LT Pro Bold Cond. | 75 / 75 px; 49 / 49 px | 400 (bold-condensed file) | 1.0 | normal | none |
| Stat label / since | "Since 1996" | Hubert Flavour Bold | 29 / 29 px | 400 | 37.7 px (1.3) | 1 px | none |
| Caption / date | "September 27, 2026" | Open Sans | 14 / 14 px | 700 | 21 px (1.5) | normal | none |
| Footer heading | "Our Parks" | Gibson | 17 / 17 px | 600 | 27.2 px (1.6) | 0.5 px | none |
| Footer links | "Kidepo Valley National Park" | Gibson; Source Serif 4 (mobile) | 16 / 15 px | 300; 400 | 16 px (1.0) / 24 px (1.6) | normal | none |
| Footer small print | "All rights reserved." | Gibson | 14 / 14 px | 400 | 21 px (1.5) | normal | none |

Observations: the site barely scales type for phones (most headings keep their desktop size at 375 px,
and some body text drops to 13–15 px), and it uses all-caps for some paragraphs. Our rules below fix
both.

## Our rules (override the reference)

- Body text is at least **16 px on mobile** (the reference goes down to 13 px).
- **No all-caps body text** (the reference's capitalised blurbs become sentence case). Capitals stay
  only for short eyebrows, if used.
- **WCAG AA contrast** stays: these tokens change type only; colours are untouched. Taviraj is a thin
  serif, so it is used at 400+ and only at 22 px and above (large text).

## Tokens (applied)

| Token | Family | Size (≥ 768 px / < 768 px) | Weight | Line-height | Letter-spacing | Case |
| --- | --- | --- | --- | --- | --- | --- |
| `display` | Taviraj | 64 / 36 px | 400 | 1.3 / 1.2 | −0.5 px / −0.5 px | none |
| `h1` | Taviraj | 52 / 32 px | 400 | 1.3 / 1.25 | 0 | none |
| `h2` | Taviraj | 44 / 28 px | 600 | 1.2 / 1.25 | 0 | none |
| `h3` | Taviraj | 30 / 22 px | 600 | 1.45 / 1.35 | 0.5 px | none |
| `h4` | Lora | 19 / 18 px | 700 | 1.6 | 0 | none |
| `body` | Lora | 20 / 17 px | 400 | 1.6 | 0 | none |
| `body-sm` | Open Sans | 15 / 16 px | 400 | 1.45 / 1.5 | 0 | none |
| `label` (nav, form labels) | Figtree (for Gibson) | 17 / 16 px | 500 | 1.4 | 0.3 px | none |
| `button` | Open Sans | 15 / 16 px | 700 | 1.5 | 0.5 px | none |
| `caption` | Open Sans | 14 / 14 px | 600 | 1.5 | 0 | none |
| `stat` | Barlow Condensed (for Avenir Next Cond.) | 72 / 48 px | 700 | 1.0 | 0 | none |

Notes on the departures from the reference:

- **Card titles** (`h3`) use line-height 1.45 instead of 1.6: at 1.6 two-line titles drift apart in
  our narrower cards.
- **Mobile sizes** are scaled down for headings; the reference keeps 45–53 px headings at 375 px,
  which wraps one word per line in our layouts.
- **`body-sm` and `button` grow to 16 px on phones** (our 16 px rule; it also stops iOS zooming into
  inputs, which inherit the button/body size).
- **Fonts and weights loaded** (Latin only, `font-display: swap`): Taviraj 400, 600; Lora 400, 700
  (and 400 italic on Library routes); Open Sans 400, 600, 700; Figtree 500; Barlow Condensed 700.
  11–23 KB each; a page downloads only the faces it uses. They are self-hosted through `@fontsource`
  (the same OFL files Google Fonts serves) rather than loaded from Google, so they also work offline.
