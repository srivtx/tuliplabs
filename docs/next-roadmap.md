# What comes next (planned 2026-11-02)

Three things, in this order. Each one uses the same engine (`learn/engine.js`) and the same
look (warm paper / black paper, serif titles, pink keycaps, voxel sims).

## 1. Puzzle mode (every track)

A switch on each lesson page: **Learn** ↔ **Puzzle**. Puzzle mode hides the prose and turns the
chapter's sim into a challenge you solve by touching it, not by reading.

Puzzle kinds, all drawn in the sim canvas:

| Kind | What you do | Example |
|---|---|---|
| Predict the frame | The sim pauses; pick which of 3 next frames is right | Game of Life, BFS front |
| Fix the picture | A broken state is shown; click the cells that are wrong | Heap with one bad node |
| Hit the target | Drag sliders until the curve passes through the pins | ModSim growth rate |
| Fewest moves | Reach the goal state in as few clicks as possible | Sorting, union-find |
| Order the steps | Drag code lines / sim snapshots into the right order | Dijkstra, git commit |

- Each puzzle is a JSON block in `content/<track>.json` (`"type": "puzzle"`), checked in JS, no Python.
- Score: stars for fewest moves; a solved puzzle grows the chapter flower like a task.
- A **Puzzles** page lists every puzzle across tracks as a grid of keycaps you can play in any order.

## 2. System design track (`sd`, colour teal-blue)

You actually build and run the system in a voxel city, then watch it break under load.

- Each server, cache, queue and database is a voxel block; requests are glowing cubes moving between them.
- A load slider pushes traffic up; blocks turn red, queues pile up, latency graph climbs.
- You fix it by placing parts (add cache, add replica, shard, add queue) and re-running.
- Chapters: one server → load balancer → caching → databases & replicas → sharding →
  queues & async work → rate limiting → CDN → consistency & CAP → design a URL shortener →
  design a chat app → design a news feed → design a video site.
- Each chapter ends with a "design review" task: hit a latency and cost target with a budget of parts.

## 3. Linear algebra you can see (`la`)

Vectors, matrices as "what happens to the grid when I drag it", dot products, projections,
eigenvectors, SVD, then gradients. Unlocks the Build X neural net, 3D engine, ray tracer and GPT.

## 4. Design & CSS lab (`dz`)

A track where the task is to make something beautiful, and the check is visual, not text output.

- Left: a tiny HTML/CSS editor. Right: your result and the target, with an onion-skin slider between them.
- Checked by comparing pixels with the target (a match score and a heat map of where you're off), plus rule checks
  ("uses grid", "no fixed widths").
- Chapters: boxes and spacing → type and rhythm → colour tokens and themes → flex → grid → pixel posters
  (rebuild a Swiss poster, a striped sign, a pixel flower) → responsive → motion → a design system → a landing page.
- Finale per chapter: your piece hangs in a gallery wall on the track page.

## 5. 3D worlds: make the hands-on part easier to find

The worlds already teach: each one has a "Play the guided story" with tasks (be the computer and predict
the next row, hit a target), a notebook of ideas you unlock, and Quiz me. It just isn't obvious on arrival.
Plan: open new visitors straight into story 1, and mark each world tab with its story progress.

## Visual polish to fold in while building

- Lesson cover art per track drawn in the same isometric voxel style as the home hero.
- Sim canvases follow the Light / Dark switch (paper background in light mode).
- Finish screen: the flower blooms with a short pixel animation when a chapter completes.
- Track pages: a "you are here" voxel path showing chapters as stepping stones.

## Still open from before

- Complexity and ModSim chapters left to finish.
- DSA ch45–60, the ODS book track.
