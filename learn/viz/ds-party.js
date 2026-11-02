/* DSA, chapter 34: DP on trees (maximum independent set: the company party).
   Twelve people in a company tree, each with a "fun" score. Invite a group with the most fun, but
   never invite someone together with their direct boss.
   The "why": greedy invites the most fun person first and blocks everyone around them. Inviting the
   9 blocks their boss and both their reports; it ends at 26. Tree DP works bottom-up: for each
   person, the best fun in their subtree if they're invited (their fun + every child left out) and if
   they're not (each child either way, whichever is better). Two numbers per node, one pass: 48. */
VIZ.register("ds-party", async (api) => {
  const W = await api.world3d();
  const PAR = [-1, 0, 0, 0, 1, 1, 2, 3, 3, 4, 6, 6], FUN = [2, 8, 8, 8, 6, 8, 9, 7, 5, 1, 7, 7], N = PAR.length;
  const kids = PAR.map(() => []); PAR.forEach((p, v) => { if (p >= 0) kids[p].push(v); });
  const pos = []; let col = 0;
  (function place(v, d) {
    if (!kids[v].length) { pos[v] = [col++, d]; return; }
    kids[v].forEach((c) => place(c, d + 1));
    const xs = kids[v].map((c) => pos[c][0]); pos[v] = [(Math.min(...xs) + Math.max(...xs)) / 2, d];
  })(0, 0);
  let mode = "greedy", gen = null, steps = 0, state = [], inv = [], out = [], cur = -1, running = false, ran = {}, reached = false, line = "", total = 0;
  function* greedy() {
    for (const v of [...Array(N).keys()].sort((a, b) => FUN[b] - FUN[a] || a - b)) {
      steps++; cur = v;
      const clash = (PAR[v] >= 0 && state[PAR[v]] === "in") ? PAR[v] : kids[v].find((c) => state[c] === "in");
      if (clash !== undefined) { state[v] = "blocked"; yield `person ${v} (fun ${FUN[v]}): ${clash === PAR[v] ? "their boss" : "a direct report"} (${clash}) is invited. Can't`; }
      else { state[v] = "in"; total += FUN[v]; yield `person ${v} (fun ${FUN[v]}): most fun left and allowed. Invite. Total ${total}`; }
    }
    cur = -1;
    yield `greedy party: fun ${total}`;
  }
  function* tree() {
    function* post(v) {
      for (const c of kids[v]) yield* post(c);
      steps++; cur = v;
      inv[v] = FUN[v] + kids[v].reduce((s, c) => s + out[c], 0);
      out[v] = kids[v].reduce((s, c) => s + Math.max(inv[c], out[c]), 0);
      yield kids[v].length ? `person ${v}: invited = ${FUN[v]} + reports left out (${kids[v].map((c) => out[c]).join(" + ")}) = ${inv[v]}; not invited = best of each report (${kids[v].map((c) => Math.max(inv[c], out[c])).join(" + ")}) = ${out[v]}` : `person ${v} has no reports: invited ${inv[v]}, not invited 0`;
    }
    yield* post(0);
    function* pick(v, bossIn) {
      steps++; cur = v;
      const go = !bossIn && inv[v] >= out[v];
      state[v] = go ? "in" : "out"; if (go) total += FUN[v];
      yield bossIn ? `person ${v}: their boss is invited, so not them` : go ? `person ${v}: invited (${inv[v]}) beats not (${out[v]}). Invite. Total ${total}` : `person ${v}: not inviting (${out[v]}) beats inviting (${inv[v]})`;
      for (const c of kids[v]) yield* pick(c, go);
    }
    yield* pick(0, false);
    cur = -1;
    yield `tree DP party: fun ${total}`;
  }
  function draw() {
    for (let v = 0; v < N; v++) {
      const [cx, d] = pos[v], x = -4.5 + cx * 1.5, y = 2.8 - d * 1.9, s = state[v], hot = v === cur;
      W.box("p" + v, { x, y, z: 0, sx: 0.85, sy: 0.85, sz: 0.5, color: hot ? "c1" : s === "in" ? "c3" : s === "blocked" ? "bad" : inv[v] !== undefined ? "c2" : "c5", glow: hot ? 0.4 : 0, opacity: s === "out" ? 0.45 : 0.95,
        label: String(FUN[v]), labelSize: 0.3, labelUp: 0, info: { title: `Person ${v}`, html: `<p>Fun ${FUN[v]}.${PAR[v] >= 0 ? ` Boss: ${PAR[v]}.` : " The CEO."}${inv[v] !== undefined ? ` Best in this subtree: ${inv[v]} if invited, ${out[v]} if not.` : ""}</p>` } });
      W.label("dp" + v, mode === "tree" && inv[v] !== undefined ? `in ${inv[v]} · out ${out[v]}` : "", [x, y - 0.75, 0.4], { color: "c2", size: 0.2 });
      if (PAR[v] >= 0) W.line("e" + v, "p" + PAR[v], "p" + v, { color: s === "in" || state[PAR[v]] === "in" ? "line" : "muted" });
    }
  }
  function show() { api.status(`${mode === "greedy" ? "greedy: most fun first" : "tree DP: (invited, not) per person"} · ${steps} step${steps === 1 ? "" : "s"} · fun ${total}\n${line}`); }
  function reset() { steps = 0; state = []; inv = []; out = []; cur = -1; total = 0; line = ""; gen = mode === "greedy" ? greedy() : tree(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = total;
    if (mode === "greedy") api.explain(`Fun ${total}`, `<p>Inviting the 9 first blocked their boss and both their 7s. Each pick looked best on its own and cost more than it gained.</p><p>Switch to <b>tree DP</b> and run it.</p>`);
    else if (ran.greedy && !reached) { reached = true; api.explain("Two numbers per person", `<p>Fun ${total} against greedy's ${ran.greedy}. Bottom-up, each person stores the best for their whole team if they're invited (reports must stay home) and if not (each report decides freely). Then one pass from the top picks who comes.</p><p>Every person is handled once: O(n).</p>`); api.done("You solved a tree with DP"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(650); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "greedy: most fun first", value: "greedy" }, { label: "tree DP", value: "tree" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [-0.75, -0.2, 0], dist: 16.5, theta: 0, phi: 1.5, instant: true });
  api.hud("number = fun · lines = boss to report · green = invited · red = blocked · blue = subtree solved, with its best if invited (in) and if not (out)");
  reset();
  api.explain("How to read this", `<p>Invite the most fun group, but never someone together with their direct boss. <b>Run all</b> with <b>greedy</b>, then with <b>tree DP</b>.</p>`);
});
