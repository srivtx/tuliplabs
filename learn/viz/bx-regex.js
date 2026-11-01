/* Build your own X, chapter 5: a regex engine.
   The pattern is compiled into an NFA (Thompson's construction): states are blocks, arrows are lines.
   The text is a row of character blocks. Step through it two ways:
   - NFA: one character per step, the whole SET of possible states lights up.
   - Backtracking: one state visit per step, following one path and backing up on failure.
   The "why": count the steps. On (a?)^n a^n backtracking doubles with every n; the set stays small. */
VIZ.register("bx-regex", async (api) => {
  const W = await api.world3d();
  const X = 1.05, Y = 1.25, CAP = 250000;

  // ---- parser: the same recursive descent as the chapter (| loosest, then concatenation, then * ?)
  function parse(src) {
    let p = 0;
    const peek = () => src[p];
    function alt() { let n = cat(); while (peek() === "|") { p++; n = { k: "alt", a: n, b: cat() }; } return n; }
    function cat() {
      let n = null;
      while (p < src.length && peek() !== "|" && peek() !== ")") { const r = rep(); n = n ? { k: "cat", a: n, b: r } : r; }
      return n || { k: "empty" };
    }
    function rep() { let n = atom(); while (peek() === "*" || peek() === "?") { n = { k: peek() === "*" ? "star" : "opt", a: n }; p++; } return n; }
    function atom() {
      const c = src[p++];
      if (c === "(") { const n = alt(); if (peek() !== ")") throw new Error("a ( is never closed"); p++; return n; }
      if (c === "*" || c === "?") throw new Error(`"${c}" needs something before it to repeat`);
      if (c === ")") throw new Error("a ) without its (");
      return { k: "char", c };
    }
    const t = alt();
    if (p < src.length) throw new Error(`unexpected "${src[p]}" at position ${p + 1}`);
    return t;
  }

  // ---- layout: measure every fragment (width, height in lanes, baseline lane), then place it
  const GAP = 0.55;
  function measure(n) {
    if (n.k === "char" || n.k === "empty") return (n.m = { w: 1, h: 1, b: 0 });
    if (n.k === "cat") {
      const A = measure(n.a), B = measure(n.b), b = Math.max(A.b, B.b);
      return (n.m = { w: A.w + GAP + B.w, h: b + Math.max(A.h - A.b, B.h - B.b), b });
    }
    if (n.k === "alt") {
      const A = measure(n.a), B = measure(n.b), h = A.h + B.h;
      return (n.m = { w: Math.max(A.w, B.w) + 2, h, b: (h - 1) / 2 });
    }
    const A = measure(n.a); // star / opt: the body sits one lane above the bypass
    return (n.m = { w: A.w + 2, h: A.h + 1, b: 0 });
  }
  let states, edges, start, end;
  function st(x, y, role, extra) { states.push({ x, y, role, ...extra }); edges.push([]); return states.length - 1; }
  const add = (a, lab, b, how) => edges[a].push({ lab, to: b, how: how || "" });
  function place(n, x, y) { // y = bottom lane of this fragment; returns {s, e}
    const m = n.m, by = y + m.b;
    if (n.k === "char" || n.k === "empty") {
      const s = st(x, by, n.k === "char" ? "read" : "empty", { c: n.c }), e = st(x + 1, by, "after", { c: n.c });
      add(s, n.k === "char" ? n.c : null, e);
      return { s, e };
    }
    if (n.k === "cat") {
      const A = place(n.a, x, by - n.a.m.b), B = place(n.b, x + n.a.m.w + GAP, by - n.b.m.b);
      add(A.e, null, B.s, "cat");
      return { s: A.s, e: B.e };
    }
    if (n.k === "alt") {
      const s = st(x, by, "alt-split"), e = st(x + m.w, by, "alt-join");
      const A = place(n.a, x + 1 + (m.w - 2 - n.a.m.w) / 2, y + n.b.m.h);
      const B = place(n.b, x + 1 + (m.w - 2 - n.b.m.w) / 2, y);
      add(s, null, A.s); add(s, null, B.s); add(A.e, null, e); add(B.e, null, e);
      return { s, e };
    }
    const s = st(x, by, n.k + "-split"), e = st(x + m.w, by, n.k + "-join");
    const A = place(n.a, x + 1, y + 1);
    add(s, null, A.s, "enter");
    if (n.k === "star") add(A.e, null, A.s, "loop");
    add(A.e, null, e, "leave");
    add(s, null, e, "skip");
    return { s, e };
  }
  function compile(src) {
    const tree = parse(src);
    measure(tree);
    states = []; edges = [];
    const r = place(tree, 0, 0);
    start = r.s; end = r.e;
    return tree.m;
  }

  // ---- the two engines
  function closure(set) {
    const stack = [...set], seen = new Set(set);
    while (stack.length) { const s = stack.pop(); for (const ed of edges[s]) if (ed.lab == null && !seen.has(ed.to)) { seen.add(ed.to); stack.push(ed.to); } }
    return seen;
  }
  function nfaRun(text) {
    const sets = [closure([start])];
    for (const ch of text) {
      const nxt = new Set();
      for (const s of sets[sets.length - 1]) for (const ed of edges[s]) if (ed.lab != null && (ed.lab === ch || ed.lab === ".")) nxt.add(ed.to);
      sets.push(closure(nxt));
    }
    return sets;
  }
  function backtrack(text) { // depth-first, one path at a time, greedy order (take before skip)
    const trace = [];
    let capped = false;
    function dfs(s, pos, path) {
      if (trace.length >= CAP) { capped = true; return false; }
      trace.push({ s, pos });
      if (s === end && pos === text.length) return true;
      for (const ed of edges[s]) {
        if (capped) return false;
        if (ed.lab == null) {
          if (path.has(ed.to)) continue;
          path.add(ed.to);
          if (dfs(ed.to, pos, path)) return true;
          path.delete(ed.to);
        } else if (pos < text.length && (ed.lab === text[pos] || ed.lab === ".")) {
          if (dfs(ed.to, pos + 1, new Set([ed.to]))) return true;
        }
      }
      return false;
    }
    const ok = dfs(start, 0, new Set([start]));
    return { trace, ok, capped };
  }

  // ---- drawing
  const WHY = {
    read: (c) => `<p>This state <b>reads one character</b>: its blue arrow says <code>${c === "." ? ". (any character)" : c}</code>. If the next text character fits, the state on the other end becomes active.</p><p>Why one arrow per character? Then every step of the simulation is the same tiny question: "does this character fit this arrow?"</p>`,
    after: () => `<p>The end of a one-character piece. It has only <b>free moves</b> (grey) onwards.</p><p>Why so many extra states? Thompson's rule is "every piece has one start and one end", so pieces plug together without special cases, like LEGO. Free moves are the glue.</p>`,
    empty: () => `<p>An empty piece (from <code>()</code> or an empty side of <code>|</code>): just a free move.</p>`,
    "alt-split": () => `<p><b>| split.</b> Two free moves: one into each alternative. The NFA takes <i>both</i> at once.</p><p>A backtracker must pick one, and come back here if it fails. That coming back is where the extra steps go.</p>`,
    "alt-join": () => `<p><b>| join.</b> Both alternatives end here, so the rest of the pattern only needs building once.</p>`,
    "star-split": () => `<p><b>* entry.</b> Free moves: <i>enter</i> the repeated part, or <i>skip</i> it (zero times).</p><p>Why a skip arrow? <code>ab*c</code> must match <code>ac</code>.</p>`,
    "star-join": () => `<p><b>* exit.</b> The repeated part's end has two free moves: <i>loop back</i> (the arc behind) to go round again, or come here and carry on.</p>`,
    "opt-split": () => `<p><b>? entry.</b> Free moves: take the optional part, or skip it. No loop: at most once.</p><p>Each <code>?</code> is one "choice". n of them in a row give a backtracker 2ⁿ combinations to try; the NFA just lights both sides.</p>`,
    "opt-join": () => `<p><b>? exit.</b> The "took it" and "skipped it" paths meet again here.</p>`,
  };
  let text = "", mode = "nfa", sets = [], bt = null, pos = 0, bi = 0, triedEvil = false, userInput = false;
  function fit(m) {
    const w = m.w * X, h = m.h * Y;
    W.camera({ target: [w / 2, h / 2 - 1.3, 0], dist: Math.max(13, w * 0.95 + 4, h * 2.2), theta: 0, phi: 1.2, instant: true });
  }
  function draw(m) {
    W.clear();
    states.forEach((s, i) => {
      const lab = i === start ? "start" : i === end ? "end" : "";
      W.box("s" + i, { x: s.x * X, y: s.y * Y, z: 0, s: 0.5, color: i === end ? "c3" : "c5", label: lab, labelSize: 0.32,
        info: { title: i === start ? "Start state" : i === end ? "End (accepting) state" : `State ${i}`,
          html: (i === start ? "<p>Every match begins here, before reading anything.</p>" : i === end ? "<p>If this state is active when the text runs out, the text <b>matches</b>.</p>" : "") + (WHY[s.role] || WHY.after)(s.c) } });
    });
    edges.forEach((list, a) => list.forEach((ed, j) => {
      const A = states[a], B = states[ed.to], k = `e${a}_${j}`;
      const col = ed.lab != null ? "c2" : "muted";
      if (ed.how === "loop") { // route the back arrow behind the body, in 3D
        const top = Math.max(A.y, B.y) * Y + 0.75, zb = -0.9;
        W.line(k + "a", "s" + a, [A.x * X, top, zb], { color: "c4", opacity: 0.8 });
        W.line(k + "b", [A.x * X, top, zb], [B.x * X, top, zb], { color: "c4", opacity: 0.8 });
        W.line(k + "c", [B.x * X, top, zb], "s" + ed.to, { color: "c4", opacity: 0.8 });
        W.box(k + "h", { x: B.x * X + 0.12, y: B.y * Y + 0.32, z: -0.32, s: 0.13, color: "c4" });
        return;
      }
      W.line(k, "s" + a, "s" + ed.to, { color: col, opacity: ed.lab != null ? 0.95 : 0.45 });
      const t = 0.72; // a small head near the target shows the direction
      W.box(k + "h", { x: (A.x + (B.x - A.x) * t) * X, y: (A.y + (B.y - A.y) * t) * Y, z: 0, s: 0.12, color: ed.lab != null ? "c2" : "c5" });
      if (ed.lab != null) W.label(k + "l", ed.lab, [(A.x + B.x) / 2 * X, (A.y + B.y) / 2 * Y + 0.45, 0], { color: "c2", size: 0.42 });
    }));
    const ty = -1.9, span = (text.length - 1) * 0.95, cx = m.w * X / 2;
    [...text].forEach((c, i) => W.box("t" + i, { x: cx - span / 2 + i * 0.95, y: ty, z: 1.2, s: 0.8, color: "c2", label: c, labelSize: 0.42,
      info: { title: `Text character ${i + 1}: "${c}"`, html: `<p>The input text, one block per character.</p><p>The NFA reads each character <b>exactly once</b>, left to right, then never looks back. A backtracker may come back to the same character again and again: watch the amber cursor jump around in Backtracking mode.</p>` } }));
    if (!text.length) W.label("empty", "(empty text)", [cx, ty, 1.2], { color: "muted", size: 0.4 });
    fit(m);
  }
  function paintStates(active, matched) {
    states.forEach((s, i) => {
      const on = active.has(i);
      W.box("s" + i, { s: on ? 0.62 : 0.5, color: on ? (i === end ? "ok" : "c1") : i === end ? "c3" : "c5", glow: on ? 0.6 : 0 });
    });
    if (matched != null) W.box("s" + end, { s: 0.7, color: matched ? "ok" : "bad", glow: 0.5 });
  }
  function paintText(cursor, doneUpTo) {
    [...text].forEach((c, i) => W.box("t" + i, { s: i === cursor ? 0.95 : 0.8, color: i === cursor ? "c4" : i < doneUpTo ? "c3" : "c2", glow: i === cursor ? 0.4 : 0 }));
  }
  const nfaTotal = () => sets.reduce((a, s) => a + s.size, 0);
  const nfaSoFar = () => sets.slice(0, pos + 1).reduce((a, s) => a + s.size, 0);
  function hud() {
    const b = bt.trace.length + (bt.capped ? "+" : ""), n = nfaTotal(), ratio = bt.trace.length / n;
    api.hud(`<b>total steps for this input</b><br>backtracking: <b>${b}</b><br>NFA state set: <b>${n}</b><br>ratio: ${ratio < 10 ? ratio.toFixed(1) : Math.round(ratio)}×`);
  }
  function show() {
    if (mode === "nfa") {
      const last = pos === text.length;
      paintStates(sets[pos], last ? sets[pos].has(end) : null);
      paintText(last ? -1 : pos, pos);
      const ids = [...sets[pos]].sort((a, b) => a - b);
      api.status(`NFA · read ${pos}/${text.length} characters` + (pos ? ` (last: "${text[pos - 1]}")` : "") +
        `\nactive states: {${ids.join(", ")}}  (${ids.length})\nsteps so far: ${nfaSoFar()}` +
        (last ? `\n\n${sets[pos].has(end) ? "✓ end is active: MATCH" : "✗ end is not active: no match"}` : ""));
    } else {
      const ev = bt.trace[Math.min(bi, bt.trace.length - 1)], last = bi >= bt.trace.length - 1;
      paintStates(new Set([ev.s]), last ? bt.ok : null);
      paintText(ev.pos < text.length ? ev.pos : -1, ev.pos);
      api.status(`Backtracking · step ${bi + 1}/${bt.trace.length}${bt.capped ? "+ (stopped counting)" : ""}\nat state ${ev.s}, text position ${ev.pos}` +
        (last ? `\n\n${bt.capped ? "gave up after " + CAP + " steps!" : bt.ok ? "✓ found a path to end: MATCH" : "✗ tried every path: no match"}` : ""));
    }
  }
  function load(pat, txt, fromUser) {
    try {
      const m = compile(pat);
      text = txt;
      draw(m);
      sets = nfaRun(text);
      bt = backtrack(text);
      pos = 0; bi = 0;
      hud(); show();
      if (fromUser) userInput = true;
      const ratio = bt.trace.length / nfaTotal();
      if (ratio >= 10) {
        api.explain("Backtracking blew up", `<p>Same pattern, same text: <b>${bt.trace.length}${bt.capped ? "+" : ""}</b> backtracking steps vs <b>${nfaTotal()}</b> for the state set (${Math.round(ratio)}×).</p><p>Every <code>?</code> is a choice the backtracker may have to undo. The NFA never chooses: it keeps all options lit, and a state is lit at most once per character.</p>`);
        if (userInput && !triedEvil) { triedEvil = true; api.done("You made backtracking explode"); }
      }
    } catch (e) { api.status("⚠ " + e.message); }
  }
  function step() {
    if (mode === "nfa") { if (pos >= text.length) return false; pos++; }
    else { if (bi >= bt.trace.length - 1) return false; bi++; }
    show();
    return true;
  }

  const pIn = api.text("Pattern", "ab*c", (v) => load(v, tIn.get(), true));
  const tIn = api.text("Text", "abbc", (v) => load(pIn.get(), v, true));
  api.seg([{ label: "NFA: set of states", value: "nfa" }, { label: "Backtracking: one path", value: "bt" }], "nfa", (v) => {
    mode = v; pos = 0; bi = 0; show();
    api.explain(v === "nfa" ? "NFA simulation" : "Backtracking", v === "nfa"
      ? "<p>One <b>Step</b> = one character. All states the pattern could be in light up together. Steps counted = lit states, summed over characters.</p>"
      : "<p>One <b>Step</b> = one state visit. Only one state is lit: the engine follows a single path, and when it gets stuck it goes back to the last choice and tries the other arrow. Watch the cursor in the text jump backwards.</p>");
  });
  api.button("Step", () => { if (!step()) api.status("Finished. Reset, switch mode, or try another input."); }, { primary: true });
  api.button("Run all", async () => {
    if (mode === "nfa") { while (step()) await api.sleep(350); return; }
    const per = Math.max(1, Math.ceil(bt.trace.length / 120));
    while (bi < bt.trace.length - 1) { bi = Math.min(bt.trace.length - 1, bi + per); show(); await api.sleep(30); }
  });
  api.button("Reset", () => { pos = 0; bi = 0; show(); });
  api.slider("Evil pattern (a?)ⁿaⁿ, n", { min: 1, max: 9, value: 3 }, (n) => {
    const p = "a?".repeat(n) + "a".repeat(n), t = "a".repeat(n);
    pIn.set(p); tIn.set(t); load(p, t, true);
  });
  const r = api.row();
  for (const [p, t] of [["ab*c", "abbbc"], ["(cat|dog)s?", "dogs"], ["(a|b)*abb", "babaabb"], ["a.c", "abd"]])
    api.button(`${p} · ${t}`, () => { pIn.set(p); tIn.set(t); load(p, t, true); }, { row: r });
  api.explain("How to read this", "<p><b>Small blocks:</b> NFA states (start on the left, green end on the right). <b>Blue</b> lines read a character, <b>grey</b> lines are free moves, <b>amber</b> arcs behind loop back for <code>*</code>. The tiny cube on each line points at its target.</p><p><b>Front row:</b> the text. Press <b>Step</b>. Click any block to ask why it's there.</p>");
  load(pIn.get(), tIn.get(), false);
});
