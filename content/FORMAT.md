# Lesson format

Each chapter is one Markdown file in `content/tc/` (Think Complexity) or `content/ms/` (ModSim).
`python3 tools/build.py --verify` turns them into `content/tc.json` / `content/ms.json` and proves
every block works in CPython: examples run, predictions are deterministic, every reference
solution passes its tests and every starter fails them.

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

Everything the learner finishes joins a spaced-review deck (Leitner boxes: 1, 3, 7, 16, 35 days).
