# Devtaa Developers — website

A complete, self-contained marketing website for Devtaa Developers Pvt. Ltd.,
modelled on the structure premium Indian developers use for their project
microsites: a full-bleed hero, a floating stats strip, project cards with the
numbers on the front, a sticky enquiry form on every project page, and a RERA
disclaimer everywhere it belongs.

Plain HTML, CSS and JavaScript. No framework, no build dependencies, no
database. Upload the folder and it works.

---

## What's in the box

| Page | File | Purpose |
| --- | --- | --- |
| Home | `index.html` | Hero, stats, philosophy, all three projects, redevelopment pitch, enquiry form |
| About Us | `about.html` | Story, vision/mission/values, project journey, six written commitments |
| Projects | `projects.html` | All projects with a working status filter |
| Devtaa Pratham | `project-devtaa-pratham.html` | Full project microsite — Goregaon West |
| Devtaa Desire | `project-devtaa-desire.html` | Full project microsite — Nahur East |
| Devtaa Vijay CHS | `project-devtaa-vijay.html` | Full project microsite — Bhandup East |
| Redevelopment | `redevelopment.html` | Society / self-redevelopment offer, 7-step process, FAQ |
| Contact | `contact.html` | Sales desk, site offices, channel partner section |
| Privacy & Terms | `privacy.html` | Draft privacy policy and terms of use |

Each project page carries: hero with headline numbers, overview, highlights,
configuration and pricing table, amenities grid, gallery, floor-plan section,
location and connectivity, specifications table, MahaRERA note and an FAQ —
with a sticky enquiry form running alongside on desktop.

---

## Before you go live — the 4 things you must change

Everything else is optional. These four are not.

### 1. Phone, WhatsApp and the enquiry endpoint

Open **`assets/js/main.js`** and edit the block at the top:

```js
window.DEVTAA = {
  phone: '+91 98204 00000',     // shown on screen
  phoneTel: '+919820400000',    // used by tel: links, digits only
  whatsapp: '919820400000',     // international format, no + and no spaces
  formEndpoint: ''              // see below
};
```

**`formEndpoint`** is where enquiry forms POST. Two free options that need no
server of your own:

- **Formspree** — sign up at formspree.io, create a form, paste the endpoint
  (looks like `https://formspree.io/f/abcdwxyz`).
- **Web3Forms** — sign up at web3forms.com, and use their endpoint with your
  access key added as a hidden field.

**If you leave `formEndpoint` empty, nothing breaks.** Every form falls back to
opening WhatsApp with the enquiry details pre-filled, so the site generates
leads from day one. Set the endpoint when you want enquiries in your inbox too.

### 2. Email addresses

The site currently uses `sales@devtaadevelopers.com`,
`redevelopment@devtaadevelopers.com` and `privacy@devtaadevelopers.com`. Find
and replace these with your real addresses across `src/partials/` and
`src/pages/`, then rebuild (see below).

### 3. The office address

`Mumbai, Maharashtra, India` is a placeholder in the footer and on the contact
page. Put your registered office address in.

### 4. Verify every project number

The project details on this site were compiled from publicly listed
information. **Check each one against your own records before publishing** —
carpet areas, price bands, MahaRERA numbers, possession dates and unit counts
are legally significant and you are the one who has to stand behind them.

Specifically worth a second look:

- Devtaa Pratham — MahaRERA `P51800050716`, possession Dec 2026, ₹1.80 Cr onwards
- Devtaa Desire — MahaRERA `P51800008457`, 22 floors, 109 units
- Devtaa Vijay CHS — the MahaRERA number is **not** on the page yet; add it
- Home page stats — "3 addresses", "140+ homes", "22 storeys", "100% MahaRERA"

The **specifications table** on the Pratham page lists a typical Mumbai
specification. Replace it with your actual specification sheet.

---

## Logo

`assets/img/logo-mark.svg` is a clean monogram drawn for this site — a gold
"D" with a small skyline cut into it — plus a `Devtaa / Developers` wordmark
set in the page. It is designed to hold up at favicon size and on a dark
footer.

**To use your existing logo instead:** drop your file in `assets/img/` and
point the three references at it. In `src/partials/header.html` and
`src/partials/footer.html`, change:

```html
<img class="brand__mark" src="assets/img/logo-mark.svg" ...>
```

If your logo already includes the company name, delete the
`<span class="brand__text">…</span>` block next to it and give the image a
wider `width`. Then rebuild.

An SVG or a transparent PNG at 2× display size works best. Also replace
`assets/img/favicon.svg` with the same mark.

---

## Photography

Every image on the site is a hand-drawn SVG illustration — a skyline, a tower
facade, an interior, a lobby, an amenity deck, a floor plan and a location
map. They are deliberate placeholders: they look composed rather than empty,
and they keep the site fast.

