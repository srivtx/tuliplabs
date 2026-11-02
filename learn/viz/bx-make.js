/* Build your own X, chapter 27: a build system.
   A small C project as a dependency graph: source files on the left, the object files compiled from
   them in the middle, and the app linked from those on the right (plus docs made from the README).
   Every file has a modified time t. Edit a source file, then Build.
   The "why": rebuilding everything is always correct but slow; a real project has thousands of
   files and you changed one. make's rule: a target is stale if any input is newer than it. Build
   the inputs first (they may be stale too), then rebuild only stale targets. That's why changing a
   header rebuilds every file that includes it, while changing the README rebuilds only the docs. */
VIZ.register("bx-make", async (api) => {
  const W = await api.world3d();
  const NODES = {
    "main.c": { x: -5, y: 3 }, "util.h": { x: -5, y: 1.8 }, "util.c": { x: -5, y: 0.6 }, "net.h": { x: -5, y: -0.6 }, "net.c": { x: -5, y: -1.8 }, "README.md": { x: -5, y: -3.2 },
    "main.o": { x: 0, y: 2.4, deps: ["main.c", "util.h", "net.h"], cost: 3, cmd: "cc -c main.c" },
    "util.o": { x: 0, y: 0.6, deps: ["util.c", "util.h"], cost: 3, cmd: "cc -c util.c" },
    "net.o": { x: 0, y: -1.2, deps: ["net.c", "net.h"], cost: 3, cmd: "cc -c net.c" },
    "app": { x: 5, y: 0.6, deps: ["main.o", "util.o", "net.o"], cost: 2, cmd: "cc -o app *.o" },
    "docs.html": { x: 5, y: -3.2, deps: ["README.md"], cost: 2, cmd: "pandoc README.md" },
  };
  const NAMES = Object.keys(NODES), TARGETS = NAMES.filter((n) => NODES[n].deps), SOURCES = NAMES.filter((n) => !NODES[n].deps);
  let mode = "make", clock = 10, mtime = {}, busy = false, triedAll = false, reached = false, edited = false, lastBuilt = new Set();
  const reset = () => { clock = 10; SOURCES.forEach((s, i) => (mtime[s] = 1 + i % 3)); TARGETS.forEach((t) => (mtime[t] = 5 + (t === "app" ? 2 : t === "docs.html" ? 1 : 0))); lastBuilt = new Set(); edited = false; };
  // Would make rebuild this target? Its inputs may be targets that are stale themselves.
  function stale(t) { const n = NODES[t]; if (!n.deps) return false; return n.deps.some((d) => stale(d) || mtime[d] > mtime[t]); }
  function draw(active) {
    NAMES.forEach((n) => {
      const N = NODES[n], isT = !!N.deps, st = isT && stale(n);
      W.box(n, { x: N.x, y: N.y, z: 0, sx: 2.6, sy: 0.85, sz: 0.5, color: n === active ? "c4" : !isT ? "c2" : st ? "c1" : "c3", glow: n === active ? 0.6 : lastBuilt.has(n) ? 0.25 : 0,
        label: `${n}\nt = ${mtime[n]}`, labelSize: 0.33, labelUp: -0.8,
        info: { title: n, html: isT
          ? `<p>Built by <code>${N.cmd}</code> from <b>${N.deps.join(", ")}</b> (about ${N.cost} s).</p><p>${st ? "<b>Stale</b>: an input is newer than it (or an input is stale itself), so make will rebuild it." : "<b>Up to date</b>: it's newer than every input, so make skips it."}</p>`
          : `<p>A source file you edit. Modified at t = ${mtime[n]}. Files built from it: <b>${TARGETS.filter((t) => NODES[t].deps.includes(n)).join(", ")}</b>.</p>` } });
    });
    TARGETS.forEach((t) => NODES[t].deps.forEach((d) => W.line(`${d}>${t}`, d, t, { color: "muted", opacity: 0.5 })));
    [["sources", -5], ["object files", 0], ["outputs", 5]].forEach(([t, x]) => W.label("h" + t, t, [x, 4.2, 0], { color: "muted", size: 0.34 }));
  }
  function status(extra = "") {
    api.status(`clock: t = ${clock}   ·   ${mode === "make" ? "make: only stale targets" : "rebuild everything"}\n` +
      `stale now: ${TARGETS.filter(stale).join(", ") || "nothing"}${extra}`);
  }
  async function build() {
    if (busy) return;
    busy = true; lastBuilt = new Set();
    let secs = 0, allSecs = TARGETS.reduce((s, t) => s + NODES[t].cost, 0);
    const done = new Set();
    // Depth first: build every input before deciding about the target itself.
    async function make(t) {
      if (!NODES[t].deps || done.has(t)) return;
      done.add(t);
      for (const d of NODES[t].deps) await make(d);
      if (mode === "all" || NODES[t].deps.some((d) => mtime[d] > mtime[t])) {
        draw(t); W.flash(t); await api.sleep(150 * NODES[t].cost);
        mtime[t] = ++clock; secs += NODES[t].cost; lastBuilt.add(t); draw();
      }
    }
    for (const t of ["app", "docs.html"]) await make(t);
    draw();
    const n = lastBuilt.size;
    status(`\nlast build: ran ${n} of ${TARGETS.length} commands, ${secs} s (everything would take ${allSecs} s)`);
    if (mode === "all") triedAll = true;
    if (mode === "make" && edited && triedAll && n < TARGETS.length && !reached) {
      reached = true;
      api.explain("Only what was stale", `<p>make rebuilt ${n} of ${TARGETS.length} targets: the ones downstream of your edit. Everything else was newer than all its inputs, so it was skipped. On a big project that's the difference between seconds and an hour.</p>`);
      api.done("You rebuilt only what was stale");
    } else if (mode === "all") api.explain("Rebuild everything", `<p>Correct, but it ran all ${TARGETS.length} commands (${secs} s) whatever you changed. Switch to <b>make</b>, edit one file, and build again.</p>`);
    edited = false; busy = false;
  }
  function edit(f) {
    if (busy) return;
    mtime[f] = ++clock; edited = true; lastBuilt = new Set();
    draw(); W.flash(f); status();
    api.explain(`You edited ${f}`, `<p>Its time is now t = ${clock}, newer than ${TARGETS.filter((t) => NODES[t].deps.includes(f)).join(" and ")}. Red targets are stale: either an input is newer, or an input is stale itself (and will become newer once it's rebuilt).</p>`);
  }
  api.button("Build", build, { primary: true });
  api.seg([{ label: "make: only stale", value: "make" }, { label: "rebuild everything", value: "all" }], mode, (m) => { mode = m; status(); });
  const r = api.row();
  api.button("Edit util.h", () => edit("util.h"), { row: r });
  api.button("Edit net.c", () => edit("net.c"), { row: r });
  api.button("Edit README.md", () => edit("README.md"), { row: r });
  api.button("Reset", () => { if (!busy) { reset(); draw(); status(); } }, { row: r });
  W.camera({ target: [0, 0.4, 0], dist: 17.5, theta: 0, phi: 1.35, instant: true });
  api.hud("blue = sources · red = stale · green = up to date · t = last modified time");
  reset(); draw(); status();
  api.explain("How to read this", "<p>Each arrow means \"is built from\". Every file has a modified time <b>t</b>; the clock ticks up whenever something is written.</p><p>Edit a file and press <b>Build</b>, first with <b>rebuild everything</b>, then with <b>make</b>.</p>");
});
