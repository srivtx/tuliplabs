# Voxel Network Lab

**Learn complexity science by playing with it.** All 12 chapters of Allen B. Downey's *[Think Complexity](https://greenteapress.com/wp/think-complexity-2e/)* (2nd edition), rebuilt as interactive 3D voxel worlds. You move the households, host the party, drill the rock and drop the sand yourself, and only then does the computer run the model.

**Live:** https://voxel-network-lab.vercel.app

![Schelling's city in the lab: red and blue households form clusters as the model runs](docs/screenshot.png)

---

## Why this exists

Reading about emergence is not the same as watching it happen. Most textbook figures are a single frame of a moving system, and most explanations ask you to trust a conclusion you never checked yourself.

This lab is built around a different loop:

1. **Play it by hand.** Before any simulation runs, you do the agent's job yourself: move an unhappy household, introduce two guests, place a shortcut across a lake, choose your friends as a newcomer.
2. **Predict, then watch.** Each story asks you to lock in a guess first ("How many of the 400 agents survive?"). Then the world runs and grades you against what actually happened in *your* run, never against a canned answer.
3. **Name it last.** Words like *emergence*, *phase transition* or *self-organized criticality* only appear after you've seen the thing happen.
4. **Ask "why?" anywhere.** Turn on **Explain a block**, tap any voxel, and the world pauses to show the rule behind that one block, with the real numbers.

---

## The 12 worlds

| # | World | Chapter idea | What you do |
|---|-------|--------------|-------------|
| 1 | **City** | Complexity science, Schelling's segregation model | Inspect neighbourhoods, move unhappy households by hand, then test how a mild preference splits a city |
| 2 | **Party** | Random graphs (Erdős–Rényi), connectivity | Link 12 guests by hand, compare with random chatting, find the tipping point *p\* = ln(n)/n* |
| 3 | **Village** | Small-world graphs (Watts–Strogatz), BFS | Send a letter around a lake, then place one shortcut to get it there in 8 hand-offs or fewer |
| 4 | **Town** | Scale-free networks (Barabási–Albert) | Join as a newcomer, draw lottery tickets, watch hubs grow, test growth without popularity |
| 5 | **Automata** | 1-D cellular automata, Wolfram's classes | Predict the next row by hand, write your own rule table, sort rules 0/18/30/110 into classes |
| 6 | **Life** | Conway's Game of Life | Predict births and deaths, build a glider, fire the glider gun that disproved Conway's conjecture |
| 7 | **Rock & ink** | Percolation, fractals, reaction–diffusion | Drill through rock, find the critical porosity (≈ 0.593), measure a fractal dimension, grow Turing spots |
| 8 | **Sand** | Self-organized criticality | Trigger avalanches by hand, collect 3,000 of them, watch the pile tune itself, pour a fractal mandala |
| 9 | **Sugar** | Agent-based models (Sugarscape) | Survive as one agent, watch inequality emerge, try a tax, see migration waves move diagonally |
| 10 | **Traffic** | Traffic jams and Boids | Tap your brakes to start a backward-moving jam, design a better driver, steer a flock |
| 11 | **Evolution** | Fitness landscapes, selection, mutation | Switch the ingredients of evolution on and off, change the environment, watch a new species form |
| 12 | **Cooperate** | Prisoner's dilemma, evolution of cooperation | Play mystery opponents, build a 7-gene strategy, evolve cooperation from pure defectors |

<p align="center">
  <img src="docs/sugarscape.png" width="49%" alt="Sugarscape: agents on two sugar mountains">
  <img src="docs/evolution.png" width="49%" alt="Evolution on a fitness landscape: organisms stacked on top of genome columns">
</p>

---

## Teaching features

- **Guided stories:** every chapter has a step-by-step story (about 8–11 steps) with hands-on tasks, predictions and live results. Click a progress dot to revisit a step; arrow keys move forward and back.
- **Explain a block:** pause the world and see the rule behind any single voxel: a household's ✓/✗ neighbours, a Life cell's neighbour count, where a Sugarscape agent will move next, each gene's contribution to fitness.
- **Time bar:** pause, step one tick at a time, or slow everything to a quarter speed.
- **Think it through:** each story ends with application questions (not recall), each with an explanation.
- **Notebook:** 52 ideas collected in plain words as you meet them, saved in your browser.
- **Map of ideas:** every concept laid out by chapter, with lines showing where an idea returns. For example, the party's tipping point is the same shape as percolation's critical point, and the sand pile finds that point by itself.
- **Quiz me:** a mixed review round drawn from the chapters you've played.
- **Free play:** every world also has its own controls, sliders and live charts for open-ended experiments.

---

## Is it faithful to the book?

The simulations follow the models as the book describes them. Key numbers were checked by running the models headless before the stories were written:

| Check | Book | This lab |
|-------|------|----------|
| Sugarscape survivors after 100 steps (from 400) | ≈ 250 | ≈ 241 |
| Percolation critical porosity | ≈ 0.59 | jump between 0.55 and 0.65 |
| Fractal dimension of the percolating cluster | ≈ 1.85 | ≈ 1.87–1.89 |
| Sand pile average height in steady state | – | ≈ 2.07 |
| Traffic: 20 cars, no noise | all at speed 40 | 40.0 |

Where the stories quote a result, it is computed live from your own run. One honest caveat: the book's version 2.6.4 notes a bug in the original code for Chapter 12. This lab uses the corrected rule (fitter agents more likely to *survive*), so cooperation rises and collapses in waves, and your runs may differ from the figures in older copies of the book.

---

## Controls

| Action | Mouse | Touch |
|--------|-------|-------|
| Spin the world | drag | drag |
| Zoom | scroll | pinch |
| Interact | click a block | tap a block |
| Move the Boids' carrot | click the ground | tap the ground |
| Next / previous story step | → / ← | buttons |

---

## Run it locally

It's a single self-contained HTML file with no build step.

```bash
git clone https://github.com/srivtx/voxel-network-lab.git
cd voxel-network-lab
npx serve .        # or: python3 -m http.server
```

Then open the printed address. Opening `index.html` directly also works.

---

## How it's built

- **One file:** `index.html` holds all the markup, styles and JavaScript (~270 KB).
- **3D:** [Three.js r128](https://threejs.org/), loaded from cdnjs. Every world draws through a single `InstancedMesh` of cubes, so tens of thousands of voxels stay smooth.
- **Charts:** a small hand-written canvas chart routine (linear and log-log axes).
- **No backend:** progress and the notebook live in `localStorage`; nothing is sent anywhere.
- **Themes:** follows your system's light or dark mode.

```
voxel-network-lab/
├── index.html      # the whole app
├── docs/           # README screenshots
├── vercel.json     # static hosting config
└── LICENSE
```

---

## Credits

- Models and chapter structure from **Allen B. Downey, *Think Complexity*, 2nd edition** (Green Tea Press / O'Reilly). The book is free to read at [greenteapress.com](https://greenteapress.com/wp/think-complexity-2e/). This project is an independent study companion, not affiliated with the author or publisher.
- Original models by Schelling; Erdős and Rényi; Watts and Strogatz; Barabási and Albert; Wolfram; Conway; Bak, Tang and Wiesenfeld; Epstein and Axtell; Resnick; Reynolds; Kauffman; and Axelrod.
- Built by [Sribatsha Dash (@srivtx)](https://github.com/srivtx).

## License

The code is released under the [MIT License](LICENSE).
