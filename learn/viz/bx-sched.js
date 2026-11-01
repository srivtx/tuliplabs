/* Build your own X, chapter 15: the CPU scheduler, the part of an operating system that decides who runs.
   One row per process, time running left to right. A coloured block is a tick on the CPU; a grey block
   is a tick spent ready but waiting. The two keypresses are what a person feels: if they wait, the
   computer feels frozen.
   The "why": one CPU, many programs. Taking turns in small slices (round robin) keeps everything
   responsive without knowing in advance how long anything will take; the price is context switches. */
VIZ.register("bx-sched", async (api) => {
  const W = await api.world3d();
  const JOBS = [
    { name: "video export", arrive: 0, burst: 9, color: "c1", why: "A long, CPU-hungry batch job. Nobody is watching it tick by tick; it only matters when it finishes." },
    { name: "compile", arrive: 1, burst: 5, color: "c2", why: "Another batch job, medium length." },
    { name: "keypress", arrive: 2, burst: 1, color: "c4", key: true, why: "You typed a letter. The editor needs the CPU for one tick to draw it. If it waits more than a couple of ticks, typing feels laggy: <b>response time</b> is what people notice." },
    { name: "email sync", arrive: 4, burst: 3, color: "c3", why: "A short background job." },
    { name: "keypress", arrive: 7, burst: 1, color: "c4", key: true, why: "Another letter typed while the long jobs are still running." },
  ];
  const T = JOBS.reduce((a, j) => a + j.burst, 0);
  const DX = 0.62, X0 = -6.6;
  const X = (t) => X0 + t * DX, Y = (r) => 3.4 - r * 0.95;
  let policy = "fifo", q = 4, busy = false;
  function schedule() {
    const rem = JOBS.map((j) => j.burst), run = [], queue = [];
    let cur = -1, used = 0;
    for (let t = 0; t < 200 && rem.some((r) => r > 0); t++) {
      JOBS.forEach((j, i) => { if (j.arrive === t) queue.push(i); });
      if (policy === "fifo") {
        if (cur < 0 || rem[cur] === 0) cur = queue.length ? queue.shift() : -1;
      } else if (policy === "sjf") {
        if (cur >= 0 && rem[cur] > 0) queue.push(cur);
        queue.sort((a, b) => rem[a] - rem[b] || JOBS[a].arrive - JOBS[b].arrive);
        cur = queue.length ? queue.shift() : -1;
      } else {
        if (cur >= 0 && rem[cur] > 0 && used >= q) { queue.push(cur); cur = -1; }
        if (cur < 0 || rem[cur] === 0) { cur = queue.length ? queue.shift() : -1; used = 0; }
      }
      run.push(cur);
      if (cur >= 0) { rem[cur]--; used++; }
    }
    return run;
  }
  function metrics(run) {
    const first = JOBS.map(() => -1), fin = JOBS.map(() => 0);
    let switches = 0;
    run.forEach((j, t) => {
      if (j < 0) return;
      if (first[j] < 0) first[j] = t;
      fin[j] = t + 1;
      if (t > 0 && run[t - 1] >= 0 && run[t - 1] !== j) switches++;
    });
    const waits = JOBS.map((j, i) => fin[i] - j.arrive - j.burst);
    const resp = JOBS.map((j, i) => first[i] - j.arrive);
    const keyResp = Math.max(...JOBS.map((j, i) => (j.key ? resp[i] : 0)));
    return { waits, resp, fin, switches, keyResp, avgWait: waits.reduce((a, b) => a + b, 0) / JOBS.length };
  }
  function frame() {
    JOBS.forEach((j, r) => {
      W.label("n" + r, j.name, [X0 - 1.4, Y(r), 0], { color: j.key ? "c4" : "ink", size: 0.3 });
      W.box("arr" + r, { x: X(j.arrive) - DX / 2, y: Y(r), z: 0, sx: 0.06, sy: 0.8, sz: 0.06, color: "ink", instant: true,
        info: { title: `${j.name}: arrives at tick ${j.arrive}, needs ${j.burst} tick${j.burst > 1 ? "s" : ""}`, html: `<p>${j.why}</p>` } });
    });
    for (let t = 0; t <= T; t += 5) W.label("t" + t, String(t), [X(t), Y(JOBS.length - 1) - 0.8, 0], { color: "muted", size: 0.26 });
    W.label("tl", "time (ticks) →", [X(T) + 0.4, Y(JOBS.length - 1) - 0.8, 0], { color: "muted", size: 0.26 });
    W.box("cpu", { x: -0.8, y: Y(-1.3), z: 0, sx: 1.6, sy: 0.7, sz: 0.7, color: "c5", label: "CPU", labelSize: 0.3, labelUp: -0.35, instant: true,
      info: { title: "One CPU core", html: "<p>It can run exactly one process at a time. Everything else that's ready has to wait in the <b>ready queue</b>. The scheduler is the code that picks who goes next, every time a process finishes, blocks, or uses up its time slice.</p>" } });
  }
  function cell(r, t, kind) {
    const j = JOBS[r];
    W.box(`g${r}_${t}`, { x: X(t), y: Y(r), z: 0, sx: DX * 0.9, sy: kind === "run" ? 0.7 : 0.4, sz: kind === "run" ? 0.7 : 0.35,
      color: kind === "run" ? j.color : "c5", opacity: kind === "run" ? 1 : 0.35, glow: kind === "run" && j.key ? 0.6 : 0, fromY: kind === "run" ? Y(-1.3) : undefined, fromX: kind === "run" ? -0.8 : undefined,
      info: kind === "run"
        ? { title: `Tick ${t}: ${j.name} is on the CPU`, html: "<p>For this tick, the scheduler gave the CPU to this process. Its registers were loaded, it ran, and at the end of the tick the scheduler decides again.</p>" }
        : { title: `Tick ${t}: ${j.name} is waiting`, html: "<p>Ready to run, but someone else has the CPU. Grey blocks are pure waiting time. For a keypress, every grey block is lag you can feel.</p>" } });
  }
  async function play(animate) {
    if (busy) return;
    busy = true;
    W.clear(); frame();
    const run = schedule();
    const rem = JOBS.map((j) => j.burst);
    for (let t = 0; t < run.length; t++) {
      JOBS.forEach((j, r) => {
        if (r === run[t]) cell(r, t, "run");
        else if (j.arrive <= t && rem[r] > 0) cell(r, t, "wait");
      });
      if (run[t] >= 0) rem[run[t]]--;
      if (animate) {
        if (run[t] >= 0) W.box("cpu", { color: JOBS[run[t]].color, label: `CPU: ${JOBS[run[t]].name}` });
        await api.sleep(170);
      }
    }
    W.box("cpu", { color: "c5", label: "CPU: idle" });
    const m = metrics(run);
    const pname = policy === "fifo" ? "first come, first served" : policy === "sjf" ? "shortest remaining first" : `round robin, slice = ${q}`;
    api.status(`${pname}\naverage waiting time: ${m.avgWait.toFixed(1)} ticks\nworst keypress delay: ${m.keyResp} tick${m.keyResp === 1 ? "" : "s"}\ncontext switches: ${m.switches}\nfinish times: ${JOBS.map((j, i) => `${j.name} ${m.fin[i]}`).join(", ")}`);
    if (policy === "fifo") api.explain("First come, first served", `<p>Simple and fair in one sense, but the keypress waited <b>${m.keyResp} ticks</b> behind a long export. That's the "convoy effect": short jobs stuck behind a long one. The computer feels frozen.</p><p>Try shortest-first, then round robin.</p>`);
    else if (policy === "sjf") api.explain("Shortest remaining first", `<p>Average waiting drops to ${m.avgWait.toFixed(1)}, the best possible. But there's a catch: the scheduler had to <b>know how long each job would take</b>. A real OS can't see the future. And a steady stream of short jobs would starve the export forever.</p>`);
    else if (m.keyResp <= 2) {
      api.explain("Responsive without knowing the future", `<p>Every process gets a slice of ${q} tick${q > 1 ? "s" : ""}, then goes to the back of the queue. A keypress only waits for the few processes ahead of it to take one short turn each, and the scheduler needed no idea how long anything takes.</p><p>The price: <b>${m.switches} context switches</b>. Each one saves and restores registers and dirties the caches, so real slices are a few milliseconds, not microseconds. Real kernels (like Linux's) also boost processes that just woke up from waiting on the keyboard.</p>`);
      api.done("Your keypresses felt instant, with no fortune-telling");
    } else api.explain("Round robin", `<p>The worst keypress still waited ${m.keyResp} ticks. What happens to that number if the slice gets shorter? And what happens to the number of context switches?</p>`);
    busy = false;
  }
  api.seg([{ label: "first come, first served", value: "fifo" }, { label: "shortest first", value: "sjf" }, { label: "round robin", value: "rr" }], policy, (v) => { policy = v; play(false); });
  api.slider("Round-robin time slice (ticks)", { min: 1, max: 6, step: 1, value: q }, (v) => { q = v; if (policy === "rr") play(false); });
  api.button("Replay, tick by tick", () => play(true), { primary: true });
  W.camera({ target: [-1.6, 1.9, 0], dist: 20, theta: 0, phi: 1.4, instant: true });
  api.hud("coloured = running · grey = ready but waiting · click anything to ask why");
  api.explain("How to read this", "<p>Five processes share one CPU. Time runs left to right. A coloured block means that process had the CPU for that tick; a grey block means it was ready but had to wait.</p><p>The two amber <b>keypresses</b> are you typing. Find a scheduling policy that makes them respond within two ticks, without knowing in advance how long any job takes.</p>");
  play(false);
});
