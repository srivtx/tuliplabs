# Launch plan (written 2026-11-03)

Order: finish the visual pass first, then sign-in and sync, then hosting and pricing, then back to chapters.

## 1. A name

**Decided 2026-11-03: Tulip Labs, a product by svx** (domain to buy: `tuliplabs.dev`; `tuliplabs.io` as a backup,
`tuliplabs.com` is for sale). The site is renamed; the notes below are how we got there. Plain "Tulip" was
set aside because a known software company uses it and the short domains are taken.

**What the reference pictures share:** a grid of squares that grows into something alive. A bloom made of pixels
(the Bloom poster, Hiraku's `RenderFlowers()`, the pixel tulip), woven squares (the textile posters, the plant bag),
a path drawn through a grid (the tile puzzle), and things built from keys and blocks (the keycap cat, the paper grove).
That is what the lab does too: you poke a grid of voxels, and your garden blooms a chapter at a time.

| Name | Why it fits | Domain check (DNS only, 2026-11-03) |
|---|---|---|
| **Voxbloom** (pick) | Keeps the voxel heritage and adds the growing. Fits the tulip mark. Easy to say, easy to search. | `.com` is parked for sale; `.dev` and `.app` show no DNS, so they are probably free |
| Plot | A garden plot where chapters grow, and plotting a graph. Very short, but hard to own in search. | not checked, almost certainly taken |
| Tessel | One tile in a mosaic: every chapter is a tile. Crafty, but a bit cold. | `tessel.dev` is taken |
| Voxel Network Lab (keep) | Says exactly what it is; becomes the subtitle if we rename. | `voxelnetworklab.com` shows no DNS |

First pick was Voxbloom, a product by svx. It's "Grok by xAI"-shaped: the product name up front, the studio after it.

- Wordmark: `vox` in Pixelify Sans (the voxel voice) plus *bloom* in Instrument Serif italic (the poster voice).
  Both type voices are already on the site.
- Mark: the pixel tulip stays.
- Tagline: *Watch it grow. Then build it.*
- Keep "Voxel Network Lab" for a while as the hero subtitle so returning people recognise it.

Nothing is renamed yet: renaming touches every page title, the logo text and the domain, so it waits for a yes.

## 2. Hosting

| | Now | Plan |
|---|---|---|
| Static site | Vercel, Hobby plan | **Cloudflare Pages**, free |
| Why move | Vercel's Hobby plan is for personal, non-commercial use, so it can't host a paid product | Cloudflare's free plan allows commercial use, has no bandwidth bill, and serves from a worldwide edge network |
| Python | Pyodide from jsDelivr, running in the learner's browser | Same, with our own copy on Cloudflare as a fallback |
| Small server bits | none | Cloudflare Workers for payment webhooks and the AI-hint proxy |

The big win: every simulation and every line of Python runs on the learner's machine, so hosting stays nearly free
however many people come.

## 3. Sign in

**Pick: Supabase Auth**, with **Continue with Google**, **Continue with GitHub**, and an **email magic link**.
There are no passwords to store and nothing for us to leak. Supabase gives sign-in and a Postgres database
in one service, and its free tier covers launch.

- **Guest first.** Nobody ever has to sign in to learn. Signing in only carries your progress between devices.
- **The button.** A quiet `Sign in` keycap at the right of the top bar opens a small sheet with the tulip, the
  three sign-in buttons, and one line: "Your progress in this browser comes with you."
- **Signed in.** Your initials appear on a keycap. Its menu shows that sync is on, an export option, and sign out.
- **Sync.** One row per person holds the same JSON that lives in localStorage today (`vnl-code-v1` and
  `vnl-progress`). It saves a few seconds after each change and when the tab closes.
  - Merging two devices: finished tasks are combined from both, counters keep the larger number, and review
    dates keep the latest one.
- **Safety.** Postgres row-level security means each person can read and write only their own row. The public key
  in the page can't reach anyone else's data.
- **Watch out:** free Supabase projects pause after a week with no traffic. Move to Pro ($25 a month) at launch.

## 4. Pricing

**Rule: learning is free forever.** We never lock a chapter. People pay for things that cost us money to run
or that save them time.

| | Free | Pro | Schools and teams |
|---|---|---|---|
| Price | $0 | **$8 a month or $72 a year**; students $4 a month; lower prices by region | $5 per seat per month |
| Every track, chapter, simulation, hidden test and 3D world | ✓ | ✓ | ✓ |
| Python in the page, the garden, XP, the review queue | ✓ | ✓ | ✓ |
| Sign in and sync across devices | ✓ | ✓ | ✓ |
| AI hints ("why does my code fail?") | 5 a day | Unlimited | Unlimited |
| Puzzle mode | Daily set | Full library, plus timed mock interviews | ✓ |
| Certificates and a public portfolio page (shipped builds, garden, design gallery) | | ✓ | ✓ |
| New tracks 30 days early | | ✓ | ✓ |
| Offline install | | ✓ | ✓ |
| A class dashboard where teachers assign chapters | | | ✓ |

- **Founders deal:** lifetime Pro for $149, open to the first 300 people.
- **Payments:** a merchant of record (**Lemon Squeezy** or **Paddle**). They are the legal seller, so they handle
  sales tax and VAT in every country and send the invoices. A one-person studio then doesn't need to register
  for tax abroad.
- **AI hints:** run through a Cloudflare Worker that holds the API key on the server and counts daily use.
  They use a small, fast Claude model.
- **Running costs at launch:** about $25 a month (Supabase Pro), plus a domain at roughly $12 a year,
  plus AI hints that grow with use. **Four Pro subscribers cover it.**

## 5. Build order

1. **Visual pass.** Done today: the showcase rows on home, the svx mark, product news.
2. **Sign-in sheet and Supabase sync.** Built behind a flag, then switched on.
3. **Move to Cloudflare Pages on tuliplabs.dev.**
4. **Pricing page**, styled as three keycaps, plus checkout and a Pro flag on the account.
5. **AI hints** through the Worker.
6. **Back to chapters:**
   - finish Complexity and ModSim
   - DSA chapters 45–60 and the ODS track
   - then puzzle mode, system design, linear algebra and the design lab, in `docs/next-roadmap.md` order
