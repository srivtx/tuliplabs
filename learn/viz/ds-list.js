/* DSA, chapter 13: fast and slow pointers.
   A linked list shaped like a "6": four nodes in a tail, then eight in a loop (node 11 points back
   to node 4). Does it loop, and where does the loop start?
   The "why": the obvious way remembers every node it has visited in a set, so memory grows with
   the list. Floyd's tortoise and hare uses two pointers: slow moves 1, fast moves 2. Inside the
   loop fast gains one node per step, so it must land on slow. Then a pointer from the head and one
   from the meeting point, both moving 1, meet exactly at the loop's start. Same O(n) time, O(1)
   memory. */
VIZ.register("ds-list", async (api) => {
  const W = await api.world3d();
  const N = 12, TAIL = 4, nxt = (i) => (i === N - 1 ? TAIL : i + 1);
  const P = [];
  for (let i = 0; i < TAIL; i++) P.push([-7.6 + i * 1.35, 0]);
  for (let k = 0; k < N - TAIL; k++) { const a = Math.PI - (k * 2 * Math.PI) / (N - TAIL); P.push([0.75 + 2.7 * Math.cos(a), 2.7 * Math.sin(a)]); }
  let mode = "set", gen = null, steps = 0, seen = new Set(), slow = -1, fast = -1, other = -1, start = -1, running = false, ran = {}, reached = false, line = "";
  function* withSet() {
    let c = 0;
    while (true) {
      steps++; slow = c;
      if (seen.has(c)) { start = c; yield `node ${c} is already in the set: there's a loop, and it starts here`; return; }
      seen.add(c); yield `visit node ${c}, add it to the set (${seen.size} remembered)`;
      c = nxt(c);
    }
  }
  function* floyd() {
    slow = 0; fast = 0;
    yield "slow and fast both start at the head";
    while (true) {
      slow = nxt(slow); fast = nxt(nxt(fast)); steps++;
      if (slow === fast) { yield `slow moved to ${slow}, fast jumped to ${fast}: they meet, so there's a loop`; break; }
      yield `slow moved 1 to node ${slow}, fast moved 2 to node ${fast}`;
    }
    other = 0;
    yield `phase 2: a new pointer starts at the head, the other stays at the meeting point ${slow}`;
    while (other !== slow) {
      other = nxt(other); slow = nxt(slow); fast = -1; steps++;
      yield other === slow ? `both reach node ${slow}: that's where the loop starts` : `both move 1: head pointer at ${other}, meeting pointer at ${slow}`;
    }
    start = slow;
  }
  function memory() { return mode === "set" ? seen.size : [slow, fast, other].filter((x) => x >= 0).length; }
  function draw() {
    for (let i = 0; i < N; i++) {
      const isS = i === slow, isF = i === fast, isO = i === other, inSet = mode === "set" && seen.has(i);
      const tag = [isS ? (mode === "set" ? "here" : "slow") : "", isF ? "fast" : "", isO ? "head ptr" : ""].filter(Boolean).join("\n");
      W.box("n" + i, { x: P[i][0], y: P[i][1], z: 0, sx: 0.75, sy: 0.75, sz: 0.75, color: i === start ? "c3" : isF ? "c1" : isS || isO ? "c4" : inSet ? "c2" : "c5", glow: isS || isF || isO || i === start ? 0.4 : 0, opacity: 0.95,
        label: tag ? `${i}\n${tag}` : String(i), labelSize: 0.26, labelUp: 0.55,
        info: { title: `Node ${i}`, html: `<p>Its <code>next</code> is node ${nxt(i)}${i === N - 1 ? " (back into the loop!)" : ""}.</p>` } });
    }
    for (let i = 0; i < N; i++) W.line("e" + i, "n" + i, "n" + nxt(i), { color: i === N - 1 ? "c1" : "line" });
    W.box("mem", { x: 5, y: -3 + memory() * 0.15, z: 0, sx: 0.8, sy: Math.max(0.05, memory() * 0.3), sz: 0.8, color: mode === "set" ? "c2" : "c4", opacity: 0.85,
      label: `${memory()}`, labelSize: 0.3, labelUp: 0.35,
      info: { title: "Memory used", html: mode === "set" ? "<p>The set remembers every node visited: it grows with the list.</p>" : "<p>Just pointers: never more than two or three, however long the list is.</p>" } });
    W.label("ml", "memory", [5, -3.4, 0.4], { color: "muted", size: 0.28 });
  }
  function show() { api.status(`${mode === "set" ? "visited set" : "tortoise and hare"} · ${steps} step${steps === 1 ? "" : "s"} · memory: ${memory()} ${mode === "set" ? "nodes" : "pointers"}\n${line}`); }
  function reset() { steps = 0; seen = new Set(); slow = fast = other = start = -1; line = ""; gen = mode === "set" ? withSet() : floyd(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = seen.size || 2;
    if (mode === "set") api.explain(`${seen.size} nodes remembered`, `<p>It works, but the set holds every node. A list of 10⁷ nodes means 10⁷ entries, and an interviewer will ask: "now with O(1) extra memory".</p><p>Switch to <b>tortoise and hare</b> and step through it.</p>`);
    else if (ran.set && !reached) { reached = true; api.explain("Two pointers, no memory", `<p>${steps} steps, like the set, but only 2 pointers instead of ${ran.set} remembered nodes. Inside the loop fast gains one node per step, so it can't jump over slow. Then head-to-start equals meeting-point-to-start (going round the loop), so moving both by 1 meets at the start.</p>`); api.done("You caught a cycle with two pointers"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(650); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "visited set", value: "set" }, { label: "tortoise and hare", value: "floyd" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [-1.3, 0, 0], dist: 23, theta: 0, phi: 1.5, instant: true });
  api.hud("a linked list shaped like a 6 · red link = 11 → 4, the loop · yellow = slow · red = fast · green = loop start · bar = memory used");
  reset();
  api.explain("How to read this", `<p>Follow <code>next</code> from node 0. Does the list ever end, or does it loop? <b>Run all</b> with <b>visited set</b>, then switch to <b>tortoise and hare</b>.</p>`);
});
