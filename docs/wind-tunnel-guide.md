# Writing a Wind Tunnel experiment

Wind Tunnel teaches system design the way you'd actually learn it on the job. Something breaks, you poke at it until you
see why, you fix it under a budget, and then you carry the fix into real code. Every experiment follows the same
shape, so a learner always knows where they are and an author always knows what's missing.

## The shape

| Step | What the learner does | Where it lives |
|---|---|---|
| **The problem** | Meets the incident first, before any lesson: a launch, a page at 09:05, a surprise in a load test. | `incident` |
| **1 · Predict** | Commits to a number by dragging a pin. A guess they own makes the answer stick. | `predict` |
| **2 · Push it** | Pushes the live system until it bends, then reads the law that bent it. | `explore`, `why` |
| **3 · The fix** | Fixes the incident with a few knobs and a budget. The goal is measured live over 30 s. | `task` |
| **4 · Take it home** | Sees their own fix as code, as a real server's config, as what to watch in production, and as where their language changes it. | `tunnel/home.js` |

The problem card turns green once the task is done, so the arc closes where it opened.

## Rules

1. **One law per experiment.** Capacity, Little's law, load balancing, Zipf, metastability. Learners feel the law in
   the stage before they read its name.
2. **The incident is a real situation, not a lecture.** Write it the way someone would say it in a channel at work.
   Keep its numbers equal to the task's.
3. **Predict before you push.** The guess goes on the same axis as the dot chart, so the answer lands next to the pin.
4. **The fix has a budget.** Without a budget, the answer is always "more". With one, there's a right size.
5. **Every number is proved.** Each number the text states has a row in `quotes`, and `tools/tunnel-check.js` runs it
   against the simulator over several seeds. No number goes in on intuition.
6. **Take it home is real.**
   - The code uses the learner's own numbers from their finished design.
   - The code is under 60 characters a line, so it reads in the brief.
   - Runnable Python says what it prints on `# →` lines, and the check runs it and compares.
   - Where the code and the simulator compute the same thing (Python's `lru_cache` hit rate against the sim's), the
     check makes them agree.
   - Config uses real field names from real tools: gunicorn, nginx, Redis, Envoy, Locust. Write nothing you can't
     point to in that tool's documentation.
   - "Where your stack changes it" says what changes from one language or runtime to the next, not what stays the same.
7. **One new part or knob at a time.** Each experiment adds at most one thing to `tunnel/sim.js`, and that thing gets
   its own check against theory (Erlang C for queues, the ideal cache for LRU).
8. **The same server, growing.** Later experiments start from the earlier ones' server (4 workers, 50 ms), so the
   system grows the way a real one does and earlier numbers stay meaningful.

## Adding one

1. Write the planned entry first: `teaser` (the incident), `ask`, `fix` and `home`. If you can't write those four
   sentences, the experiment isn't ready.
2. Add what the simulator needs, with a theory check in `tools/tunnel-check.js`.
3. Write the live entry in `tunnel/experiments.js`: `incident`, `system`, `crowd`, `predict`, `explore`, `why`, `task`
   and `quotes`.
4. Write its Take it home in `tunnel/home.js`, with a `try` list of other designs so the code is right for any answer.
5. Run `node tools/tunnel-check.js` until it says ALL GOOD. Then drive the page end to end with `tools/e2e.js`, and
   render the shelf picture with `tools/lab-thumbs.js`.

## What's next, problem-first

Experiments 1 to 6 are live. Experiment 6, **Queues absorb bursts**, is the newest: a newsletter job hands the website
900 emails a minute, and the fix is a job queue with workers sized for the average, not the burst. Its sim parts
(`batch`, `jobWorkers`, `jobStats`) and its `teeth` chart are reusable for any experiment about background work.

The planned experiments in `tunnel/experiments.js` are already written in this shape:

- **7 · The database is the bottleneck.** A read replica makes reads fast, and users stop seeing their own comments.
  The fix: route reads and writes, and read your own writes from the primary.
- **8 · Rate limits.** One customer's script slows everyone. The fix: a token bucket per customer.
- **9 · Sharding and hot keys.** One viral account melts one shard. The fix: spread keys evenly, then treat the hot key
  specially.
- **10 · Distance.** Idle servers, slow pages far away. The fix: fewer round trips, then data closer to the user.
- **11 · Split brain.** A network cut sells the same seat twice. The fix: choose consistency or availability per
  operation.
- **12 · Design review.** Three designs, each with a target and a budget, defended with runs.

Experiment 8 reuses the most of what's built, so it comes next: it needs a token bucket per customer in front of the
server, a noisy customer, and 429s with Retry-After.
