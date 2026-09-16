# Content to fill in before this goes live

I built this without access to the existing 601digital.com (the domain does not
resolve from this environment) and with an empty repository, so **nothing was
carried over from an old site**. Everything below is either a placeholder or a
claim I could not verify. Nothing on the site invents a client, a testimonial,
a statistic, an award, or a result.

## 1. Blockers — must be replaced before launch

| Where | Placeholder now | Needs |
|---|---|---|
| `index.html` CTA + footer | `hello@601digital.com` | Real email address |
| `index.html` CTA + footer | `(601) 555-0000` | Real phone number |
| Testimonials section | Two quotes marked `PLACEHOLDER` | Real client quotes, with written permission |
| Before/After "Before" panel | Representative dated-template render | A real screenshot of the previous site |
| Work item 02 | "Slot open" card | A second real project, or delete the block |

Search the repo for `is-placeholder` and `555-0000` to find these fast.

## 2. Claims I used that you should confirm are true

These come from your brief, but I can't verify them — if any is wrong, change
the copy rather than leaving it:

- **"The person who designs it is the person who builds it."** Used in the hero,
  the 601 Difference section, and the footer. This is the site's core
  differentiator — it only works if 601 Digital is genuinely solo or
  near-solo.
- **"1 — Person, start to launch"** (hero stat). Same assumption.
- **"0 — Templates used"** (hero stat) — i.e. every site is custom.
- **Columbia Animal Hospital is a 601 Digital project.** The whole featured case
  study rests on this. The business details used (address, phone, hours, on-call
  vet, surgical suite) came from public directory listings, so check them against
  what the client actually publishes.
- **Services list** — I included Digital Growth as a sixth service. Remove it if
  you don't offer it.

## 3. The "Before" panel — read this one carefully

The Before→After slider is the site's strongest feature, and right now the
*After* side is a real design render but the *Before* side is *not* a capture of
Columbia Animal Hospital's previous website. I had no network access to fetch it.

It is a generic reconstruction of a dated template layout. There is a visible
note under the slider saying exactly that.

**To make it real:**
1. Screenshot the old site (or pull it from the Wayback Machine).
2. Save as `assets/img/cah-before.png` — full-page, ~1440px wide.
3. In `index.html`, replace the contents of `.ba__layer--before` with:
   `<img src="/assets/img/cah-before.png" alt="The previous Columbia Animal Hospital website">`
4. Delete the note paragraph directly under the slider.

Do the same for the After side with a real screenshot if you'd rather show the
shipped site than the render.

## 4. Not fabricated — deliberately left open

- The case study's **Result** column says metrics will be added once post-launch
  data exists. Don't fill it with guesses; the layout already supports real
  numbers when you have them.
- No client logos are shown, since I don't know who has given permission.
