# Tulip Labs

**Learn it by playing.** Tulip Labs teaches hard ideas by letting you handle them first. You move the pieces of an idea yourself, then watch it run as a simulation, then build it in real code, all in the browser with nothing to install.

**[tuliplabs.srivtx.xyz](https://tuliplabs.srivtx.xyz)** · a product by svx

![A city in Tulip Labs: red and blue households sort themselves into neighbourhoods as the model runs](docs/screenshot.png)

---

## What's inside

| Track | What you get |
|---|---|
| **[Worlds](https://tuliplabs.srivtx.xyz/worlds/)** | 12 interactive 3D worlds about complexity: segregating cities, viral parties, small worlds, sand piles, traffic jams, evolution, cooperation |
| **[Design](https://tuliplabs.srivtx.xyz/design/)** | 7 hands-on CSS courses, from type, colour and layout to posters, real interfaces and responsive design, matched pixel by pixel |
| **[Complexity](https://tuliplabs.srivtx.xyz/code/)** | 12 chapters of code behind the worlds: graphs, cellular automata, percolation, agent-based models |
| **[ModSim](https://tuliplabs.srivtx.xyz/modsim/)** | 26 chapters of modelling and simulation: epidemics, cooling, drag, orbits, bungee jumps |
| **[Build X](https://tuliplabs.srivtx.xyz/build/)** | 49 projects you build from scratch: a language and VM, a database, git, an editor, a CPU, an OS, a tiny GPT, Raft, a ray tracer |
| **[Stats](https://tuliplabs.srivtx.xyz/stats/)** | 13 chapters from counting to MCMC, ending in an honest A/B test |
| **[DSA](https://tuliplabs.srivtx.xyz/dsa/)** | 60 chapters of data structures and algorithms, each pattern shown in 3D, then a ladder of interview-style problems |
| **[Meadow](https://tuliplabs.srivtx.xyz/meadow/)** | An endless map of generated marks: wander, shape one, and save it as a logo, icon set, poster or animation |

<p align="center">
  <img src="docs/sugarscape.png" width="49%" alt="Agents gathering on two sugar mountains">
  <img src="docs/evolution.png" width="49%" alt="Organisms climbing a fitness landscape">
</p>

---

## How it teaches

1. **Do it by hand.** Before anything runs, you do the job yourself: move a household, link two guests, drop a grain of sand.
2. **Predict, then watch.** Lock in a guess, run the world, and you're graded against what happened in *your* run, not a canned answer.
3. **Name it last.** Terms like *phase transition* only appear once you've seen the thing happen.
4. **Build it.** Each chapter climbs one ladder: run, predict, reorder, fill the blanks, hunt the bug, write it from scratch, then explain it in your own words.
5. **See your code run.** When an exercise passes, *your* function drives the animation: your `life_step` fires the glider gun, and your traffic `step` sends the jam backwards.
6. **Keep it.** Everything you finish joins a spaced-review deck, so it comes back just before you'd forget it.

Along the way: click any block to see the rule behind it, pause or step through time, and collect ideas in a notebook and on a map of how they connect.

---

## Built to be trusted

- **Every lesson is checked before it ships.** `tools/build.py --verify` runs every block of every chapter:
  - every example runs and every prediction is deterministic;
  - every reference solution passes its tests and every starter fails them.
- **Every chapter is walked in a real browser.** `tools/e2e.js` steps through each one, solving each task as a learner would.
- **Numbers come from real runs.** Any figure quoted in a lesson was checked against a run, and the results in a world are computed live from yours.
- **Private by default.** Progress, notes and saved marks stay in your browser. There are no trackers and no ads.

---

## Pricing

Learning is **free forever**. **Pro** will add unlimited AI hints, the full puzzle library and a portfolio; it isn't open yet. See [pricing](https://tuliplabs.srivtx.xyz/pricing/).

---

## Under the hood

- **No build step for the site:** static HTML, CSS and JavaScript; lessons are prebuilt into `content/*.json`.
- **Python in the browser:** [Pyodide](https://pyodide.org/) runs in a Web Worker, with numpy, networkx, matplotlib, scipy, pandas and sympy. It has a Stop button for runaway loops and falls back to a mirror CDN if the first one fails.
- **3D:** [Three.js](https://threejs.org/). Each world draws through one instanced mesh, so tens of thousands of voxels stay smooth.
- **Meadow:** WebGL2. Every mark is drawn by a shader, and new ground is checked on the GPU without stalling the page.
- **One shell:** a shared top bar, footer and section switcher (`learn/nav.js`) on every page. The site follows your system's light or dark mode.

```
├── index.html            home
├── worlds/               3D worlds
├── design/               design courses and studio
├── code/ modsim/ build/ stats/ dsa/   coding tracks
├── meadow/               the mark generator (one file)
├── learn/                lesson engine, editor, Python worker, 3D simulations
├── content/              lessons as Markdown, built to JSON
├── tools/                build + verify, dev server, browser tests
└── pricing/ news/ privacy/ terms/ refunds/
```

---

## Run it locally

```bash
git clone https://github.com/srivtx/tuliplabs.git
cd tuliplabs
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

**To work on lessons:** edit `content/<track>/chNN.md` (the format is in [`content/FORMAT.md`](content/FORMAT.md)), then rebuild and check every block:

```bash
python3 tools/build.py --verify
```

This needs numpy, scipy, networkx, pandas and matplotlib.

**To test with a local Python runner:**

```bash
python3 tools/devserver.py 8000
```

Then open <http://localhost:8000/code/?runner=local>.

**To walk a chapter in a real browser** (needs Playwright):

```bash
node tools/e2e.js code 6
```

---

## License

Code is released under the [MIT License](LICENSE). Built by [svx](https://github.com/srivtx).
