# Launching 601digital.com

The site is static — plain HTML, CSS, JS and self-hosted fonts. There is no
build step, no framework, no server. That makes hosting free and fast, but it
does mean one setting trips people up: **the publish directory is the repository
root, and the build command is empty.**

Total time, start to live: about 20 minutes, most of it waiting on DNS.

---

## Step 1 — Pick a branch to deploy

Right now all the work is on `claude/eager-ride-vr9vst`. Hosts can deploy
straight from it, so nothing blocks you. But production deploying from a branch
named after a session is going to feel wrong in a month.

Recommended: make `main` the production branch.

```bash
git checkout -b main
git push -u origin main
```

Then set `main` as the default branch on GitHub (Settings → General → Default
branch). Future changes: work on a branch, merge to `main`, and the host
redeploys on its own.

---

## Step 2 — Host it

Both options below are free at this size, give you HTTPS automatically, and
redeploy whenever you push to GitHub. Pick one.

### Option A — Cloudflare Pages (recommended)

Best if you are willing to move the domain's nameservers to Cloudflare, which
also gives you their DNS, caching and analytics.

1. Create a Cloudflare account and choose **Add a site** → `601digital.com`.
2. Cloudflare gives you two nameservers. Log in to wherever you bought the
   domain and replace the existing nameservers with those two. This is the part
   that takes time to propagate — usually minutes, occasionally a few hours.
3. In Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**.
4. Authorize GitHub, pick `rbullock-gh/601digital.com`, and choose your
   production branch.
5. Build settings:
   - Framework preset: **None**
   - Build command: **leave empty**
   - Build output directory: **/** (the repository root)
6. Deploy. You will get a `*.pages.dev` URL immediately — check the site there
   before pointing the domain at it.
7. **Custom domains** → add `601digital.com`, then add `www.601digital.com`.
   Because the nameservers are already on Cloudflare, the DNS records are
   created for you.

### Option B — Netlify

Best if you would rather leave the nameservers where they are.

1. **Add new site → Import an existing project → GitHub →**
   `rbullock-gh/601digital.com`.
2. Build settings:
   - Build command: **leave empty**
   - Publish directory: **.** (a single dot — the repository root)
3. Deploy, then check the temporary `*.netlify.app` URL.
4. **Domain management → Add a domain** → `601digital.com`. Netlify shows you
   the DNS records to create at your registrar — typically an `A` record for the
   apex and a `CNAME` for `www`. Add them exactly as shown.

Either way, HTTPS is issued automatically once DNS resolves. Do not skip
checking the temporary URL first — it is much easier to debug before the domain
is involved.

---

## Step 3 — Make the contact form deliver

Until this is done the form validates and then opens the visitor's mail app
with a pre-filled draft. That works, but it depends on their device having mail
set up, and you will lose enquiries.

1. Create a free form endpoint — [Formspree](https://formspree.io) or
   [Basin](https://usebasin.com) both work and both have free tiers.
2. Point it at `601digital@gmail.com`.
3. In `index.html`, add the endpoint to the form tag:

```html
<form class="form" data-contact data-endpoint="https://formspree.io/f/YOUR_ID" novalidate ...>
```

4. Push. Submit a test enquiry and confirm it arrives.

---

## Step 4 — After it is live

- **Google Search Console** — add `601digital.com`, verify with the DNS record
  it gives you, and submit `https://601digital.com/sitemap.xml`.
- **Google Business Profile** — create or claim one for 601 Digital. You sell
  local search; not having your own profile is the first thing a sharp prospect
  will notice.
- **Check the social card** — paste the URL into a message to yourself and
  confirm `assets/img/og.png` renders.
- **Re-read the pricing lists.** Every feature named in a tier is a public
  commitment, particularly the support and maintenance promises.

---

## Making changes later

Edit, commit, push. The host rebuilds within a minute or two. To preview
locally first:

```bash
python3 -m http.server 8099
# → http://127.0.0.1:8099/
```

There is no build step, so what you see locally is exactly what ships.
