# Devtaa Developers — Website

A complete, self-contained marketing website for Devtaa Developers, modelled on the
structure of a large Indian real-estate developer site (hero slider with project
search, city tabs, filterable project grid, project detail page with price table and
floor plans, sustainability, media, contact with enquiry forms).

Plain HTML, CSS and JavaScript. No build step, no framework, no npm install — open
`index.html` in a browser and it works. It is designed to be served either as a
static site or from Odoo (see **Deploying on Odoo** below).

---

## What is in here

| File | Purpose |
| --- | --- |
| `index.html` | Homepage — hero slider, search bar, counters, city tabs, featured projects, why-us, sustainability, testimonials, newsroom, enquiry form, CTA |
| `projects.html` | All 12 projects with live filtering by status, city, type and budget |
| `project-detail.html` | Full project page (Devtaa Aurum) — facts, overview, price table, amenities, floor plans, location, gallery, site-visit form |
| `about.html` | Story, numbers, vision/mission, values, milestone timeline, leadership, CSR |
| `sustainability.html` | Approach, metrics, design principles, water balance, worker welfare, certifications |
| `media.html` | Newsroom grid, awards table, press-kit contact |
| `contact.html` | Enquiry form, six offices, NRI corner, channel partners, careers, FAQ accordion |
| `assets/css/style.css` | Entire design system in one file — tokens at the top |
| `assets/js/main.js` | Navigation, slider, counters, tabs, filters, accordion, form handling |
| `assets/img/*.svg` | Placeholder imagery (see **Replacing the images**) |
| `robots.txt`, `sitemap.xml` | Basic SEO plumbing |

Also included, one level up: `../odoo/devtaa_website/` — an Odoo addon that serves
this site with clean URLs and posts the enquiry forms into Odoo CRM.

---

## Before you go live — content checklist

Everything below is placeholder content written to make the site look finished. All
of it is invented and **must** be replaced with your real information.

- [ ] **RERA registration numbers.** Every project card and the detail page show a
      deliberately fake number (`MahaRERA P52100XXXXX01`, etc.). Publishing a wrong or
      missing RERA number is a legal problem, not a cosmetic one — replace each with the
      real registration for that project, or remove the project until it is registered.
- [ ] **Phone numbers** — `+91 98765 43210` and the office numbers on `contact.html`.
- [ ] **Email addresses** — `sales@`, `media@`, `careers@`, `partners@devtaadevelopers.com`.
- [ ] **Addresses** — head office and the six regional offices.
- [ ] **Domain** — `https://www.devtaadevelopers.com` appears in the canonical tags,
      Open Graph tags, `robots.txt`, `sitemap.xml` and the JSON-LD block on the homepage.
- [ ] **Company facts** — founding year, sq.ft. delivered, project count, families served,
      award list, leadership names and biographies, CSR programmes.
- [ ] **Project data** — names, locations, configurations, carpet areas, prices,
      possession dates, amenities.
- [ ] **Social links** — the footer icons point at `#`.
- [ ] **Legal pages** — Privacy Policy, Terms of Use, Disclaimer and Sitemap links in the
      footer are placeholders and need real pages.
- [ ] **Testimonials** — replace with real, attributable quotes you have permission to use.

A fast way to do the first few: search and replace across the `.html` files.

```bash
cd website
sed -i 's/+91 98765 43210/+91 XXXXX XXXXX/g; s/+919876543210/+91XXXXXXXXXX/g' *.html
sed -i 's/sales@devtaadevelopers.com/sales@yourdomain.com/g' *.html
sed -i 's|https://www.devtaadevelopers.com|https://yourdomain.com|g' *.html sitemap.xml robots.txt
```

---

## Replacing the images

`assets/img/` holds generated SVG placeholders — abstract skylines, not photographs.
Swap them for real photography by overwriting the files (keep the same names and the
HTML needs no changes), or point the `src` attributes at your own filenames.

| Name pattern | Used for | Suggested size |
| --- | --- | --- |
| `hero-1..3.svg` | Homepage hero slides | 1600 × 900, landscape |
| `project-01..12.svg` | Project cards | 800 × 560 |
| `detail-hero.svg` | Project detail banner | 1600 × 800 |
| `gallery-1..6.svg` | Project gallery | 700 × 500 |
| `floorplan-1..3.svg` | Unit plans | 700 × 500 |
| `news-1..6.svg` | Newsroom cards | 700 × 460 |
| `about.svg`, `sustainability.svg`, `cta.svg` | Section imagery | wide |
| `logo.svg`, `favicon.svg` | Brand marks | vector |

Use JPEG or WebP for photographs (`.jpg` / `.webp` in place of `.svg` in the `src`),
keep each under ~250 KB, and keep the `width`/`height` attributes so the page does not
jump while images load.

---

## Re-skinning

