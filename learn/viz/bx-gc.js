/* Build your own X, chapter 16: a garbage collector.
   Left: the stack, holding the program's variables (the roots). Right: objects on the heap, with
   arrows for references. Delete a variable and some objects become unreachable: garbage.
   Two ways to find it: reference counting (free an object the moment nothing points at it) and
   mark & sweep (from the roots, mark everything reachable; free the rest).
   The "why": counting is instant and simple but can't see cycles; tracing from the roots can. */
VIZ.register("bx-gc", async (api) => {
  const W = await api.world3d();
  const OBJS = {
    U: { name: "User", x: -2.6, y: 3.8, refs: ["S", "A"], color: "c2", why: "A user object. It's reachable because the variable <code>user</code> points at it." },
    S: { name: "\"Ida\"", x: 0.6, y: 4.5, refs: [], color: "c2", why: "A string, owned by the user object." },
    A: { name: "Address", x: 0.6, y: 3.1, refs: [], color: "c2", why: "Another object the user points at." },
    C: { name: "Cart", x: -2.6, y: 1.6, refs: ["I1", "I2"], color: "c3", why: "A shopping cart holding two items." },
    I1: { name: "Item 1", x: 0.6, y: 2.0, refs: ["P"], color: "c3", why: "A line in the cart. Both items point to the same product: <b>shared</b> objects are why you can't just free children when a parent dies." },
    I2: { name: "Item 2", x: 0.6, y: 1.0, refs: ["P"], color: "c3", why: "A second line in the cart, for the same product." },
    P: { name: "Product", x: 3.6, y: 1.5, refs: [], color: "c3", why: "Pointed to by two items, so its count is 2. It must stay alive until <i>both</i> items are gone." },
    T: { name: "List", x: -2.6, y: -0.6, refs: ["N1"], color: "c4", why: "A doubly linked list: the list points to its first node." },
    N1: { name: "Node 1", x: 0.6, y: -0.6, refs: ["N2"], color: "c4", why: "Points forward to node 2. Node 2 points back here (<code>prev</code>). That's a <b>cycle</b>: each keeps the other's count above zero." },
    N2: { name: "Node 2", x: 3.6, y: -0.6, refs: ["N1"], color: "c4", why: "Points back to node 1. In a cycle, reference counts never reach zero on their own." },
  };
  const ROOTS0 = { user: "U", cart: "C", tmp: "T" };
  const RY = { user: 3.8, cart: 1.6, tmp: -0.6 };
  let mode = "rc", roots, alive, busy = false, sawLeak = false;
  const rc = (k) => Object.values(roots).filter((v) => v === k).length + [...alive].filter((o) => OBJS[o].refs.includes(k)).length;
  function reachable() {
    const seen = new Set(), todo = Object.values(roots);
    while (todo.length) { const k = todo.pop(); if (seen.has(k) || !alive.has(k)) continue; seen.add(k); todo.push(...OBJS[k].refs); }
    return seen;
  }
  function objBox(k, extra = {}) {
    const o = OBJS[k];
    W.box(k, { x: o.x, y: o.y, z: 0, sx: 1.7, sy: 0.75, sz: 0.6, color: o.color, opacity: 0.9, label: mode === "rc" ? `${o.name}\ncount = ${rc(k)}` : o.name, labelSize: 0.26, labelUp: -0.375,
      info: { title: `${o.name}${mode === "rc" ? ` (reference count ${rc(k)})` : ""}`, html: `<p>${o.why}</p>` }, ...extra });
  }
  function draw() {
    W.box("stack", { x: -6, y: 1.6, z: -0.5, sx: 2.2, sy: 6.2, sz: 0.2, color: "c5", opacity: 0.25, instant: true,
      info: { title: "The stack: the roots", html: "<p>Local and global variables live here. They're the <b>roots</b>: anything you can reach by following references from them might still be used by the program. Anything you can't reach, the program has lost forever, so it's safe to free.</p>" } });
    W.label("stackL", "stack (roots)", [-6, 5.2, 0], { color: "muted", size: 0.28 });
    W.label("heapL", "heap", [0.6, 5.4, 0], { color: "muted", size: 0.28 });
    for (const r of Object.keys(ROOTS0)) {
      if (roots[r]) W.box("r" + r, { x: -6, y: RY[r], z: 0, sx: 1.6, sy: 0.55, sz: 0.5, color: "c5", label: r, labelSize: 0.26, labelUp: -0.27,
        info: { title: `Variable ${r}`, html: "<p>A variable holding a reference (an address) to an object on the heap. Delete it, or let it go out of scope, and that reference disappears.</p>" } });
      else if (W.has("r" + r)) { W.remove("r" + r); W.unline("lr" + r); }
      if (roots[r]) W.line("lr" + r, "r" + r, roots[r], { color: "ink" });
    }
    for (const k of Object.keys(OBJS)) {
      if (!alive.has(k)) continue;
      objBox(k);
      for (const t of OBJS[k].refs) if (alive.has(t)) W.line(`e${k}_${t}`, k, t, { color: "muted" });
    }
    report();
  }
  function free(k) {
    alive.delete(k);
    W.remove(k);
    for (const o of Object.keys(OBJS)) { W.unline(`e${o}_${k}`); W.unline(`e${k}_${o}`); }
    for (const r of Object.keys(ROOTS0)) if (ROOTS0[r] === k) W.unline("lr" + r);
  }
  function report() {
    const reach = reachable(), leaked = [...alive].filter((k) => !reach.has(k));
    api.status(`${mode === "rc" ? "reference counting" : "mark & sweep"}\nobjects on the heap: ${alive.size}   reachable: ${reach.size}   garbage still taking memory: ${leaked.length}${leaked.length ? "\n  → " + leaked.map((k) => OBJS[k].name).join(", ") : ""}\nroots: ${Object.keys(roots).join(", ") || "(none)"}`);
    return leaked;
  }
  async function drop(r) {
    if (busy || !roots[r]) return;
    busy = true;
    delete roots[r];
    draw();
    if (mode === "rc") {
      // free anything whose count hits zero, cascading
      let changed = true;
      while (changed) {
        changed = false;
        for (const k of [...alive]) if (rc(k) === 0) {
          W.box(k, { color: "bad", glow: 0.8 }); await api.sleep(380);
          free(k); changed = true; draw(); await api.sleep(150);
        }
      }
      const leaked = report();
      if (leaked.length) {
        for (const k of leaked) objBox(k, { color: "bad", glow: 0.3, opacity: 0.6 });
        sawLeak = true;
        api.explain("A leak: the cycle survived", `<p>Deleting <code>${r}</code> freed what it could, instantly. But ${leaked.map((k) => OBJS[k].name).join(" and ")} point at each other, so each count is still 1. Nothing can reach them, yet they'll sit in memory <b>forever</b>.</p><p>Now switch to <b>mark &amp; sweep</b> and try the same thing.</p>`);
      } else api.explain(`Deleted ${r}`, "<p>Each object whose count fell to zero was freed straight away, and freeing it lowered its children's counts, sometimes to zero too (a cascade). Notice the shared Product only goes when <i>both</i> items have. Now try deleting the variable that holds the linked list.</p>");
    } else api.explain(`Deleted ${r}`, "<p>Nothing was freed yet. Mark &amp; sweep doesn't track counts at all: the garbage just sits there until the collector runs. Press <b>Collect garbage</b>.</p>");
    busy = false;
  }
  async function collect() {
    if (busy) return;
    if (mode === "rc") { api.explain("Nothing to collect", "<p>Reference counting frees objects the instant their count hits zero, so there's no separate collection step. That's its big advantage: no pauses. Its blind spot is cycles.</p>"); return; }
    busy = true;
    const marked = new Set(), order = [];
    const todo = Object.values(roots).slice();
    while (todo.length) { const k = todo.shift(); if (marked.has(k) || !alive.has(k)) continue; marked.add(k); order.push(k); todo.push(...OBJS[k].refs); }
    api.explain("Mark", "<p>Start at every root and follow every reference, marking each object reached. This is just a graph traversal, like the BFS from earlier chapters.</p>");
    for (const k of order) { W.box(k, { color: "ok", glow: 0.7 }); W.flash(k); await api.sleep(320); }
    api.explain("Sweep", "<p>Now walk the whole heap. Anything <b>not</b> marked is unreachable: free it. Cycles don't matter: if nothing reachable points into the cycle, it's never marked.</p>");
    const swept = [];
    for (const k of Object.keys(OBJS)) if (alive.has(k) && !marked.has(k)) {
      W.box(k, { color: "bad", glow: 0.8 }); await api.sleep(380);
      free(k); swept.push(k);
    }
    await api.sleep(250);
    for (const k of marked) objBox(k);
    report();
    const cycleFreed = swept.includes("N1") && swept.includes("N2");
    if (cycleFreed && sawLeak) {
      api.explain("The cycle is gone", `<p>Swept ${swept.map((k) => OBJS[k].name).join(", ")}. The linked list's nodes pointed at each other, but nothing reachable pointed at them, so they were never marked.</p><p>The cost: the program has to pause (or carefully share the heap) while the collector traces. That's why Python uses <b>both</b>: reference counting for instant frees, plus a cycle collector that runs now and then. Java and Go use tracing collectors that do the work in small increments.</p>`);
      api.done("You saw counting leak a cycle, and tracing free it");
    } else if (cycleFreed) api.explain("Swept", `<p>Freed ${swept.map((k) => OBJS[k].name).join(", ")}, cycle and all. Now switch to <b>reference counting</b> and delete <code>tmp</code> there, to see why that's impressive.</p>`);
    else api.explain(swept.length ? "Swept" : "Nothing to sweep", `<p>${swept.length ? `Freed ${swept.map((k) => OBJS[k].name).join(", ")}.` : "Everything is still reachable from a root."} Try deleting <code>tmp</code>, the variable holding the linked list.</p>`);
    busy = false;
  }
  function reset() { if (busy) return; roots = { ...ROOTS0 }; alive = new Set(Object.keys(OBJS)); W.clear(); draw(); }
  api.seg([{ label: "reference counting", value: "rc" }, { label: "mark & sweep", value: "ms" }], mode, (v) => { if (busy) return; mode = v; reset(); api.explain(v === "rc" ? "Reference counting" : "Mark & sweep", v === "rc" ? "<p>Each object counts how many references point at it. When the count drops to zero, it's freed immediately.</p>" : "<p>No counts. When memory runs low, the collector marks everything reachable from the roots, then sweeps away the rest.</p>"); });
  api.button("Delete tmp", () => drop("tmp"), { primary: true });
  api.button("Delete cart", () => drop("cart"));
  api.button("Collect garbage", collect);
  api.button("Reset", reset);
  W.camera({ target: [-1.1, 1.9, 0], dist: 17, theta: 0, phi: 1.42, instant: true });
  api.hud("arrows are references · click any block to ask why");
  reset();
  api.explain("How to read this", "<p>The grey column is the stack: three variables (the <b>roots</b>). Everything else lives on the heap, with lines for references. In reference-counting mode, each object shows how many references point at it.</p><p>Delete the variable <code>tmp</code> and see what gets freed. Then switch modes and compare.</p>");
});
