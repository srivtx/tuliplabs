/* DSA, chapter 18: binary search trees and why balance matters.
   Insert the keys 1..15 into a binary search tree (smaller to the left, bigger to the right), then
   look up 15, 12 and 9. Do it twice: once inserting in sorted order, once in a mixed order.
   The "why": a BST is only as fast as it is short. Sorted inserts always go right, so the "tree"
   is a chain of 15 and every operation is O(n). The mixed order happens to build a perfectly
   balanced tree of height 4, so every operation is O(log n). Self-balancing trees (AVL, red-black,
   treaps, and the B-trees in databases) keep the height logarithmic whatever the order. */
VIZ.register("ds-bst", async (api) => {
  const W = await api.world3d();
  const ORDERS = { sorted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], mixed: [8, 4, 12, 2, 6, 10, 14, 1, 3, 5, 7, 9, 11, 13, 15] };
  const FIND = [15, 12, 9];
  let mode = "sorted", gen = null, cmps = 0, nodes = {}, look = 0, found = 0, running = false, ran = {}, reached = false, line = "", phase = "insert";
  const X = (k) => -7 + (k - 1), Y = (d) => 5.6 - d * 0.6;
  function* run() {
    let root = 0;
    for (const k of ORDERS[mode]) {
      if (!root) { root = k; nodes[k] = { l: 0, r: 0, d: 0, p: 0 }; yield `insert ${k}: the tree is empty, so it's the root`; continue; }
      let c = root;
      while (true) {
        cmps++; look = c;
        const side = k < c ? "l" : "r";
        if (!nodes[c][side]) { nodes[c][side] = k; nodes[k] = { l: 0, r: 0, d: nodes[c].d + 1, p: c }; yield `insert ${k}: ${k} ${k < c ? "<" : ">"} ${c} and that side is empty, so ${k} goes there (depth ${nodes[k].d + 1})`; break; }
        yield `insert ${k}: ${k} ${k < c ? "<" : ">"} ${c}, go ${side === "l" ? "left" : "right"}`;
        c = nodes[c][side];
      }
    }
    look = 0; phase = "find";
    for (const k of FIND) {
      let c = root;
      while (c) {
        cmps++; look = c;
        if (c === k) { found = k; yield `find ${k}: found it`; break; }
        yield `find ${k}: ${k} ${k < c ? "<" : ">"} ${c}, go ${k < c ? "left" : "right"}`;
        c = k < c ? nodes[c].l : nodes[c].r;
      }
    }
    look = 0;
  }
  function height() { return Math.max(0, ...Object.values(nodes).map((n) => n.d + 1)); }
  function draw() {
    for (let k = 1; k <= 15; k++) {
      const n = nodes[k];
      if (!n) { W.remove("n" + k); continue; }
      W.box("n" + k, { x: X(k), y: Y(n.d), z: 0, sx: 0.6, sy: 0.5, sz: 0.6, color: k === look ? (k === found ? "c3" : "c1") : "c2", glow: k === look ? 0.4 : 0, opacity: 0.95,
        label: String(k), labelSize: 0.26, labelUp: 0,
        info: { title: `Key ${k}`, html: `<p>Depth ${n.d + 1}. Everything in its left subtree is smaller than ${k}; everything in its right subtree is bigger.</p>` } });
      if (n.p) W.line("e" + k, "n" + n.p, "n" + k, { color: "line" }); else W.unline("e" + k);
    }
  }
  function show() { api.status(`${mode === "sorted" ? "inserted in sorted order" : "inserted in a mixed order"} · ${cmps} comparison${cmps === 1 ? "" : "s"} · height ${height()} · ${phase === "insert" ? "building" : `looking up ${FIND.join(", ")}`}\n${line}`); }
  function reset() { cmps = 0; nodes = {}; look = 0; found = 0; line = ""; phase = "insert"; for (let k = 1; k <= 15; k++) W.remove("n" + k); gen = run(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = cmps;
    const other = mode === "sorted" ? "mixed" : "sorted";
    if (!ran[other]) api.explain(`${cmps} comparisons, height ${height()}`, `<p>${mode === "sorted" ? "Every new key was the biggest so far, so it always went right: the tree is a linked list in disguise, and a lookup can cost n." : "Each key split the remaining range in half, like binary search, so the tree is as short as it can be."}</p><p>Now switch to <b>${other === "sorted" ? "sorted order" : "mixed order"}</b> and run it.</p>`);
    else if (!reached) { reached = true; api.explain("Height is everything", `<p>Same 15 keys: ${ran.sorted} comparisons when they arrived sorted, ${ran.mixed} when mixed. A BST's operations cost O(height): from log₂ n when balanced up to n when it's a chain.</p><p>Real libraries rebalance as they go (red-black trees in Java's TreeMap and C++'s std::map, B-trees in every database) so the height stays O(log n).</p>`); api.done("You saw why balance matters"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "sorted" ? 70 : 260); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "sorted order", value: "sorted" }, { label: "mixed order", value: "mixed" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 1.4, 0], dist: 23, theta: 0, phi: 1.5, instant: true });
  api.hud("insert 1..15, then look up 15, 12, 9 · red = comparing · green = found · left is smaller, right is bigger");
  reset();
  api.explain("How to read this", `<p>Build a binary search tree from the keys 1 to 15, then search it. <b>Run all</b> with <b>sorted order</b>, then switch to <b>mixed order</b>.</p>`);
});
