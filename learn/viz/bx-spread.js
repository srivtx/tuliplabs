/* Build your own X, chapter 45: the friendship paradox stops an outbreak.
   320 people and their friendships. A few people have many friends, most have few, and hubs sit in
   the middle of the picture. You have a fixed number of vaccine doses.
   The "why": giving them to random people mostly protects people with few friends. But you can find
   the hubs with no map at all: pick random people and ask each to name a friend. Your friends have
   more friends than you do, because popular people show up on more friend lists. The same doses
   given that way cut the outbreak by about ten times. */
VIZ.register("bx-spread", async (api) => {
  const N = 320, M = 2, P = 0.4, RUNS = 300;
  let seed = 5;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const adj = Array.from({ length: N }, () => []), ends = [];
  for (let i = 0; i <= M; i++) for (let j = 0; j < i; j++) { adj[i].push(j); adj[j].push(i); ends.push(i, j); }
  for (let i = M + 1; i < N; i++) {
    const c = new Set();
    while (c.size < M) c.add(ends[(rnd() * ends.length) | 0]);
    for (const j of c) { adj[i].push(j); adj[j].push(i); ends.push(i, j); }
  }
  const rank = [...adj.keys()].sort((a, b) => adj[b].length - adj[a].length), pos = new Array(N);
  rank.forEach((id, k) => { const r = Math.sqrt((k + 0.5) / N), a = k * 2.39996; pos[id] = [Math.cos(a) * r, Math.sin(a) * r]; });
  const meanDeg = adj.reduce((s, a) => s + a.length, 0) / N;
  let fs = 0, fc = 0;
  for (const a of adj) for (const j of a) { fs += adj[j].length; fc++; }
  const meanFriend = fs / fc;

  let plan = "none", share = 0.2, state = new Int8Array(N), wave = [], results = {}, running = false, reached = api.wasDone, doses = new Set();
  function pick(mode, k) {
    const v = new Set();
    if (mode === "none") return v;
    while (v.size < k) {
      const i = (Math.random() * N) | 0;
      v.add(mode === "random" ? i : adj[i][(Math.random() * adj[i].length) | 0]);
    }
    return v;
  }
  function seedOutbreak(v) {
    const st = new Int8Array(N), now = [];
    for (const i of v) st[i] = 3;
    while (now.length < 3) { const i = (Math.random() * N) | 0; if (!st[i]) { st[i] = 1; now.push(i); } }
    return [st, now];
  }
  function spread(st, now) {
    const next = [];
    for (const i of now) {
      for (const j of adj[i]) if (!st[j] && Math.random() < P) { st[j] = 1; next.push(j); }
      st[i] = 2;
    }
    return next;
  }
  function average(mode) {
    let total = 0;
    const k = Math.round(share * N);
    for (let r = 0; r < RUNS; r++) {
      let [st, now] = seedOutbreak(pick(mode, k)), got = 3;
      while (now.length) { now = spread(st, now); got += now.length; }
      total += got;
    }
    return (total / RUNS / N) * 100;
  }
  function prepare() { doses = pick(plan, Math.round(share * N)); state = new Int8Array(N); for (const i of doses) state[i] = 3; wave = []; }
  prepare();

  const LABEL = { none: "No vaccines", random: "Random people", friends: "A friend of a random person" };
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const narrow = w < 520, chartW = Math.min(250, w * 0.36);
    const R = narrow ? Math.min(w, h * 0.62) / 2 - 8 : Math.min(h, w - chartW) / 2 - 12, cx = narrow ? w / 2 : R + 12, cy = narrow ? R + 8 : h / 2;
    const at = (i) => [cx + pos[i][0] * R, cy + pos[i][1] * R];
    g.strokeStyle = api.color("line"); g.lineWidth = 0.6; g.globalAlpha = 0.5;
    g.beginPath();
    adj.forEach((a, i) => { for (const j of a) if (j > i) { g.moveTo(...at(i)); g.lineTo(...at(j)); } });
    g.stroke(); g.globalAlpha = 1;
    const col = [api.color("c5"), api.color("c1"), api.color("c4"), api.color("c3")];
    for (let i = 0; i < N; i++) {
      const [x, y] = at(i);
      g.fillStyle = col[state[i]];
      g.beginPath(); g.arc(x, y, 2 + Math.sqrt(adj[i].length) * 0.9, 0, 6.2832); g.fill();
    }
    const bx = narrow ? 12 : cx + R + 22, bw = w - bx - 12, top = narrow ? 2 * R + 20 : 24, gap = narrow ? 34 : 52;
    g.fillStyle = api.color("ink"); g.font = "600 12px 'IBM Plex Sans', sans-serif"; g.textAlign = "left";
    g.fillText("Share of everyone infected", bx, top);
    g.font = "11px 'IBM Plex Sans', sans-serif";
    ["none", "random", "friends"].forEach((k, n) => {
      const y = top + 18 + n * gap, v = results[k];
      g.fillStyle = api.color("muted"); g.fillText(LABEL[k], bx, y);
      g.fillStyle = api.color("line"); g.fillRect(bx, y + 6, bw, 12);
      if (v !== undefined) {
        g.fillStyle = k === "friends" ? api.color("c3") : k === "random" ? api.color("c2") : api.color("c1");
        g.fillRect(bx, y + 6, (bw * v) / 100, 12);
        g.fillStyle = api.color("ink"); g.font = "600 12px 'IBM Plex Mono', monospace";
        if (narrow) { g.textAlign = "right"; g.fillText(`${Math.round(v)}%`, bx + bw, y); g.textAlign = "left"; }
        else g.fillText(`${Math.round(v)}%`, bx, y + 33);
        g.font = "11px 'IBM Plex Sans', sans-serif";
      }
    });
  });
  function say() {
    const vax = [...doses];
    const mean = vax.length ? vax.reduce((s, i) => s + adj[i].length, 0) / vax.length : 0;
    api.status(vax.length ? `${vax.length} doses, given to people with ${mean.toFixed(1)} friends on average` : "No doses given.");
  }
  say();
  let wait = 0;
  api.loop((dt) => {
    if (!cv.w) return;
    if (running) {
      wait += dt;
      if (wait > 0.32) {
        wait = 0;
        wave = spread(state, wave);
        if (!wave.length) {
          running = false;
          results[plan] = average(plan);
          const r = results;
          api.explain(`${RUNS} outbreaks, averaged`, `<p>You watched one. Behind it, ${RUNS} more ran with this plan, so one lucky run can't fool you. Average: <b>${Math.round(r[plan])}%</b> of people infected.</p>`);
          if (!reached && r.random !== undefined && r.friends !== undefined && r.friends < r.random) {
            reached = true;
            api.done("Same doses, about ten times fewer cases. No map needed: just ask people to name a friend");
          }
        }
      }
    }
    cv.redraw();
  });
  api.seg([{ label: "No vaccines", value: "none" }, { label: "Random people", value: "random" }, { label: "Random person's friend", value: "friends" }], "none", (v) => {
    plan = v; running = false; prepare(); say();
    api.explain(LABEL[v], {
      none: "<p>Red is infected, amber has recovered. Big dots in the middle have the most friends.</p>",
      random: "<p>Green people are vaccinated. Most people have few friends, so most doses land out at the edge, where they stop very little.</p>",
      friends: `<p>Pick a random person and vaccinate someone they name as a friend. Look where the green lands: towards the middle. Here, the average person has <b>${meanDeg.toFixed(1)}</b> friends, and the average friend has <b>${meanFriend.toFixed(1)}</b>.</p>`,
    }[v]);
  });
  const row = api.row();
  api.button("Start an outbreak", () => {
    prepare();
    const [st, now] = seedOutbreak(doses);
    state = st; wave = now; running = true; wait = 0; say();
  }, { primary: true, row });
  api.slider("Doses", { min: 0.05, max: 0.4, step: 0.05, value: 0.2, format: (v) => `${Math.round(v * 100)}% of people` }, (v) => { share = v; results = {}; running = false; prepare(); say(); });
  api.explain("A town of friendships", `<p>320 people. Each friendship is a line, and big dots have the most friends. You can't see this map in real life. Run an outbreak under each plan and compare.</p>`);
});
