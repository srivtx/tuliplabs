/* DSA, chapter 57: constructive problems.
   Six teams, five rounds, and every pair of teams has to meet exactly once.
   The "why": pairing each team with the first opponent it hasn't met yet looks fine for a round,
   then strands a team whose remaining opponents are all busy. Searching for a schedule is
   backtracking; a construction just writes one down. The circle method seats the teams in two rows,
   pairs each column, then keeps team 0 still and rotates everyone else one seat. After n − 1 turns
   every pair has faced each other once: n/2 pairs a round, no search at all. */
VIZ.register("ds-roundrobin", async (api) => {
  const W = await api.world3d();
  const N = 6;
  const seatPos = (i) => (i < N / 2 ? [-3.1 + i * 1.3, 0.9] : [-3.1 + (N - 1 - i) * 1.3, -0.9]);
  const hexPos = (t) => [-1.8 + 1.35 * Math.cos(Math.PI / 2 - (t * 2 * Math.PI) / N), 0.1 + 1.35 * Math.sin(Math.PI / 2 - (t * 2 * Math.PI) / N)];
  let mode = "greedy", gen = null, seat = [], pairs = [], met = new Set(), round = 0, stuck = -1, running = false, ran = {}, reached = false, line = "";
  const key = (a, b) => Math.min(a, b) + "-" + Math.max(a, b);
  function* greedy() {
    for (round = 1; round < N; round++) {
      pairs = []; const free = [...Array(N).keys()];
      while (free.length) {
        const a = free.shift(), b = free.find((x) => !met.has(key(a, x)));
        if (b === undefined) { stuck = a; yield `round ${round}: team ${a} has already met everyone still free (${free.join(", ")}). Stuck`; return; }
        free.splice(free.indexOf(b), 1); pairs.push([a, b]); met.add(key(a, b));
        yield `round ${round}: team ${a} plays ${b}, the first team it hasn't met`;
      }
    }
  }
  function* circleMethod() {
    for (round = 1; round < N; round++) {
      pairs = [];
      for (let i = 0; i < N / 2; i++) { const a = seat[i], b = seat[N - 1 - i]; pairs.push([a, b]); met.add(key(a, b)); }
      yield `round ${round}: pair each column, ${pairs.map(([a, b]) => `${a}–${b}`).join(", ")}. ${met.size} of ${(N * (N - 1)) / 2} pairs played`;
      if (round < N - 1) { seat = [seat[0], seat[N - 1], ...seat.slice(1, N - 1)]; pairs = []; yield `team 0 stays put, everyone else moves one seat clockwise`; }
    }
    yield `all ${(N * (N - 1)) / 2} pairs played once in ${N - 1} rounds, with no searching`;
  }
  function draw() {
    const where = mode === "circle" ? seat : [...Array(N).keys()];
    where.forEach((t, i) => { const [x, y] = mode === "circle" ? seatPos(i) : hexPos(t);
      W.box("t" + t, { x, y, z: 0, sx: 0.8, sy: 0.6, sz: 0.4, color: t === stuck ? "c1" : t === 0 && mode === "circle" ? "c4" : "c2", opacity: 0.92, label: `${t}`, labelSize: 0.24, labelUp: 0,
        info: { title: `Team ${t}`, html: `<p>Has met ${[...Array(N).keys()].filter((u) => u !== t && met.has(key(t, u))).join(", ") || "nobody"} so far.</p>` } }); });
    for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) {
      const on = pairs.some(([x, y]) => key(x, y) === key(a, b));
      if (on) W.line("p" + key(a, b), "t" + a, "t" + b, { color: "c3" }); else W.unline("p" + key(a, b));
      W.box("g" + key(a, b), { x: 0.7 + b * 0.4, y: 1.3 - a * 0.4, z: 0, sx: 0.34, sy: 0.34, sz: 0.1, color: on ? "c3" : met.has(key(a, b)) ? "c5" : "line", opacity: met.has(key(a, b)) ? 0.9 : 0.35,
        info: { title: `Teams ${a} and ${b}`, html: `<p>${met.has(key(a, b)) ? "Already played." : "Not played yet."}</p>` } });
    }
    for (let i = 1; i < N; i++) { W.label("gr" + i, `${i}`, [0.7 + i * 0.4, 1.72, 0], { color: "muted", size: 0.15 }); W.label("gc" + i, `${i - 1}`, [0.75 + (i - 1) * 0.4, 1.3 - (i - 1) * 0.4, 0], { color: "muted", size: 0.15 }); }
  }
  function show() { api.status(`${mode === "greedy" ? "first team not met" : "circle method"} · round ${Math.min(round, N - 1)} of ${N - 1} · ${met.size} of ${(N * (N - 1)) / 2} pairs\n${line}`); }
  function reset() { seat = [...Array(N).keys()]; pairs = []; met = new Set(); round = 0; stuck = -1; line = ""; gen = mode === "greedy" ? greedy() : circleMethod(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = met.size;
    if (mode === "greedy") api.explain(`Stuck in round ${round}`, `<p>Team 4 has met 5, and 5 is the only team left. Undoing earlier choices would fix it, but that's a search, and searches blow up.</p><p>Switch to <b>circle method</b> and run it.</p>`);
    else if (ran.greedy !== undefined && !reached) { reached = true; api.explain("Write it down, don't search", `<p>Every pair met exactly once (the grid on the right is full). Rotating around a fixed team works for any even number of teams. For an odd number, add a "bye" team.</p><p>Constructive problems reward trying small cases until a pattern like this shows up.</p>`); api.done("You built a round-robin schedule"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(900); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "first team not met", value: "greedy" }, { label: "circle method", value: "circle" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.2, 0], dist: 11, theta: 0, phi: 1.5, instant: true });
  api.hud("six teams · circle method: two rows, columns play · green lines = this round's games · grid: which pairs have played · amber = the team that never moves");
  reset();
  api.explain("How to read this", `<p>Schedule rounds so every pair of teams plays once. <b>Run all</b> with <b>first team not met</b>, then with <b>circle method</b>.</p>`);
});
