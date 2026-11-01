# Live simulations (`learn/viz/`)

A lesson's ` ```viz ` block mounts one file from this folder. Each file is plain JavaScript (no
build step, no imports) that calls `VIZ.register(name, setup)`; the name must equal the file name.
`core.js` loads the file the first time a lesson needs it, and loads three.js r128 only when a
simulation asks for a 3D world.

```markdown
```viz
name: bx-git                      # learn/viz/bx-git.js
title: Commits are snapshots, linked by hashes
goal: Make a branch, commit on it, then **merge** it back.    # Markdown inline; shown as "Your goal"
height: 400                       # optional, px (default 380)
Optional intro paragraph in Markdown.
```
```

## What a good simulation does

The learner is building intuition, not watching a demo. Every simulation should:

1. **Show the moving parts as separate blocks** (voxels): each component of the system is a block,
   coloured by role, with a short label. Data that flows is a block that *moves*.
2. **Answer "why" on click.** Every block gets `info: {title, html}`. The html says what this part
   does **and why it's designed this way** (what would break with the obvious alternative).
3. **Compare against the naive choice.** Wherever the real design beats a simpler one, give a toggle
   (`api.seg`) that switches to the naive version and shows a number that gets worse (bytes copied,
   pages read, steps taken, error grown). That's how the "why" becomes visible.
4. **Have one goal.** Call `api.done("short praise")` once, when the learner does the thing the
   `goal:` asks. Make the goal require *doing*, not just clicking "next".
5. **Step, don't rush.** Offer a `Step` button (and `Run all` with `await api.sleep(ms)` between
   steps). Write what just happened to `api.status(...)` in one or two lines.
6. Start in a useful state (something already on screen), and stay smooth with a few hundred blocks.

Colours are CSS variable names, so both themes work: `c1` red-orange, `c2` blue, `c3` green-teal,
`c4` amber, `c5` grey, `ok`, `bad`, `ink`, `muted`, `line`, `card`.
Convention: **c2 = data/values, c1 = operations/active, c3 = done/correct, c4 = highlight/focus, c5 = inactive.**

## API

`setup(api)` may be `async`. Everything is created inside `api.root`.

| Call | What it does |
|---|---|
| `await api.world3d()` | A 3D voxel world in the view (drag to orbit, wheel/pinch to zoom, click picks). Returns `W`. |
| `api.canvas2d(draw)` | A 2-D canvas filling the view instead. `draw(g, w, h)` runs on resize and on `cv.redraw()`. Returns `cv = {canvas, g, w, h, redraw}`. Use for charts, histograms, pixel grids. |
| `api.button(label, fn, {primary, row})` | A button; buttons share a row until another control is added. |
| `api.row()` | Start a new row of buttons; pass it as `{row}` to place buttons in it. |
| `api.slider(label, {min, max, step, value, format}, fn)` | Returns `{el, get, set}`. |
| `api.seg([{label, value}…], value, fn)` | Segmented toggle. Returns `{get}`. |
| `api.text(label, value, fn, {live, placeholder})` | Text input; `fn(value)` on Enter (or every keystroke with `live`). Returns `{get, set}`. |
| `api.status(text)` / `api.statusHTML(html)` | Monospace status box under the controls. |
| `api.explain(title, html)` | The "why" panel. Clicking a block with `info` fills it automatically. |
| `api.hud(html)` | Small text overlaid on the top-left of the view. |
| `api.loop(fn(dt, t))` | Per-frame callback (only while on screen). Returns a stop function. |
| `api.sleep(ms)` | Promise; returns at once when the user prefers reduced motion. |
| `api.done(msg)` | Goal reached: marks the block done, awards XP, shows `msg`. |
| `api.wasDone` | True if the learner already reached the goal before. |
| `api.color(name)` | Resolve a CSS colour variable, for 2-D drawing. |
| `api.h(tag, attrs, ...kids)` | Tiny DOM helper, if you need custom HTML in `api.ctl`. |

### The 3D world `W`

| Call | What it does |
|---|---|
| `W.box(key, {x, y, z, s \| sx, sy, sz, color, opacity, glow, label, labelColor, labelSize, info, visible, instant, fromX/fromY/fromZ})` | Create or update a voxel. Updating an existing key **glides** it to the new position, so moving data is just calling `box` again. `label` is a short text sprite above the block (`\n` for two lines). `glow` 0–1 makes it emissive. |
| `W.remove(key)`, `W.clear()`, `W.has(key)`, `W.pos(key)` | Manage voxels. |
| `W.line(key, a, b, {color, opacity})` | A line between two voxel keys (or `[x,y,z]` points). It follows the voxels as they move. `W.unline(key)`. |
| `W.label(key, text, [x,y,z], {color, size})` | Free-floating text. `null` text removes it. |
| `W.flash(key)` | A quick pulse to draw the eye. |
| `W.camera({target:[x,y,z], dist, theta, phi, instant})` | Aim the camera (it glides). `theta` spins around, `phi` tilts (0 = top view, π/2 = side view). |
| `W.onPick(fn(key, info))` | Custom click handling; return `false` to skip the default explain panel. |
| `W.frame(fn(dt))` | Per-frame hook after positions update. |
| `W.THREE`, `W.scene`, `W.camera` | Raw three.js r128, for anything custom (keep it modest). |

Units: one voxel is 1 unit. Lay things out on a grid with ~1.2–1.6 spacing; y is up.

`bx-calc.js` is a complete example: tokens → tree → evaluation, a naive left-to-right comparison,
click-to-explain on every block, and a goal.
