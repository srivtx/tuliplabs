/* DSA, chapter 26: tries (prefix trees) for autocomplete.
   Thirteen words; someone types "car". Which words start with it?
   The "why": checking every word with startswith touches the whole dictionary on every keystroke:
   O(words × prefix). A trie stores words letter by letter in a tree, sharing common prefixes, so
   finding the prefix is just |prefix| steps down, and everything underneath that node is an answer.
   The cost depends on the prefix and the answers, not on how big the dictionary is. */
VIZ.register("ds-trie", async (api) => {
  const W = await api.world3d();
  const WORDS = ["cap", "cape", "car", "card", "care", "careful", "cart", "cat", "cattle", "dog", "door", "dot", "dove"];
  const Q = "car";
  const kids = { "": [] }, end = new Set(WORDS);
  for (const w of WORDS) for (let i = 1; i <= w.length; i++) { const p = w.slice(0, i); if (!kids[p]) { kids[p] = []; kids[w.slice(0, i - 1)].push(p); } }
  const pos = {}; let col = 0;
  (function place(p, d) {
    if (!kids[p].length) { pos[p] = [col++, d]; return; }
    kids[p].forEach((c) => place(c, d + 1));
    const xs = kids[p].map((c) => pos[c][0]); pos[p] = [(Math.min(...xs) + Math.max(...xs)) / 2, d];
  })("", 0);
  let mode = "scan", gen = null, steps = 0, hot = null, lit = new Set(), found = [], checked = new Map(), running = false, ran = {}, reached = false, line = "";
  function* scan() {
    for (const w of WORDS) {
      hot = w; let i = 0;
      while (i < Q.length) { steps++; if (w[i] !== Q[i]) break; i++; }
      const ok = i === Q.length; checked.set(w, ok); if (ok) found.push(w);
      yield ok ? `"${w}" starts with "${Q}": a match` : `"${w}": letter ${i + 1} is "${w[i] ?? "(end)"}", not "${Q[i]}". No`;
    }
    hot = null;
    yield `checked all ${WORDS.length} words to find ${found.length}`;
  }
  function* trie() {
    let p = "";
    for (const ch of Q) { p += ch; steps++; hot = p; lit.add(p); yield `follow the "${ch}" branch down to "${p}"`; }
    const stack = [p];
    while (stack.length) {
      const v = stack.pop(); hot = v; lit.add(v);
      if (v !== p) steps++;
      if (end.has(v)) { found.push(v); yield `"${v}" ends a word: an answer`; }
      else if (v !== p) yield `"${v}": keep going down`;
      stack.push(...[...kids[v]].reverse());
    }
    hot = null;
    yield `everything under "${Q}" is an answer: ${found.length} words, and the other branches were never touched`;
  }
  function draw() {
    const tr = mode === "trie";
    WORDS.forEach((w, i) => {
      const c = checked.get(w);
      W.box("w" + w, { x: -7.4, y: 3.4 - i * 0.56, z: 0, sx: 1.7, sy: 0.44, sz: 0.3, color: hot === w ? "c1" : c === true ? "c3" : c === false ? "c2" : "c5", glow: hot === w ? 0.4 : 0, opacity: tr ? 0.2 : 0.95,
        label: w, labelSize: 0.22, labelUp: 0, info: { title: w, html: "<p>One word in the dictionary list.</p>" } });
    });
    for (const p in pos) {
      const [cx, d] = pos[p], isAns = tr && found.includes(p);
      W.box("t" + (p || "root"), { x: -4.6 + cx * 1.2, y: 3.4 - d * 0.95, z: 0, sx: 0.6, sy: 0.6, sz: 0.4, color: p === hot ? "c1" : isAns ? "c3" : lit.has(p) ? "c4" : end.has(p) ? "c2" : "c5", glow: p === hot ? 0.4 : 0, opacity: tr ? 0.95 : 0.25,
        label: p ? p.at(-1) : "·", labelSize: 0.26, labelUp: 0,
        info: { title: p ? `Node "${p}"` : "Root", html: `<p>${p ? `The path from the root spells "${p}".` : "The empty prefix."}${end.has(p) ? " A word ends here (blue)." : ""}</p>` } });
      if (p) W.line("e" + p, "t" + (p.slice(0, -1) || "root"), "t" + p, { color: tr && lit.has(p) ? "c4" : "line" });
    }
  }
  function show() { api.status(`${mode === "scan" ? "scan every word" : "walk the trie"} · prefix "${Q}" · ${steps} step${steps === 1 ? "" : "s"} · found: ${found.join(", ") || "–"}\n${line}`); }
  function reset() { steps = 0; hot = null; lit = new Set(); found = []; checked = new Map(); line = ""; gen = mode === "scan" ? scan() : trie(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = steps;
    if (mode === "scan") api.explain(`${steps} letter checks`, `<p>Every word was checked, even "dog" and "dove", which share nothing with "car". A real dictionary has 500,000 words, checked again on every keystroke.</p><p>Switch to <b>walk the trie</b> and run it.</p>`);
    else if (ran.scan && !reached) { reached = true; api.explain("Shared prefixes, stored once", `<p>${steps} steps instead of ${ran.scan}. Three steps found the "car" node; everything under it is an answer. The "d" branch and the "cat…" branch were never touched.</p><p>Inserting or finding a word costs O(its length), however big the dictionary gets.</p>`); api.done("You searched by prefix with a trie"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(520); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "scan every word", value: "scan" }, { label: "walk the trie", value: "trie" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [-1.4, -0.2, 0], dist: 20.5, theta: 0, phi: 1.5, instant: true });
  api.hud(`prefix typed: "${Q}" · left: the word list · right: the same words as a trie (blue nodes end a word) · red = checking now · green = an answer`);
  reset();
  api.explain("How to read this", `<p>Someone typed <b>car</b>: find every word that starts with it. <b>Run all</b> with <b>scan every word</b>, then with <b>walk the trie</b>.</p>`);
});
