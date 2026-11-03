/* Build your own X, chapter 37: a job scheduler.
   Six jobs all call an email service at second 0. The service is down until second 8, and once
   it's back it can handle only 2 calls a second.
   The "why": retrying a failed job straight away, every second, hammers a service that's already
   struggling: dozens of wasted calls, then all six arrive the moment it recovers and most fail
   again. Exponential backoff waits 1, 2, 4, 8… seconds between tries, and jitter (a random
   offset) spreads the jobs out so they don't all come back at once. Fewer calls, and the service
   gets a gentle ramp instead of a stampede. */
VIZ.register("bx-retry", async (api) => {
  const W = await api.world3d();
  const N = 6, UP = 8, CAP = 2, T = 24;
  const JIT = [0, 1, 0, 2, 1, 2];   // fixed "random" offsets so every run is the same
  let mode = "now", gen = null, grid = [], load = [], t = 0, calls = 0, doneAt = [], running = false, ran = {}, reached = false, line = "";
  function* simulate(nextTry) {
    const due = new Array(N).fill(0), tries = new Array(N).fill(0);
    for (t = 0; t < T && doneAt.some((d) => d < 0); t++) {
      const now = [...Array(N).keys()].filter((j) => doneAt[j] < 0 && due[j] === t);
      load[t] = now.length; calls += now.length;
      let served = 0;
      for (const j of now) {
        tries[j]++;
        if (t >= UP && served < CAP) { served++; grid[j][t] = "ok"; doneAt[j] = t; }
        else { grid[j][t] = "fail"; due[j] = nextTry(j, t, tries[j]); }
      }
      const fails = now.length - served;
      yield `second ${t}: ${now.length} call${now.length === 1 ? "" : "s"}${t < UP ? ", the service is down, all fail" : `, the service handles ${CAP}: ${served} succeed${fails ? `, ${fails} fail` : ""}`}`;
    }
    yield `all ${N} jobs done by second ${Math.max(...doneAt)}, after ${calls} calls`;
  }
  const now = () => simulate((j, t) => t + 1);
  const backoff = () => simulate((j, t, k) => t + 2 ** (k - 1) + JIT[j] * (k > 1 ? 1 : 0));
  function draw() {
    for (let j = 0; j < N; j++) {
      W.label("jl" + j, `job ${j + 1}`, [-3.75, 1.9 - j * 0.4, 0.2], { color: "ink", size: 0.15 });
      for (let k = 0; k < T; k++) {
        const g = grid[j] && grid[j][k];
        W.box(`c${j}_${k}`, { x: -3.1 + k * 0.28, y: 1.9 - j * 0.4, z: 0, sx: 0.24, sy: 0.32, sz: 0.2, color: g === "ok" ? "c3" : g === "fail" ? "c1" : k < UP ? "c5" : "line", opacity: g ? 0.95 : k < UP ? 0.25 : 0.15,
          info: { title: `Job ${j + 1}, second ${k}`, html: `<p>${g === "ok" ? "Call succeeded." : g === "fail" ? "Call failed." : "No call."}${k < UP ? " The service is down." : ""}</p>` } });
      }
    }
    for (let k = 0; k < T; k++) {
      const l = load[k] || 0;
      W.box("ld" + k, { x: -3.1 + k * 0.28, y: -1.9 + l * 0.07, z: 0, sx: 0.24, sy: Math.max(0.02, l * 0.14), sz: 0.2, color: l > CAP ? "c1" : "c2", opacity: l ? 0.9 : 0.2,
        info: { title: `Second ${k}`, html: `<p>${l} calls arrived.${k >= UP ? ` The service can take ${CAP}.` : " The service is down."}</p>` } });
    }
    W.box("cap", { x: -3.1 + (UP + (T - 1)) / 2 * 0.28, y: -1.9 + CAP * 0.14, z: 0.12, sx: (T - UP) * 0.28, sy: 0.03, sz: 0.03, color: "c4", opacity: 0.9 });
    W.label("ll", "calls per second", [-2.6, -2.15, 0.2], { color: "muted", size: 0.14 });
    W.box("now", { x: -3.1 + Math.min(t, T - 1) * 0.28, y: 0.1, z: 0.2, sx: 0.03, sy: 4.4, sz: 0.03, color: "c4", opacity: t ? 0.7 : 0 });
  }
  function show() { api.status(`${mode === "now" ? "retry every second" : "exponential backoff + jitter"} · ${calls} calls\n${line}`); }
  function reset() { grid = [...Array(N)].map(() => []); load = []; t = 0; calls = 0; doneAt = new Array(N).fill(-1); line = ""; gen = mode === "now" ? now() : backoff(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = calls;
    if (mode === "now") api.explain(`${calls} calls for 6 jobs`, `<p>Every failed job came straight back, so the service was hit 6 times a second while it was down, and all six arrived together when it recovered.</p><p>Switch to <b>exponential backoff + jitter</b> and run it.</p>`);
    else if (ran.now !== undefined && !reached) { reached = true; api.explain("Back off, and spread out", `<p>${calls} calls against ${ran.now}. The last job finished a few seconds later, which is the trade: waiting longer after each failure leaves a struggling service alone, and jitter staggers the jobs so they return in small groups.</p><p>AWS, Google and every job queue (Celery, Sidekiq) retry this way.</p>`); api.done("You scheduled retries politely"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(500); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "retry every second", value: "now" }, { label: "exponential backoff + jitter", value: "backoff" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.2, 0], dist: 10.8, theta: 0, phi: 1.5, instant: true });
  api.hud("one row per job, one square per second · red = failed call · green = success · grey band = service down · bottom: calls per second, amber line = what the service can take");
  reset();
  api.explain("How to read this", `<p>Six jobs, a service that's down for 8 seconds. <b>Run all</b> with <b>retry every second</b>, then with <b>exponential backoff + jitter</b>.</p>`);
});
