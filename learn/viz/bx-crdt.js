/* Build your own X, chapter 36: collaborative editing with offline sync.
   Alice and Bob share a shopping list. Both phones go offline, both make changes, then they sync.
   The "why": syncing by "the last phone to upload wins" replaces the whole list with Bob's copy,
   so Alice's changes vanish, and an item she deleted comes back. A CRDT (conflict-free replicated
   data type) syncs operations' effects instead of whole copies: every add carries a unique tag,
   a remove deletes only the tags it has seen, and merging is a union. Any two phones that have
   seen the same changes end up identical, whatever order the syncs happen in. */
VIZ.register("bx-crdt", async (api) => {
  const W = await api.world3d();
  let mode = "lww", gen = null, A = [], B = [], offline = false, synced = false, lost = [], running = false, ran = {}, reached = false, line = "";
  // CRDT state per phone: adds = Map item -> Set of tags, removed = Set of tags
  let CA = null, CB = null, tick = 0;
  const crdtNew = () => ({ adds: new Map(), removed: new Set() });
  const cAdd = (c, item, who) => { const tag = `${who}${++tick}`; if (!c.adds.has(item)) c.adds.set(item, new Set()); c.adds.get(item).add(tag); };
  const cRemove = (c, item) => { for (const t of c.adds.get(item) || []) c.removed.add(t); };
  const cValue = (c) => [...c.adds.entries()].filter(([, tags]) => [...tags].some((t) => !c.removed.has(t))).map(([k]) => k);
  const cMerge = (x, y) => { const z = crdtNew(); for (const c of [x, y]) { for (const [k, tags] of c.adds) { if (!z.adds.has(k)) z.adds.set(k, new Set()); tags.forEach((t) => z.adds.get(k).add(t)); } c.removed.forEach((t) => z.removed.add(t)); } return z; };
  const clone = (c) => cMerge(c, crdtNew());
  function* lww() {
    A = ["milk", "apples"]; B = A.slice();
    yield `both phones have the same list: milk, apples`;
    offline = true; yield `both go offline (a train, a basement)`;
    A.push("eggs"); yield `Alice adds eggs`;
    A = A.filter((x) => x !== "apples"); yield `Alice crosses off apples`;
    B = B.filter((x) => x !== "milk"); yield `Bob crosses off milk`;
    B.push("bread"); yield `Bob adds bread`;
    offline = false; synced = true; A = B.slice(); lost = ["eggs", "apples (deleted, but back)"];
    yield `back online. Bob uploaded last, so his whole list wins: Alice's eggs are gone and her deleted apples are back`;
  }
  function* crdt() {
    CA = crdtNew(); cAdd(CA, "milk", "a"); cAdd(CA, "apples", "a"); CB = clone(CA); A = cValue(CA); B = cValue(CB);
    yield `both phones have the same list. Each item carries a tag saying which add created it`;
    offline = true; yield `both go offline`;
    cAdd(CA, "eggs", "a"); A = cValue(CA); yield `Alice adds eggs, with a new tag`;
    cRemove(CA, "apples"); A = cValue(CA); yield `Alice crosses off apples: she records "apples' tag is removed"`;
    cRemove(CB, "milk"); B = cValue(CB); yield `Bob crosses off milk: "milk's tag is removed"`;
    cAdd(CB, "bread", "b"); B = cValue(CB); yield `Bob adds bread, with a tag of his own`;
    offline = false; synced = true; const m = cMerge(CA, CB); CA = clone(m); CB = clone(m); A = cValue(CA); B = cValue(CB);
    yield `back online: merge = every add from both phones, minus every removed tag. Both phones now show ${A.join(", ")}`;
  }
  const ITEMS = ["milk", "apples", "eggs", "bread"];
  function draw() {
    [["A", A, -2.2, "Alice"], ["B", B, 2.2, "Bob"]].forEach(([k, list, x, who]) => {
      W.box("ph" + k, { x, y: 0.2, z: -0.25, sx: 2.2, sy: 3.0, sz: 0.1, color: offline ? "c5" : "c2", opacity: 0.25 });
      W.label("nm" + k, `${who}${offline ? " · offline" : ""}`, [x, 1.95, 0.2], { color: "ink", size: 0.2 });
      ITEMS.forEach((it, i) => {
        const on = list.includes(it);
        W.box(`${k}${it}`, { x, y: 1.25 - i * 0.6, z: 0, sx: 1.7, sy: 0.45, sz: 0.3, visible: on, color: synced && mode === "lww" && it === "apples" ? "c1" : "c3", opacity: 0.92, label: it, labelSize: 0.18, labelUp: 0,
          info: { title: it, html: `<p>On ${who}'s list.</p>` } });
      });
    });
    W.box("link", { x: 0, y: 0.2, z: 0, sx: 2.0, sy: 0.06, sz: 0.06, color: offline ? "line" : "c2", opacity: offline ? 0.2 : 0.8 });
    W.label("lost", synced && mode === "lww" ? `lost: ${lost.join(", ")}` : "", [0, -1.8, 0.2], { color: "c1", size: 0.2 });
  }
  function show() { api.status(`${mode === "lww" ? "last upload wins" : "CRDT merge"}\n${line}`); }
  function reset() { A = []; B = []; offline = false; synced = false; lost = []; tick = 0; line = ""; gen = mode === "lww" ? lww() : crdt(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = true;
    if (mode === "lww") api.explain("Two edits lost", `<p>Copying a whole list over another throws away whatever the other phone did.</p><p>Switch to <b>CRDT merge</b> and run it.</p>`);
    else if (ran.lww && !reached) { reached = true; api.explain("Merge changes, not copies", `<p>Every change from both phones survived, and both phones agree. The merge is a union, so syncing twice, or in any order, gives the same result.</p><p>Figma, Apple Notes and Linear use CRDT-style merging for offline edits.</p>`); api.done("You merged offline edits"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(1100); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "last upload wins", value: "lww" }, { label: "CRDT merge", value: "crdt" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.1, 0], dist: 9.5, theta: 0, phi: 1.5, instant: true });
  api.hud("two phones sharing a shopping list · grey = offline · red item = came back after being deleted");
  reset();
  api.explain("How to read this", `<p>Alice and Bob edit the same list offline, then sync. <b>Run all</b> with <b>last upload wins</b>, then with <b>CRDT merge</b>.</p>`);
});
