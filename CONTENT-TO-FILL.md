# Content to fill in before this goes live

Nothing on this site invents a client, testimonial, statistic, award, or result.
This file tracks what is still a placeholder and which claims rest on your word
rather than something I could verify.

## 1. Still outstanding

| Where | State now | Needs |
|---|---|---|
| Testimonials section | Two quotes marked `PLACEHOLDER` | Real client quotes, with written permission |
| Work item 02 | "Slot open" card | A second real project, or delete the block |
| Contact form | No `data-endpoint` set | A form endpoint (Formspree, Basin, your own handler) |
| Before/After panels | CSS recreations of both real sites | Optional: the real screenshots, for pixel-exactness |

Search the repo for `is-placeholder` to find the first two.

### Wiring the contact form

Add the endpoint to the form tag in `index.html`:

```html
<form class="form" data-contact data-endpoint="https://formspree.io/f/YOUR_ID" novalidate ...>
```

With no endpoint the form validates, then composes a pre-filled draft to
`601digital@gmail.com`. It is never a dead end, but a real endpoint means
enquiries land in an inbox without the visitor's mail app cooperating.

### Using the real screenshots

Both panels are CSS recreations of real sites: on the left, the template live at
columbiaanimalhospital.net today (CAH monogram masthead, sawtooth divider, pill
nav, photo carousel, Surgery / Digital Radiography / Grooming panel). On the
right, the shipped 601 Digital redesign (serif display with the amber italic
accent, badge pill, three-button hero, four-column practical strip). Both use
the client's own copy, so the comparison is like for like and honest as it
stands.

I could not add the actual screenshots myself — pasted images in a chat are not
files I can write to disk. To swap them in:

1. Save the two captures as:
   - `assets/img/cah-before.png`
   - `assets/img/cah-after.png`

   Full-page, roughly 1440px wide, PNG or JPG.

2. In `index.html`, find the two `REAL SCREENSHOT` comments inside the
   before/after block and remove the comment wrappers so each `<img class="ba__shot">`
   tag is live.

3. Delete the explanatory paragraph directly under the slider.

Each image fades in over its recreation once loaded, and removes itself if the
file is missing — so a typo in a filename degrades to the recreation rather than
a broken image. The tags ship commented out purely so the site does not request
files that are not there yet.

**One thing the recreation cannot supply:** the three-dog photograph in the
redesign's hero is a warm gradient placeholder. If you have that image, it is
worth adding to the case study regardless of the slider.

### Structured data — fields deliberately left out

`index.html` now carries a JSON-LD `@graph` (ProfessionalService + six Service
nodes + WebSite + WebPage). Several recommended properties are **omitted rather
than guessed**, because a wrong answer in structured data is worse than a missing
one. Each needs you:

| Property | Needs | Why it matters |
|---|---|---|
| `sameAs` | Your Google Business Profile URL, plus any Facebook / Instagram / LinkedIn | The main way the site corroborates your GBP. **If no GBP exists yet, creating and verifying one outranks every other item in this file.** |
| `address` | Home city + ZIP, or a decision to stay address-less | Without a `streetAddress` the site is not eligible for LocalBusiness rich results. Don't invent one to get them. |
| `founder.name` | Your name | The site's entire pitch is "the person who designs it is the person who builds it" — and that person is currently never named anywhere on the page. |
| `openingHoursSpecification` | Business hours | Standard local-business signal. |
| `priceRange` | Depends on the pricing decision below | Recommended LocalBusiness property; unfillable while nothing is published. |

`aggregateRating` is **intentionally absent and should stay that way** — Google
prohibits self-serving review markup (an entity rating itself). Reviews belong on
the Google Business Profile.

## 2. Claims that rest on your word

If any of these is wrong, change the copy rather than leaving it:

- **"The person who designs it is the person who builds it."** Used in the hero,
  the 601 Difference section, and the footer. It is the spine of the boutique
  positioning and only works if 601 Digital is genuinely solo or near-solo.
- **"1 — Person, start to launch"** and **"0 — Templates used"** (hero stats).
- **Columbia Animal Hospital is a 601 Digital project.** The featured case study
  rests on this.
- **Services** — Website Design & Development, Brand Presentation, Search
  Visibility, Google Business Profile, Conversion-Focused Design, Website Care.
  Remove any you do not actually offer.

## 3. Deliberately left open

- The case study's **Result** column says metrics will be added once post-launch
  data exists. Don't fill it with guesses; the layout supports real numbers.
- No client logos are shown, since I don't know who has given permission.

## 4. Confirmed and in place

- Email: **601digital@gmail.com** · Telephone: **(769) 313-6636**
- Client details used in the case study (address, phone, hours, surgical suite,
  digital radiography, grooming, on-call vet) come from the client's own site
  and public listings. Worth a last check against what they publish today.