**Replace them with real photography when you have it.** Keep the same file
names and everything updates at once, or point the `src` attributes at your
new files:

| File | Used for |
| --- | --- |
| `art-skyline.svg` | Home and Projects hero |
| `art-tower.svg` | Elevations, Devtaa Pratham |
| `art-lobby.svg` | Lobbies, Devtaa Desire |
| `art-interior.svg` | Interiors |
| `art-amenity.svg` | Amenity decks |
| `art-redevelopment.svg` | Redevelopment before/after |
| `art-plan.svg` | Floor plans |
| `art-map.svg` | Location maps |

Export photographs at roughly 1600 px wide, compress them (squoosh.app is
free), and keep each one under about 300 KB.

**Testimonials:** there are none on this site, deliberately. Invented reviews
are a legal and reputational risk. When you have real, consented quotes from
buyers, that is the section to add next.

---

## Google Maps

The contact page shows an illustrated map. To use a real one: search your
address on Google Maps → **Share** → **Embed a map** → copy the `<iframe>` and
paste it over the image block in `src/pages/contact.html` (there's a comment
marking the spot). Same on any project page's location section.

---

## Editing and rebuilding

The shared header, footer, enquiry forms and modal live once in
`src/partials/`. Page content lives in `src/pages/`. The build script stitches
them together and writes the plain HTML files in this folder.

```bash
cd apps/website
npm run build          # regenerates all .html plus sitemap.xml and robots.txt
npm start              # builds, then serves at http://localhost:8080
```

Requires Node 18 or newer. Nothing is installed — the script uses only Node's
standard library.

**Edit `src/`, not the generated `.html` files in the root** — a rebuild
overwrites them.

Each page in `src/pages/` starts with a small JSON block (title, meta
description, canonical slug) followed by `---` and then the page markup.

Before you build, set your real domain in `build.mjs`:

```js
const SITE_URL = 'https://www.devtaadevelopers.com';
```

This feeds the canonical tags, the Open Graph URLs and `sitemap.xml`.

---

## Buying a domain and hosting

### Domain

Any registrar works — GoDaddy, BigRock, Namecheap, Hostinger, Cloudflare.
Expect roughly ₹800–1,500 a year for a `.com`, or ₹500–900 for a `.in`. Buy
both if the name matters to you; point one at the other.

Check availability for `devtaadevelopers.com`, `devtaagroup.com` or
`devtaa.in`. Buy the domain **before** you print it on anything.

### Hosting — three routes

**1. Netlify or Cloudflare Pages (recommended, free)**

A static site like this one costs nothing to host and loads fast worldwide.

- Netlify: sign in, drag the `apps/website` folder onto the deploy area, done.
  Add your domain under *Domain settings*.
- Cloudflare Pages: connect this Git repository, set the build command to
  `npm run build` and the output directory to `apps/website`.

Both give you free HTTPS automatically.

**2. Shared cPanel hosting (Hostinger, BigRock, GoDaddy — ₹150–400/month)**

Upload the contents of `apps/website` into `public_html` via the File Manager
or FTP. Enable the free Let's Encrypt SSL certificate from the cPanel
dashboard. Choose this if you also want email on your domain
(`sales@yourdomain.com`) in the same plan.

**3. GitHub Pages (free)**

Push this repository, then in *Settings → Pages* select the branch and set the
folder. Add a `CNAME` file with your domain.

### After launch — a short checklist

- [ ] HTTPS is on and `http://` redirects to `https://`
- [ ] The `www` and non-`www` versions both resolve to one canonical address
- [ ] `SITE_URL` in `build.mjs` matches the live domain, and you rebuilt
- [ ] Submit `sitemap.xml` in Google Search Console
- [ ] Create the Google Business Profile for the office and each site office
- [ ] Test every form — submit one yourself and confirm it arrives
- [ ] Test on a real phone, not just a narrow browser window
- [ ] Add your Google Analytics tag if you want traffic data
- [ ] Have your legal advisor review `privacy.html` before it goes public

---

## Technical notes

- **Responsive** from 360 px upward; the mobile navigation is a full-screen panel.
- **Accessible**: skip link, keyboard-navigable menu and accordions, focus
  rings, `aria-expanded` on toggles, live regions on form status messages, and
  `prefers-reduced-motion` respected.
- **SEO**: per-page titles and meta descriptions, canonical tags, Open Graph
  and Twitter cards, `RealEstateAgent` and `ApartmentComplex` structured data,
  generated `sitemap.xml` and `robots.txt`.
- **Forms** validate inline, carry a honeypot field against bots, and include
  the DNC/NDNC consent line Indian real estate marketing requires.
- **Fonts** are Cormorant Garamond and Jost, loaded from Google Fonts, with a
  system-serif and system-sans fallback if that request is ever blocked.
- **No tracking** is installed by default. Nothing phones home.
