/* Build your own X, chapter 23: a spreadsheet engine.
   A 3 × 3 sheet. Some cells hold numbers, some hold formulas that read other cells, and some of
   those cells come later in reading order. Change A1 with the slider and watch the engine
   recalculate, one cell at a time, numbered in the order it visits them.
   The "why": the naive engine recomputes every cell once, top to bottom, so a formula that reads a
   cell further down sees its old value and shows a wrong number. The real engine follows the
   dependency graph: it recomputes only the cells that depend on the change, each one after
   everything it reads (a topological order), and refuses cycles. */
VIZ.register("bx-sheet", async (api) => {
  const W = await api.world3d();
  const ORDER = ["A1", "B1", "C1", "A2", "B2", "C2", "A3", "B3", "C3"];
  const BASE = { A1: "10", B1: "=A1*2", C1: "=B3+B1", A2: "=B2+1", B2: "=A1+5", C2: "=A3*4", A3: "3", B3: "=A2*A3", C3: "=C2-A1" };
  let src = { ...BASE }, val = {}, mode = "naive", sawWrong = false, reached = false, busy = false, lastCount = 0, visit = {};
  const refs = (f) => (f.startsWith("=") ? [...new Set(f.match(/[A-C][1-3]/g) || [])] : []);
  const calc = (cell, v) => { const f = src[cell]; if (!f.startsWith("=")) return +f; return Function(...ORDER, `return ${f.slice(1)};`)(...ORDER.map((c) => v[c])); };
  // Cells on a cycle (or depending on one) can't be computed.
  function cyclic() {
    const state = {}, bad = new Set();
    const dfs = (c) => { if (state[c] === 1) return true; if (state[c] === 2) return bad.has(c); state[c] = 1; let b = false; for (const r of refs(src[c])) if (dfs(r)) b = true; state[c] = 2; if (b) bad.add(c); return b; };
    ORDER.forEach(dfs);
    return bad;
  }
  // The true values: evaluate each cell after everything it reads.
  function truth() {
    const bad = cyclic(), t = {};
    const get = (c) => { if (bad.has(c)) return NaN; if (!(c in t)) { refs(src[c]).forEach(get); t[c] = calc(c, t); } return t[c]; };
    ORDER.forEach(get);
    return t;
  }
  const dependents = (cell) => { const out = new Set(), q = [cell]; while (q.length) { const c = q.shift(); for (const d of ORDER) if (refs(src[d]).includes(c) && !out.has(d)) { out.add(d); q.push(d); } } return out; };
  function topoOf(cells) {
    const seen = new Set(), order = [];
    const visitC = (c) => { if (seen.has(c)) return; seen.add(c); refs(src[c]).filter((r) => cells.has(r)).forEach(visitC); order.push(c); };
    ORDER.filter((c) => cells.has(c)).forEach(visitC);
    return order;
  }
  const pos = (c) => ({ x: (c.charCodeAt(0) - 66) * 2.6, y: (2 - +c[1]) * 1.55 });
  const fmt = (x) => (Number.isNaN(x) ? "#CYCLE" : String(Math.round(x * 100) / 100));
  function draw(active) {
    const t = truth(), bad = cyclic();
    let wrong = 0;
    ORDER.forEach((c) => {
      const isF = src[c].startsWith("="), ok = bad.has(c) ? true : val[c] === t[c];
      if (!ok) wrong++;
      const { x, y } = pos(c);
      W.box(c, { x, y, z: 0, sx: 2.2, sy: 1.15, sz: 0.4, color: c === active ? "c4" : bad.has(c) ? "bad" : !ok ? "c1" : isF ? "c2" : "c3", glow: c === active ? 0.5 : 0, opacity: 0.95,
        label: `${c}  ${isF ? src[c] : ""}\n${bad.has(c) ? "#CYCLE" : fmt(val[c])}${visit[c] ? `   (${visit[c]})` : ""}`, labelSize: 0.27, labelUp: -0.95,
        info: { title: `${c}${isF ? ` = ${src[c].slice(1)}` : ` = ${src[c]}`}`, html: isF
          ? `<p>Reads <b>${refs(src[c]).join(", ")}</b>. Shown value: <b>${bad.has(c) ? "#CYCLE" : fmt(val[c])}</b>; correct value: <b>${fmt(t[c])}</b>.</p><p>${bad.has(c) ? "This cell is on (or reads from) a <b>cycle</b>: to compute it you'd need its own value first. A spreadsheet reports an error instead of looping forever." : ok ? "It was computed after every cell it reads, so it's right." : "It was computed <b>before</b> a cell it reads had been updated, so it used a stale value."}</p>`
          : `<p>A plain number. Cells that read it: <b>${[...dependents(c)].join(", ") || "none"}</b> (directly or through other cells).</p>` } });
    });
    ORDER.forEach((c) => refs(src[c]).forEach((r) => W.line(`${r}>${c}`, r, c, { color: bad.has(c) && bad.has(r) ? "bad" : "c4", opacity: 0.55 })));
    ["A", "B", "C"].forEach((l, i) => W.label("col" + l, l, [(i - 1) * 2.6, 2.4, 0], { color: "muted", size: 0.35 }));
    api.status(`${mode === "topo" ? "dependency order: only cells that depend on the change" : "naive: every cell, top to bottom, once"}\n` +
      `cells recomputed: ${lastCount}   ·   wrong values on screen: ${wrong}`);
    return wrong;
  }
  async function recalc(changed) {
    busy = true; visit = {};
    let order;
    if (mode === "naive") order = ORDER.filter((c) => src[c].startsWith("="));
    else { const bad = cyclic(); order = topoOf(dependents(changed)).filter((c) => !bad.has(c)); }
    lastCount = order.length;
    for (const [k, c] of order.entries()) {
      try { val[c] = calc(c, val); } catch (e) { val[c] = NaN; }
      visit[c] = k + 1; draw(c); W.flash(c);
      await api.sleep(260);
    }
    cyclic().forEach((c) => (val[c] = NaN));
    const wrong = draw();
    busy = false;
    if (mode === "naive" && wrong) {
      sawWrong = true;
      api.explain("Some numbers are wrong", `<p>The orange cells read a cell that comes <b>later</b> in reading order, so they were computed from its <b>old</b> value. Look at the visit numbers: C1 (visited early) reads B3 (visited late).</p><p>Switch to <b>dependency order</b> and change A1 again.</p>`);
    } else if (mode === "topo" && !wrong && sawWrong && !reached && !cyclic().size) {
      reached = true;
      api.explain("Every number is right, with less work", `<p>The engine recomputed only the ${lastCount} cells downstream of A1, each one after everything it reads. That ordering is a <b>topological sort</b> of the dependency graph, the same idea build tools (make, Bazel) and React-style UIs use to update only what changed.</p>`);
      api.done("You recalculated a sheet in dependency order");
    }
  }
  function reset() { src = { ...BASE }; const t = truth(); val = { ...t }; visit = {}; lastCount = 0; }
  W.onPick((key) => { if (!ORDER.includes(key)) return false; });
  const s = api.slider("A1", { min: 0, max: 20, step: 1, value: 10 }, (v) => { if (busy) return; src.A1 = String(v); val.A1 = v; recalc("A1"); });
  api.seg([{ label: "naive: top to bottom", value: "naive" }, { label: "dependency order", value: "topo" }], mode, (v) => { mode = v; draw(); });
  api.button("Make a cycle (B3 reads C1)", () => {
    if (busy) return;
    src.B3 = src.B3 === "=A2*A3" ? "=A2*C1" : "=A2*A3";
    const bad = cyclic();
    if (bad.size) { bad.forEach((c) => (val[c] = NaN)); api.explain("A cycle", "<p>B3 now reads C1, and C1 reads B3. Neither can be computed first, so the engine marks both <b>#CYCLE</b> (Excel says <i>circular reference</i>). Press the button again to undo it.</p>"); }
    else { Object.assign(val, truth()); }
    draw();
  });
  api.button("Reset", () => { if (busy) return; reset(); s.set && s.set(10); draw(); });
  W.camera({ target: [0, 0.6, 0], dist: 12.5, theta: 0, phi: 1.5, instant: true });
  api.hud("move the A1 slider · numbers in brackets = recalculation order · lines = 'reads from'");
  reset(); draw();
  api.explain("How to read this", "<p>Green cells hold numbers, blue cells hold formulas, and the lines show which cells each formula reads.</p><p>The engine starts in <b>naive</b> mode. Move the <b>A1</b> slider and watch the order it recomputes cells in. Do the numbers stay right?</p>");
});
