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
| Before panel | Recreated from a screenshot | Optional: a real capture, for pixel-exactness |

Search the repo for `is-placeholder` to find the first two.

### Wiring the contact form

Add the endpoint to the form tag in `index.html`:

```html
<form class="form" data-contact data-endpoint="https://formspree.io/f/YOUR_ID" novalidate ...>
```

With no endpoint the form validates, then composes a pre-filled draft to
`601digital@gmail.com`. It is never a dead end, but a real endpoint means
enquiries land in an inbox without the visitor's mail app cooperating.

### Making the Before panel pixel-exact

The Before panel is a faithful CSS recreation of the site live at
columbiaanimalhospital.net today — the CAH monogram masthead, sawtooth divider,
pill nav, photo carousel, and the Surgery / Digital Radiography / Grooming
panel, using the client's own service copy. It is honest as it stands.

If you want the actual pixels instead:

1. Save a full-page screenshot to `assets/img/cah-before.png` (~1440px wide).
2. Replace the contents of `.ba__layer--before` in `index.html` with:
   `<img src="assets/img/cah-before.png" alt="The Columbia Animal Hospital website before the redesign">`

The same swap works for the After side if you would rather show the shipped
site than the design render.

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
