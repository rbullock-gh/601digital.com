# Content to fill in before this goes live

Nothing on this site invents a client, testimonial, statistic, award, or result.
This file tracks what is still a placeholder and which claims rest on your word
rather than something I could verify.

## 1. Still outstanding

| Where | State now | Needs |
|---|---|---|
| Testimonials section | Two quotes marked `PLACEHOLDER` | Real client quotes, with written permission |
| Featured work | A demonstration build ("Brightwater Dental") | Real case studies, once clients approve |
| Before/After slider | Demonstration builds both sides | Real before/after screenshots, once approved |
| Work item 02 | "Slot open" card | A second project, or delete the block |
| Contact form | No `data-endpoint` set | A form endpoint — see `DEPLOY.md` step 3 |
| Hero artwork | A generated stand-in at `assets/img/hero.jpg` | Your real painting, same filename |

Search the repo for `is-placeholder` to find the testimonial and slot markers.

## 1a. Client work is currently removed

All references to the veterinary practice — name, address, telephone, domain,
their service copy and their monogram — were taken out because permission to
publish has not been given yet. Nothing identifying them remains in the repo.

In their place the portfolio shows a **demonstration build**: a fictional
practice ("Brightwater Dental"), a reserved `555` telephone number, no real
address, and a browser frame reading `demo.601digital.com`. It is labelled as a
demonstration in three places — the project heading, the case-study column, and
the strip inside the preview itself — so nobody can mistake it for client work.

### Putting real work back

Once a client signs off in writing:

1. Replace the demonstration content in the featured work block with theirs.
2. Save real screenshots to `assets/img/`, then uncomment the two `ba__shot`
   tags in the before/after block so the photographs take over.
3. Change the project heading from "Demonstration build — not client work" to
   the real project line, and rewrite the three case-study columns.
4. Update `work/demo-preview.html`, or add a new preview file beside it and
   point the portfolio `<iframe>` at it.

Get the permission in writing, and be specific about what it covers: the
business name, screenshots of the old site, screenshots of the new one, and any
results you plan to quote.

### The hero artwork

`assets/img/hero.jpg` is a stand-in I generated — sky, light, treeline and
meadow only. It is there so the treatment could be judged; it is not your
painting, and CSS could not render the magnolia convincingly, so the tree is
omitted from it.

Save your painting over that file, same name, and it takes over with no code
change. Then check two things:

- **`object-position`** on `.hero__art img` (currently `74% 44%`). This is the
  dial that decides which part of the painting sits behind the headline. Your
  magnolia canopy is dark and sits on the left — the same side as the display
  type. Push this value left or right until pale sky, not dark foliage, falls
  behind the words.
- **The left scrim stop** in `.hero__art::after`. If the headline ever looks
  like it is fighting the art, deepen the ivory stops rather than darkening the
  image.

Export it around 2400px wide and run it through an image compressor; the
stand-in is about 100KB, and the real one should not be much larger.

## 2. Claims that rest on your word

If any of these is wrong, change the copy rather than leaving it:

- **"The person who designs it is the person who builds it."** Used in the hero,
  the 601 Difference section, and the footer. It is the spine of the boutique
  positioning and only works if 601 Digital is genuinely solo or near-solo.
- **"1 — Person, start to launch"** and **"0 — Templates used"** (hero stats).
- **Any client project you put back.** The portfolio currently claims nothing, so
  nothing here rests on an unverified client relationship. Keep it that way:
  publish a case study only once the client has approved it in writing.
- **Services** — Website Design & Development, Brand Presentation, Search
  Visibility, Google Business Profile, Conversion-Focused Design, Website Care.
  Remove any you do not actually offer.
- **Pricing** — Launch $999 + $49/mo, Growth $2,499 + $99/mo, Authority
  $4,999 + $249/mo, all framed as "Starting at". Every feature listed in a tier
  is a commitment you are making in public, so read the three lists once more
  before launch — particularly "Expanded monthly edits", "Priority support" and
  "Priority maintenance", which are promises about your time. The prices are
  also published in the page's structured data, so they can surface in search
  results; update both if they change.

## 3. Deliberately left open

- The case study's **Result** column says metrics will be added once post-launch
  data exists. Don't fill it with guesses; the layout supports real numbers.
- No client logos are shown, since I don't know who has given permission.

## 4. Confirmed and in place

- Email: **601digital@gmail.com** · Telephone: **(769) 313-6636**
- Client details used in the case study (address, phone, hours, surgical suite,
  digital radiography, grooming, on-call vet) come from the client's own site
  and public listings. Worth a last check against what they publish today.