Every colour, font and spacing value is a CSS custom property at the top of
`assets/css/style.css`:

```css
:root{
  --ink:#0B1F3A;   /* primary navy   */
  --gold:#C8A24A;  /* accent          */
  --sand:#F7F5F1;  /* soft background */
  --serif:"Playfair Display",Georgia,serif;
  --sans:"Inter",Helvetica,Arial,sans-serif;
}
```

Change those five and the whole site follows. Fonts load from Google Fonts in each
page's `<head>`; if your hosting must be offline, download the two families into
`assets/fonts/` and replace the `<link>` with an `@font-face` block.

---

## The enquiry forms

Three forms share the same markup and behaviour: homepage, project detail
(`#site-visit`) and contact (`#enquiry`). Each has two modes, chosen by the
`data-odoo-endpoint` attribute on the `<form>`:

- **Empty (default)** — static preview mode. The form validates and shows a
  confirmation message, but nothing is sent anywhere. Good for demos.
- **Set to a URL** — the form is posted there with `fetch()`. For Odoo, set it to
  `/website/form/crm.lead` and each submission becomes a lead in CRM.

Field names already match Odoo's `crm.lead` model: `contact_name`, `phone`,
`email_from`, `description`. The `project` select is not a CRM field, so Odoo appends it
to the lead description as extra information — which is usually what you want.

> Odoo rejects a form post without a valid CSRF token. The included addon injects one
> automatically; if you wire the form up by hand, fill the hidden `csrf_token` input.

---

## Deploying on Odoo

You said you have Odoo hosting. There are three ways to use this site with it — pick
based on who will edit the content later.

### Option A — Install the included addon (recommended)

Best if you want the site exactly as designed, with enquiries landing in Odoo CRM.
Requires a self-hosted Odoo or Odoo.sh (Odoo Online / SaaS does not accept custom
addons).

```bash
# 1. Copy the site into the addon
cd odoo/devtaa_website
./sync-site.sh

# 2. Copy the addon to your Odoo addons path
cp -r odoo/devtaa_website /path/to/odoo/addons/

# 3. Restart Odoo with the apps list updated
./odoo-bin -u all -d yourdatabase --addons-path=/path/to/odoo/addons
```

Then in Odoo: **Apps → Update Apps List → search "Devtaa" → Install**. Pages are served at
`/`, `/about`, `/projects`, `/projects/devtaa-aurum`, `/sustainability`, `/media`, `/contact`,
and the enquiry forms create CRM leads automatically.

On Odoo.sh, commit `odoo/devtaa_website` (with `static/site/` populated by
`sync-site.sh`) to your Odoo.sh repository instead of steps 2–3.

### Option B — Paste the sections into the Odoo Website Builder

Best if non-technical staff must edit pages later without a developer, and works on
Odoo Online.

1. **Website → Site → Pages → New**, create a blank page.
2. Drag in an **Inner Content → HTML** block (enable Developer Mode if you do not see it).
3. Paste one `<section>` from the corresponding file here into it.
4. Repeat per section, then paste `assets/css/style.css` into
   **Website → Configuration → Settings → Custom CSS**, and `assets/js/main.js` into
   Custom JS.
5. Upload the images through Odoo's media manager and fix the `src` paths.

Slower to set up, but everything afterwards is editable in the drag-and-drop builder.

### Option C — Serve the folder as a plain static site

Best if Odoo is only your back office (CRM, accounting, projects) and the website
should be independent. Upload the `website/` folder to any static host — Nginx,
Apache, Netlify, Cloudflare Pages, S3 — point your domain at it, and set the forms'
`data-odoo-endpoint` to your Odoo instance's full URL, e.g.
`https://yourcompany.odoo.com/website/form/crm.lead`. Enable CORS on Odoo for your
domain, or proxy `/website/form/` through your web server.

```nginx
# Nginx: serve the site, proxy enquiry posts to Odoo
server {
    server_name www.devtaadevelopers.com;
    root /var/www/devtaa;
    index index.html;

    location / { try_files $uri $uri.html $uri/ =404; }

    location /website/form/ {
        proxy_pass https://yourcompany.odoo.com;
        proxy_set_header Host yourcompany.odoo.com;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## Browser support and accessibility

Tested on current Chromium at 1440 px and 390 px. Uses CSS custom properties, grid,
`IntersectionObserver` and `URLSearchParams` — everything from the last several years
of Chrome, Edge, Firefox and Safari. Older browsers degrade to an unanimated but
readable page.

The site ships with a skip link, visible focus rings, ARIA roles on the tabs, slider,
accordion and filters, alt text on every meaningful image, live regions on form status
messages, and a `prefers-reduced-motion` block that disables all animation.

---

## Licence and credits

Content, imagery and brand marks in this folder are placeholders created for Devtaa
Developers. The structure was written from scratch — no code, markup, imagery or text
was copied from any other developer's website.
