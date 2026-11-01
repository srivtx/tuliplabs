/* Build your own X, chapter 7: a B-tree, the index inside SQLite and most databases.
   Each node holds up to 3 sorted keys (a real one holds hundreds: one disk page). Insert rows and watch
   full nodes split, pushing their middle key up; the tree only ever grows taller at the root, so every
   leaf stays at the same depth. Then search: a handful of nodes instead of a scan of every row.
   The "why": disks read whole pages, so you want short, fat trees, not tall thin ones. */
VIZ.register("bx-btree", async (api) => {
  const W = await api.world3d();
  const MAX = 3, CELL = 0.62;
  const SEED = 404040401;
  let seed = SEED;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let order, next, root, lines = new Set(), splits = 0, found = false, target = 23;
  const node = (keys = [], kids = []) => ({ keys, kids });
  function shuffled() {
    const a = Array.from({ length: 40 }, (_, i) => i + 1);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function split(n) {
    const m = n.keys.length >> 1;
    splits++;
    return [node(n.keys.slice(0, m), n.kids.slice(0, m + 1)), n.keys[m], node(n.keys.slice(m + 1), n.kids.slice(m + 1))];
  }
  function ins(n, k) {
    let i = 0;
    while (i < n.keys.length && n.keys[i] < k) i++;
    if (!n.kids.length) n.keys.splice(i, 0, k);
    else {
      const r = ins(n.kids[i], k);
      if (r) { n.kids.splice(i, 1, r[0], r[2]); n.keys.splice(i, 0, r[1]); }
    }
    return n.keys.length > MAX ? split(n) : null;
  }
  function insert(k) {
    const r = ins(root, k);
    if (r) root = node([r[1]], [r[0], r[2]]);
  }
  const height = (n) => (n.kids.length ? 1 + height(n.kids[0]) : 1);
  const count = (n) => n.keys.length + n.kids.reduce((a, c) => a + count(c), 0);
  function layout() {
    // leaves left to right, parents centred over their children
    const H = height(root), pos = new Map();
    let cursor = 0;
    (function place(n, depth) {
      const w = n.keys.length * CELL;
      if (!n.kids.length) { pos.set(n, { x: cursor + w / 2, y: (H - depth) * 1.7 }); cursor += w + 0.45; return; }
      n.kids.forEach((c) => place(c, depth + 1));
      const a = pos.get(n.kids[0]).x, b = pos.get(n.kids[n.kids.length - 1]).x;
      pos.set(n, { x: (a + b) / 2, y: (H - depth) * 1.7 });
    })(root, 1);
    const shift = cursor / 2;
    for (const p of pos.values()) p.x -= shift;
    return pos;
  }
  function draw(path = []) {
    const pos = layout(), seen = new Set();
    for (const key of lines) W.unline(key);
    lines = new Set();
    const onPath = new Set(path);
    for (const [n, p] of pos) {
      n.keys.forEach((k, i) => {
        seen.add("k" + k);
        const leaf = !n.kids.length;
        W.box("k" + k, { x: p.x + (i - (n.keys.length - 1) / 2) * CELL, y: p.y, z: 0, sx: CELL * 0.92, sy: 0.5, sz: 0.6,
          color: found && k === target && onPath.has(n) ? "ok" : onPath.has(n) ? "c4" : leaf ? "c2" : "c1", label: String(k), labelSize: 0.26, labelUp: -0.25,
          info: { title: `Key ${k} in ${leaf ? "a leaf" : "an internal node"} with ${n.keys.length} key${n.keys.length > 1 ? "s" : ""}`, html: leaf ? "<p>Leaves hold keys (and in a real table, the row data). Keys inside a node are kept sorted, so finding your place in a node is a quick scan or binary search.</p><p>When a 4th key arrives, the node <b>splits</b>: the middle key moves up to the parent, and the two halves become siblings.</p>" : "<p>An internal node is a signpost: keys smaller than this one live in the child to its left, bigger ones to its right.</p><p>It got here by being the middle key of a node that split. Splits that reach the root make a new root: that's the <i>only</i> way a B-tree grows taller, which is why every leaf is always at the same depth.</p>" } });
      });
      n.kids.forEach((c, i) => {
        // edges hang off keys, so they follow the blocks as they glide after a split
        const key = `l${n.keys[0]}_${i}`;
        W.line(key, "k" + n.keys[Math.min(i, n.keys.length - 1)], "k" + c.keys[c.keys.length >> 1], { color: onPath.has(c) && onPath.has(n) ? "c4" : "muted" });
        lines.add(key);
      });
    }
    const n = count(root);
    api.status(`rows inserted: ${n}   tree height: ${height(root)}   splits so far: ${splits}\nnext rows to insert: ${order.slice(next, next + 6).join(", ")}${next < order.length ? " …" : " (all in)"}`);
    W.camera({ target: [0, (height(root) - 1) * 0.85 + 0.2, 0], dist: 9 + 2.4 * height(root) + n * 0.16 });
    api.hud(`${n} keys · height ${height(root)} · up to ${MAX} keys per node (a real page holds hundreds)`);
  }
  function insertSome(k) {
    found = false;
    const before = height(root);
    for (let i = 0; i < k && next < order.length; i++) insert(order[next++]);
    draw();
    if (height(root) > before) api.explain("The tree grew taller", "<p>A split cascaded all the way up: the root itself overflowed, so its middle key became a brand-new root. Every leaf moved down one level together. B-trees grow at the top, never at the bottom, so they stay perfectly balanced.</p>");
    else api.explain(k === 1 ? "Inserted one row" : `Inserted ${k} rows`, "<p>Each key walks down from the root to the right leaf and slots in, in order. If that leaf now has 4 keys, it splits and pushes its middle key up. Keep inserting until the tree is 3 levels tall.</p>");
  }
  function find() {
    let n = root, path = [], visited = 0, comps = 0;
    while (n) {
      path.push(n); visited++;
      let i = 0;
      while (i < n.keys.length && n.keys[i] < target) { i++; comps++; }
      if (i < n.keys.length && n.keys[i] === target) { comps++; found = true; break; }
      n = n.kids[i];
    }
    if (!n) found = false;
    draw(path);
    const rows = count(root);
    api.status(`searching for ${target}: ${found ? "found" : "not in the table"}\nB-tree: visited ${visited} node${visited > 1 ? "s" : ""} (${visited} disk page read${visited > 1 ? "s" : ""}), ${comps} key comparisons\nfull table scan: would read up to ${rows} rows`);
    if (found && height(root) >= 3) {
      api.explain("Found it in a few page reads", `<p>${visited} node${visited > 1 ? "s" : ""} from root to key ${target}, out of ${rows} rows. With a few hundred keys per node, a 4-level B-tree indexes over a <b>billion</b> rows, so any row is about 4 disk reads away.</p><p>That's what <code>CREATE INDEX</code> builds, and why <code>WHERE id = 17</code> is instant while a filter on an unindexed column scans the whole table.</p>`);
      api.done("You grew a B-tree to 3 levels and searched it");
    } else if (found) api.explain("Found", "<p>Grow the tree to 3 levels, then search again to see how few nodes it takes.</p>");
    else api.explain("Not there (yet)", `<p>The search walked down to a leaf and ${target} wasn't in it, so it can't be anywhere: the sorted signposts guarantee it. Insert more rows, or pick another key.</p>`);
  }
  function reset() { seed = SEED; order = shuffled(); next = 0; root = node(); splits = 0; found = false; W.clear(); lines = new Set(); }
  api.button("Insert 1 row", () => insertSome(1), { primary: true });
  api.button("Insert 5 rows", () => insertSome(5));
  api.slider("Key to search for", { min: 1, max: 40, step: 1, value: target }, (v) => { target = v; });
  api.button("Search", find);
  api.button("Reset", () => { reset(); draw(); });
  W.camera({ target: [0, 0.5, 0], dist: 10, theta: 0, phi: 1.42, instant: true });
  reset(); draw();
  api.explain("How to read this", "<p>Rows with ids 1–40 arrive in random order. Each block is a key; blocks side by side are one <b>node</b> (one disk page). Blue nodes are leaves, red ones are signposts.</p><p>Insert rows and watch nodes split. Click a key to ask why it's where it is.</p>");
});
