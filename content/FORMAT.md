# Lesson format

Each chapter is one Markdown file in `content/tc/` (Complexity) or `content/ms/` (ModSim).
`python3 tools/build.py --verify` turns them into `content/tc.json` / `content/ms.json` and proves
every block works in CPython: examples run, predictions are deterministic, every reference
solution passes its tests and every starter fails them.

Tracks: `tc` Complexity, `ms` ModSim, `bx` Build your own X, `ps` Probability & Stats, `ds` DSA, `od` Structures.

Front matter: `id`, `num`, `title`, `tagline`, `world` (3D world id, optional), `part` (optional),
`minutes`, and a `goals:` list. `## Heading` starts a section. Plain Markdown between blocks is prose.

| Fence | What the learner does |
|---|---|
| ` ```prelude ` | Hidden setup run before every block in the chapter (imports). |
| ` ```run ` | Runs and edits an example. Runs share one namespace per chapter, like a notebook. Optional `title:` line. |
| ` ```predict ` | Types the output they expect, then runs it. Must be self-contained and deterministic. |
| ` ```parsons ` | Reorders scrambled lines. Lines starting `?? ` are decoys. Optional `---tests`/`---setup`. |
| ` ```exercise ` | `title:` and `kind:` (`fill`, `bug`, `write`, `rebuild`), then `---prompt`, the starter code, `---solution`, `---tests` (asserts with messages), optional `---setup` and any number of `---hint`. |
| ` ```quiz ` | Question lines, `- wrong` / `* right` options, `> explanation`. |
| ` ```recall ` | `Q:` then `A:`. The learner writes an answer, compares, and rates themselves. |
| ` ```bridge ` | A callout linking back to the 3D world. |
| ` ```viz ` | A live simulation from `learn/viz/<name>.js`: `name:`, `title:`, `goal:` (Markdown), optional `height:`, then an optional intro. Done when the learner reaches the goal. See [`learn/viz/README.md`](../learn/viz/README.md). |
| ` ```project ` | A real-world project: `title:`, optional `client:` and `skills:` (comma-separated), then `---brief`, `---why` (where this shows up in real software), `---milestones` (a `- ` list the learner ticks off) and optional `---stretch` ideas. The exercises after it in the same step are its parts. |

Everything the learner finishes joins a spaced-review deck (Leitner boxes: 1, 3, 7, 16, 35 days).

## Puzzles (puzzle mode)

` ```puzzle ` blocks don't appear in the lesson. They make up the chapter's **puzzle mode** (`#N/puzzle`, and
`#puzzles` lists every one in the track): no prose, just pictures to touch, checked in the page and scored with
1–3 stars (kept in `S.stars`). Header lines: `kind:`, `title:`, then kind-specific fields; parts: `---prompt`
and `---why` (shown once solved). The build proves each puzzle is solvable as written.

| `kind` | What the learner does | Needs |
|---|---|---|
| `swap` | Swaps cells until they match the goal. 3 stars at the fewest swaps. | `cells:`, optional `goal:` (default sorted), `adjacent: yes` for neighbours only, `par:` (checked by search) |
| `fix` | Taps every wrong cell in a picture. | `---grid`, `wrong: r,c …` (or column numbers for one row), optional `---fixed` (checked against `wrong`) |
| `frame` | Picks which picture comes next. | `---grid` (now), then two or more `---option` grids; the first is right |
| `order` | Taps steps into the order they happen. The order must be the only sensible one. | `---items`, one per line, in order |
| `target` | Drags sliders until a value lands on the target. | `expr:` (arithmetic valid in both Python and JS), `target:`, `tol:`, `output:`, `unit:`, and `---sliders` lines `name \| label \| min \| max \| step \| start` |

Grid cells are space-separated: `.` empty, `#` filled (blue), `*` active (red), `o` done (green), `+` focus (amber);
anything else is shown as text.
