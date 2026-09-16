# 601digital.com

Marketing site for 601 Digital — web design and local search for South
Mississippi businesses.

## Running it

Static site, no build step, no dependencies.

```bash
python3 -m http.server 8099
# → http://127.0.0.1:8099/
```

Deploy by uploading the repository root to any static host (Netlify, Cloudflare
Pages, Vercel, or plain nginx/Apache).

## Layout

```
index.html                              One-page site, all sections
assets/css/main.css                     Design system + every section
assets/js/main.js                       Interaction layer (vanilla, no deps)
assets/fonts/                           Self-hosted woff2 (Geist, Geist Mono, Instrument Serif)
assets/img/og.png                       1200×630 social card
work/columbia-animal-hospital-preview.html   Scrollable client render shown in the portfolio frame
CONTENT-TO-FILL.md                      Placeholders + unverified claims — read before launch
```

## Design system

Defined as custom properties at the top of `main.css`.

- **Ink** `#0A0B0D` · **Paper** `#F4F1EA` (warm bone, not white) ·
  **Clay** `#D9542B` · **Pine** `#16332C`
- Dark sections get `class="inverted"`, which re-points the semantic tokens.
  The nav detects which surface is under it and flips its own colour to match.
- Type: Geist (tight grotesk) for display and UI, Instrument Serif *italic* for
  accent words, Geist Mono for micro-labels. The grotesk/serif-italic pairing is
  the signature — keep it.
- Fluid type scale (`--t-*`) is `clamp()`-based across a 360→1600px range, so
  there are no typography breakpoints to maintain.

## Motion

All motion lives in `main.js` and degrades safely:

- One rAF-throttled scroll bus drives every scroll-linked effect.
- `prefers-reduced-motion: reduce` is honoured everywhere — reveals resolve
  immediately, the marquee stops, tilt/magnetic/parallax never bind.
- Cursor effects (tilt, magnetic buttons, spotlight) only bind on
  `(hover: hover) and (pointer: fine)`, so touch devices skip them entirely.
- Transforms are `translate3d`/`rotate` only, with `will-change` on the few
  elements that animate continuously.

## Notable components

- **Live showcase** (`[data-stage]` + `[data-devtoggle]`) — the portfolio frame
  holds a real `<iframe>` you can scroll, and the Desktop/Tablet/Mobile buttons
  animate the frame's `max-width`. Arrow keys work within the toggle group.
- **Before → After** (`[data-ba]`) — pointer drag on the frame; the overlaid
  `<input type="range">` is kept for keyboard users (Tab to it, then ← →). It
  self-demonstrates once when scrolled into view.
- **The 601 Transformation** (`[data-xform]`) — scroll progress drives a
  `clip-path` wipe between a dated and a premium render, plus a scan line and a
  progressively lit checklist.
- **Mini renders** (`.mini--dated` / `.mini--premium`) — miniature website
  layouts sized entirely in `cqw` container units, so one markup block scales
  correctly whether it's a 340px thumbnail or a 1300px split-screen panel.

## Accessibility

Semantic landmarks, a skip link, visible focus rings, a focus-trapped mobile
menu with Escape to close, `aria-pressed` on the device toggle, a labelled range
input behind the before/after drag, and `aria-hidden` on purely decorative
renders. Verified: no horizontal scroll and no console errors at 1920 / 1440 /
1280 / 834 / 390 / 360.
