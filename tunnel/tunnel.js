/* Wind Tunnel: one experiment at a time, on a live system you can push.
   The stage is an isometric voxel scene: a crowd on the left sends requests down a wire to a server; requests that
   find every worker busy stack up as a queue tower; answers fly back green, failures red. Drag the crowd up or down
   to change the load. Click the server to change its workers.
   Underneath, charts: p99 against load (a dot per steady second, so the knee draws itself), and four timelines.
   On the left, the experiment: predict (drag a pin), explore (find the bend), why (the law), then a task with a
   goal measured live over 30 s. Progress lives in vnl-code-v1 (done.wt01…, wt: guesses and phase). */
(() => {
  "use strict";
  const { Sim } = window.WTSim;
  const X_ALL = window.WT.experiments;
  const LIVE = X_ALL.filter((x) => x.live);
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c);
    return el;
  };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ------------------------------------------------------------ progress --
  const KEY = "vnl-code-v1";
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } };
  let S = Object.assign({ done: {} }, load());
  S.wt = S.wt || {};
  let saveT = 0;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const now = Object.assign({ done: {} }, load());
      now.done = Object.assign(now.done || {}, S.done);
      now.wt = Object.assign(now.wt || {}, S.wt);
      now.xp = Math.max(now.xp || 0, S.xp || 0);
      const day = new Date().toISOString().slice(0, 10);
      now.days = [...new Set([...(now.days || []), ...(S.days || []), day])];
      S = now;
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ }
    }, 150);
  }

  // --------------------------------------------------------------- shell --
  const main = $("#wt");
  let X, idx, sim, P, speed = 1, paused = false, samples = [], dots = [], lastLoadChange = 0, lastServerChange = 0, flyers = [], measure = null;
  const SPEEDS = [[0.1, "slow-mo"], [1, "×1"], [10, "×10"]];
  const WINDOW = 30;
  const els = {};

  function route() {
    const n = parseInt((location.hash.match(/^#(\d+)/) || [])[1] || "1", 10);
    const x = X_ALL[n - 1];
    open(x && x.live ? n - 1 : 0);
  }
  addEventListener("hashchange", route);

  function open(i) {
    idx = i;
    X = X_ALL[i];
    shownPhase = null;
    P = S.wt[X.id] = Object.assign({ phase: "predict", guess: null }, S.wt[X.id]);
    if (S.done[X.id] && P.phase !== "done") P.phase = "done";
    speed = 1; paused = false;
    resetSim();
    build();
    document.title = `${X.title} · Wind Tunnel · Tulip Labs`;
    main.removeAttribute("aria-busy");
  }
  function resetSim(patch) {
    const cfg = { ...X.system, ...(P.phase === "task" || P.phase === "done" ? { ...X.task.set, ...X.task.start } : {}), ...(patch || {}) };
    sim = new Sim(cfg, 1 + idx);
    sim.feed = [];
    samples = []; dots = []; flyers = []; lastLoadChange = 0; lastServerChange = 0; measure = null;
  }
  const knob = () => X.crowd.knob;
  const loadNow = () => sim.cfg[knob()];
  const fmtLoad = (v) => `${Math.round(v)} ${X.crowd.short}`;
  const ms = (s) => (s >= 10 ? `${s.toFixed(0)} s` : s >= 1 ? `${s.toFixed(1)} s` : `${Math.round(s * 1000)} ms`);

  function build() {
    main.innerHTML = "";
    const n = X_ALL.indexOf(X) + 1;
    els.bar = h("div", { class: "wt-bar" },
      h("a", { class: "wt-back", href: "./", title: "All experiments" }, "Wind Tunnel"),
      h("span", { class: "wt-sep" }, "/"),
      h("span", { class: "wt-no" }, `Experiment ${n}`),
      h("b", { class: "wt-title" }, X.title),
      h("span", { class: "wt-grow" }),
      h("nav", { class: "wt-steps", "aria-label": "Experiments" }, LIVE.map((x) => h("a", {
        href: `#${X_ALL.indexOf(x) + 1}`, class: (x === X ? "cur " : "") + (S.done[x.id] ? "done" : ""), title: x.title, "aria-current": x === X ? "page" : null,
      }, String(X_ALL.indexOf(x) + 1)))),
      els.clock = h("span", { class: "wt-clock", title: "Simulated time" }),
      els.pause = h("button", { class: "wt-word", onclick: togglePause, title: "Pause or play (space)" }),
      els.speed = h("button", { class: "wt-word", onclick: cycleSpeed, title: "Speed: slow motion, real time, ten times" }));
    els.brief = h("aside", { class: "wt-brief", "aria-label": "The experiment" });
    els.canvas = h("canvas", { class: "wt-cv", "aria-label": "The system: a crowd sending requests to a server" });
    els.crowd = h("button", { class: "wt-crowd", "aria-label": "Load. Drag up or down, or use the arrow keys" });
    els.serverTag = h("button", { class: "wt-server", "aria-label": "The server. Click to change its workers", onclick: () => toggleInspect() });
    els.queueTag = h("span", { class: "wt-queue" });
    els.inspect = h("div", { class: "wt-insp", hidden: true });
    els.hint = h("p", { class: "wt-hint" });
    els.stage = h("section", { class: "wt-stage" }, els.canvas, els.crowd, els.queueTag, els.serverTag, els.inspect, els.hint);
    els.charts = h("section", { class: "wt-charts", "aria-label": "Live numbers" });
    els.handle = h("button", { class: "wt-handle", onclick: () => main.classList.toggle("sheet-open"), "aria-label": "Show or hide the experiment" }, h("i"), h("span"));
    main.append(els.bar, h("div", { class: "wt-body" }, els.brief, h("div", { class: "wt-right" }, els.stage, els.charts)), els.handle);
    buildCharts();
    renderBrief();
    wireStage();
    updateBar();
    resize();
  }
  function togglePause() { paused = !paused; updateBar(); }
  function cycleSpeed() { const i = SPEEDS.findIndex((s) => s[0] === speed); speed = SPEEDS[(i + 1) % SPEEDS.length][0]; updateBar(); }
  function updateBar() {
    els.pause.textContent = paused ? "▶ play" : "❚❚ pause";
    els.speed.textContent = SPEEDS.find((s) => s[0] === speed)[1];
    els.speed.classList.toggle("on", speed !== 1);
  }

  // --------------------------------------------------------------- brief --
  // The experiment as a short column of steps. Done steps fold down to one line; the current one is open.
  function renderBrief() {
    const b = els.brief;
    b.innerHTML = "";
    const order = ["predict", "explore", "task", "done"];
    const at = order.indexOf(P.phase);
    b.append(
      h("p", { class: "wt-eyebrow" }, `Experiment ${X_ALL.indexOf(X) + 1} · ${X.law}`),
      h("h1", {}, X.title),
      h("p", { class: "wt-lede", html: X.brief }));
    const step = (k, n, title, body, folded) => h("section", { class: `wt-step ${at > k ? "past" : at === k ? "now" : "next"}` },
      h("h2", {}, h("span", { class: "n" }, at > k ? "✓" : String(n)), title, folded ? h("em", { html: folded }) : null),
      at >= k ? body() : null);
    b.append(
      step(0, 1, "Predict", predictBody, P.guess != null && at > 0 ? `you said ${fmtLoad(P.guess)}` : ""),
      step(1, 2, "Push it", exploreBody),
      step(2, 3, X.task.title, taskBody, at > 2 ? "done" : ""));
    els.handle.querySelector("span").textContent = P.phase === "predict" ? "1 · Predict" : P.phase === "explore" ? "2 · Push it" : `3 · ${X.task.title}`;
    // a new step scrolls into view; re-rendering the same step leaves the reader where they were
    if (shownPhase !== P.phase + (P.revealed ? "+" : "")) {
      const first = shownPhase === null;
      shownPhase = P.phase + (P.revealed ? "+" : "");
      const to = P.phase === "done" ? b.querySelector(".won") : P.phase === "explore" && P.revealed ? b.querySelector(".cmp") : b.querySelector(".wt-step.now");
      if (to && !first) requestAnimationFrame(() => to.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" }));
    }
  }
  let shownPhase = null;

  function predictBody() {
    const wrap = h("div", { class: "wt-sb" });
    wrap.append(h("p", { class: "q" }, X.predict.q));
    const { min, max } = X.crowd;
    // the pin starts a third of the way along: nowhere near either answer, so nobody locks in a free win
    let g = P.guess ?? Math.round((min + (max - min) * 0.3) / 10) * 10;
    const locked = P.phase !== "predict";
    const pin = h("span", { class: "pin" + (locked ? " locked" : ""), role: "slider", tabindex: locked ? -1 : 0, "aria-label": "Your guess", "aria-valuemin": min, "aria-valuemax": max });
    const lab = h("output", { class: "pin-v" });
    const track = h("div", { class: "line" + (locked ? " locked" : "") }, h("span", { class: "rail" }), pin, lab,
      ...[0, 0.25, 0.5, 0.75, 1].map((f) => h("span", { class: "tick", style: `left:${f * 100}%` }, String(Math.round(min + f * (max - min))))));
    if (locked) {
      const a = X.predict.answer;
      track.append(h("span", { class: "ans", style: `left:${((a - min) / (max - min)) * 100}%`, title: `about ${a}` }));
    }
    const set = (v) => {
      g = Math.max(min, Math.min(max, Math.round(v / X.crowd.step) * X.crowd.step));
      const f = (g - min) / (max - min);
      pin.style.left = lab.style.left = `${f * 100}%`;
      lab.textContent = fmtLoad(g);
      pin.setAttribute("aria-valuenow", g);
      if (!locked) P.guess = g;
    };
    set(g);
    if (!locked) {
      const drag = (e) => { const r = track.getBoundingClientRect(); set(min + ((e.clientX - r.left) / r.width) * (max - min)); };
      track.addEventListener("pointerdown", (e) => { track.setPointerCapture(e.pointerId); drag(e); pin.focus({ preventScroll: true }); track.onpointermove = drag; });
      track.addEventListener("pointerup", () => { track.onpointermove = null; });
      pin.addEventListener("keydown", (e) => {
        const big = (max - min) / 20;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") { set(g + (e.shiftKey ? big : X.crowd.step * 5)); e.preventDefault(); }
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") { set(g - (e.shiftKey ? big : X.crowd.step * 5)); e.preventDefault(); }
        if (e.key === "Enter") lock();
      });
      wrap.append(track, h("button", { class: "wt-go", onclick: lock }, "Lock in my guess"));
    } else wrap.append(track);
    function lock() { P.guess = g; P.phase = "explore"; save(); renderBrief(); drawLoadChart(); }
    return wrap;
  }

  function exploreBody() {
    const wrap = h("div", { class: "wt-sb" });
    const revealed = P.revealed || P.phase === "task" || P.phase === "done";
    wrap.append(h("p", { html: X.explore }));
    if (!revealed) {
      wrap.append(h("p", { class: "wt-soft" }, "When you've found it, or pushed past your guess, the answer opens. ",
        h("a", { href: "#", class: "wt-link", onclick: (e) => { e.preventDefault(); reveal(); } }, "Show me now")));
      return wrap;
    }
    const a = X.predict.answer, d = Math.abs((P.guess ?? a) - a);
    const verdict = d <= X.predict.tol ? "Spot on." : d <= X.predict.tol * 2 ? "Close." : (P.guess < a ? "It held more than you thought." : "It broke sooner than you thought.");
    wrap.append(
      h("div", { class: "cmp" }, h("span", {}, "you said ", h("b", {}, fmtLoad(P.guess ?? a))), h("span", {}, "it bends at ", h("b", {}, `≈ ${fmtLoad(a)}`)), h("strong", {}, verdict)),
      h("p", { html: X.predict.reveal }),
      ...X.why.map((p) => h("p", { html: p })));
    if (P.phase === "explore") wrap.append(h("button", { class: "wt-go", onclick: startTask }, `${X.task.title} →`));
    return wrap;
  }
  function reveal() { P.revealed = true; save(); renderBrief(); drawLoadChart(); }
  function startTask() {
    P.phase = "task"; save();
    resetSim();
    closeInspect();
    renderBrief();
    els.hint.textContent = "The crowd is fixed for the task. Click the server to change it.";
  }

  function taskBody() {
    const wrap = h("div", { class: "wt-sb" });
    wrap.append(h("p", { html: X.task.brief }));
    els.goal = h("ul", { class: "goal" }, X.task.goal.map((g) => h("li", { "data-k": g[0] }, h("i", { class: "lamp" }), h("span", {}, g[3]), h("b", {}))));
    els.meter = h("div", { class: "meter" }, h("span", { class: "fill" }), h("em", {}));
    wrap.append(els.goal, els.meter);
    if (P.phase === "done") {
      wrap.append(h("p", { class: "won", html: `<b>Done.</b> ${X.task.done}` }));
      const nx = LIVE[LIVE.indexOf(X) + 1];
      wrap.append(nx ? h("a", { class: "wt-go", href: `#${X_ALL.indexOf(nx) + 1}` }, `Experiment ${X_ALL.indexOf(nx) + 1}: ${nx.title} →`)
        : h("a", { class: "wt-go", href: "./" }, "Back to all experiments →"));
      wrap.append(h("p", { class: "wt-soft" }, h("a", { href: "#", class: "wt-link", onclick: (e) => { e.preventDefault(); P.phase = "task"; resetSim(); renderBrief(); } }, "Run the task again")));
    }
    return wrap;
  }

  // the task's goal, checked every simulated second over the last 30 s once the server hasn't changed for that long
  function checkGoal() {
    if (!(P.phase === "task" || P.phase === "done") || !els.goal) return;
    const t = sim.t, since = t - lastServerChange, full = since >= WINDOW;
    const st = sim.stats(Math.max(lastServerChange, t - WINDOW), t);
    const rows = X.task.goal.map((g) => {
      const [k, op, v] = g, x = k in st ? st[k] : sim.cfg[k];
      const ok = op === "<" ? x < v : op === "<=" ? x <= v : op === "==" ? x === v : op === ">" ? x > v : x >= v;
      return { k, ok, x };
    });
    for (const r of rows) {
      const li = els.goal.querySelector(`[data-k="${r.k}"]`);
      li.classList.toggle("ok", r.ok);
      li.querySelector("b").textContent = r.k === "p99" ? ms(r.x) : r.k === "errors" ? String(r.x) : String(r.x);
    }
    const all = rows.every((r) => r.ok);
    els.meter.querySelector(".fill").style.width = `${Math.min(1, since / WINDOW) * 100}%`;
    els.meter.classList.toggle("ok", all && full);
    els.meter.querySelector("em").textContent = P.phase === "done" ? "met" : full ? (all ? "met for 30 s" : "measuring the last 30 s") : `steady for ${Math.floor(since)} of 30 s${speed < 10 ? " · ×10 to fast-forward" : ""}`;
    if (full && all && P.phase === "task") win();
  }
  function win() {
    P.phase = "done";
    if (!S.done[X.id]) { S.done[X.id] = 1; S.xp = (S.xp || 0) + 30; }
    save();
    renderBrief();
    updateStepsNav();
    toast(`Experiment ${X_ALL.indexOf(X) + 1} done.`);
  }
  function updateStepsNav() { els.bar.querySelectorAll(".wt-steps a").forEach((a) => { const x = X_ALL[parseInt(a.textContent, 10) - 1]; a.classList.toggle("done", !!S.done[x.id]); }); }
  function toast(msg) {
    const t = h("div", { class: "wt-toast", role: "status" }, msg);
    main.append(t);
    setTimeout(() => t.classList.add("out"), 2600);
    setTimeout(() => t.remove(), 3200);
  }

  // --------------------------------------------------------------- stage --
  let cw = 0, chh = 0, dpr = 1, ctx, layout = null;
  function resize() {
    const r = els.stage.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    cw = r.width; chh = r.height;
    els.canvas.width = Math.round(cw * dpr); els.canvas.height = Math.round(chh * dpr);
    els.canvas.style.width = cw + "px"; els.canvas.style.height = chh + "px";
    ctx = els.canvas.getContext("2d");
    // the parts span x 0..16, y 0..7 and z 0..3 in world units. On screen that's (x−y) from −7 to 16 across
    // and (x+y)/2 − z from −3 to 11.5 down; fit that box in the stage and centre it
    const c30 = Math.cos(Math.PI / 6);
    const u = Math.max(9, Math.min(40, (cw * 0.9) / (23 * c30), (chh * 0.86) / 14.5));
    const ox = cw / 2 - 4.5 * u * c30, oy = chh / 2 - 4.25 * u;
    layout = { u, c30, ox, oy };
    sizeCharts();
  }
  addEventListener("resize", () => { if (main.isConnected && X) resize(); });
  const iso = (x, y, z) => [layout.ox + (x - y) * layout.u * layout.c30, layout.oy + (x + y) * layout.u * 0.5 - z * layout.u];

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.round(((n >> 16) & 255) * f)), g = Math.min(255, Math.round(((n >> 8) & 255) * f)), b = Math.min(255, Math.round((n & 255) * f));
    return `rgb(${r},${g},${b})`;
  }
  function poly(pts, fill, stroke) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  // a box from (x,y,z) of size w×d×hgt: top, the face toward the viewer's left, and the one toward the right
  function cube(x, y, z, w, d, hgt, col, alpha = 1) {
    ctx.globalAlpha = alpha;
    poly([iso(x, y + d, z + hgt), iso(x + w, y + d, z + hgt), iso(x + w, y + d, z), iso(x, y + d, z)], shade(col, 0.78));
    poly([iso(x + w, y, z + hgt), iso(x + w, y + d, z + hgt), iso(x + w, y + d, z), iso(x + w, y, z)], shade(col, 0.6));
    poly([iso(x, y, z + hgt), iso(x + w, y, z + hgt), iso(x + w, y + d, z + hgt), iso(x, y + d, z + hgt)], col);
    ctx.globalAlpha = 1;
  }
  function theme() {
    const dark = document.documentElement.dataset.theme !== "light";
    return dark
      ? { bg: "#0b1418", grid: "rgba(95,224,240,.07)", ground: "#10232a", wire: "#1c3a44", text: "#a9d6de", mute: "#5f8a93", srv: "#1f9fb4", hot: "#ff5a4f", q: "#ffc94a", ok: "#5fe0a0", bad: "#ff5a6e", req: "#ffe08a", pad: "#0e2a31" }
      : { bg: "#f2f6f5", grid: "rgba(16,90,104,.08)", ground: "#e3ecea", wire: "#c9dbd8", text: "#1d4a52", mute: "#6d8f95", srv: "#1f9fb4", hot: "#e8453c", q: "#e0a412", ok: "#1fa36a", bad: "#e23d55", req: "#e8a10f", pad: "#cfe2e0" };
  }
  const PEOPLE = ["#ff6fb5", "#ffc94a", "#86b4ff", "#5fd4b0", "#c7a2ff", "#ff9d7a", "#f0643c", "#9fe870"];

  // the parts' places in the world
  const CROWD = { x: 0, y: 0, n: 8 }, SERVER = { x: 12.2, y: 1.6, w: 3.6, d: 2.8, hgt: 1.6 }, QUEUE = { x: 10, y: 0.4, levels: 12 };
  function crowdShown() {
    const v = loadNow(), { min, max } = X.crowd;
    return Math.round(Math.max(0, Math.min(1, (v - min) / (max - min))) * CROWD.n * CROWD.n);
  }

  let recentUtil = 0;
  function drawStage(dtWall) {
    if (!ctx || !layout) return;
    const T = theme();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, cw, chh);
    // the ground: a soft grid of floor tiles under the whole scene
    ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
    for (let i = -2; i <= 18; i++) { const [a, b] = [iso(i, -2, 0), iso(i, 8, 0)]; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    for (let j = -2; j <= 8; j++) { const [a, b] = [iso(-2, j, 0), iso(18, j, 0)]; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    // the wire from the crowd to the server, with dashes that run toward the server as fast as requests arrive
    const wy = SERVER.y + 1.1;
    poly([iso(CROWD.n + 0.2, wy, 0), iso(SERVER.x, wy, 0), iso(SERVER.x, wy + 0.6, 0), iso(CROWD.n + 0.2, wy + 0.6, 0)], T.wire);
    // crowd: people stand on a grid; in a closed loop the ones waiting for an answer glow
    const shown = crowdShown();
    const waitingFrac = sim.cfg.mode === "closed" && sim.users ? (sim.users - sim.thinking) / sim.users : 0;
    // the crowd's patch of floor, so an empty crowd still shows where to grab
    poly([iso(-0.2, -0.2, 0), iso(CROWD.n * 0.95 + 0.1, -0.2, 0), iso(CROWD.n * 0.95 + 0.1, CROWD.n * 0.85 + 0.1, 0), iso(-0.2, CROWD.n * 0.85 + 0.1, 0)], T.ground);
    const people = [];
    for (let k = 0; k < shown; k++) people.push(k);
    // draw from the back so nearer people cover farther ones
    people.sort((a, b) => ((a % CROWD.n) + ((a / CROWD.n) | 0)) - ((b % CROWD.n) + ((b / CROWD.n) | 0)));
    const t = performance.now() / 1000;
    for (const k of people) {
      const c = k % CROWD.n, r = (k / CROWD.n) | 0;
      const x = CROWD.x + c * 0.95 + 0.2, y = CROWD.y + r * 0.85 + 0.2;
      const bob = reduce ? 0 : Math.max(0, Math.sin(t * 3 + k * 1.7)) * 0.06;
      const waiting = waitingFrac && ((k * 0.618) % 1) < waitingFrac;
      const col = PEOPLE[(k * 5) % PEOPLE.length];
      cube(x, y, bob, 0.5, 0.5, 0.62, waiting ? T.req : col, waiting ? 1 : 0.92);
      cube(x + 0.1, y + 0.1, 0.66 + bob, 0.3, 0.3, 0.3, "#f3d6c0");
    }
    // the queue: waiting requests stacked 3 × 3 a layer, up to 12 layers; amber while short, red once it's long
    const qn = sim.queue.length, shownQ = Math.min(qn, 9 * QUEUE.levels);
    const qcol = qn > 30 ? T.hot : T.q;
    for (let i = 0; i < shownQ; i++) {
      const lvl = (i / 9) | 0, k = i % 9, a = k % 3, b = (k / 3) | 0;
      cube(QUEUE.x + a * 0.5, QUEUE.y + b * 0.5, lvl * 0.3, 0.44, 0.44, 0.26, qcol);
    }
    // the server: a block that warms toward red as it gets busy, with one pad per worker on top
    const u = sim.busy.length / Math.max(1, sim.cfg.workers);
    recentUtil += (u - recentUtil) * Math.min(1, dtWall * 3);
    const srvCol = heat(Math.max(0, (recentUtil - 0.6) / 0.4));
    cube(SERVER.x, SERVER.y, 0, SERVER.w, SERVER.d, SERVER.hgt, srvCol);
    const W = sim.cfg.workers, gc = Math.ceil(Math.sqrt(W * SERVER.w / SERVER.d)), gr = Math.ceil(W / gc);
    const pw = SERVER.w / gc, pd = SERVER.d / gr;
    for (let i = 0; i < W; i++) {
      const c = i % gc, r = (i / gc) | 0;
      const x = SERVER.x + c * pw + pw * 0.14, y = SERVER.y + r * pd + pd * 0.14;
      poly([iso(x, y, SERVER.hgt), iso(x + pw * 0.72, y, SERVER.hgt), iso(x + pw * 0.72, y + pd * 0.72, SERVER.hgt), iso(x, y + pd * 0.72, SERVER.hgt)], T.pad);
      const q = sim.busy[i];
      if (q) {
        const left = q.end > q.began ? Math.max(0, Math.min(1, (q.end - sim.t) / (q.end - q.began))) : 0;
        const s = Math.min(pw, pd) * 0.5;
        cube(x + pw * 0.36 - s / 2, y + pd * 0.36 - s / 2, SERVER.hgt, s, s, 0.25 + 0.55 * left, T.req);
      }
    }
    // flyers: requests on the wire (in), answers going home (ok) or failures falling (bad)
    const sx = CROWD.n + 0.3, ex = QUEUE.x - 0.3;
    flyers = flyers.filter((f) => (f.age += dtWall) < f.life);
    for (const f of flyers) {
      const p = f.age / f.life;
      if (f.kind === "in") cube(sx + (ex - sx) * p, wy + 0.1 + f.lane * 0.25, 0.05, 0.28, 0.28, 0.24, T.req);
      else if (f.kind === "ok") cube(SERVER.x - (SERVER.x - sx) * p, wy - 0.45 - f.lane * 0.2, 0.35 + Math.sin(p * Math.PI) * 0.8, 0.22, 0.22, 0.2, T.ok);
      else cube(SERVER.x - 1 - p * 1.5, wy - 0.4 + f.lane * 0.4, Math.max(0, 1.4 - p * p * 2.2), 0.24, 0.24, 0.22, T.bad, 1 - p * 0.6);
    }
    placeTags(qn);
  }
  // how hot the server is, 0..1: teal, then blue, magenta and red, so no step on the way is a muddy brown
  const HEAT = ["#1f9fb4", "#4f74d8", "#b54cc0", "#ff4f4f"];
  function heat(f) {
    f = Math.max(0, Math.min(1, f)) * (HEAT.length - 1);
    const i = Math.min(HEAT.length - 2, Math.floor(f));
    return mix(HEAT[i], HEAT[i + 1], f - i);
  }
  function mix(a, b, f) {
    f = Math.max(0, Math.min(1, f));
    const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
    const ch = (s) => Math.round(((A >> s) & 255) * (1 - f) + ((B >> s) & 255) * f);
    return "#" + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
  }
  // the HTML labels ride on top of the canvas at their parts' places
  function placeTags(qn) {
    const [cx, cy] = iso(CROWD.x + CROWD.n * 0.48, CROWD.y - 0.4, 1.6);
    const locked = P.phase === "task" || P.phase === "done";
    els.crowd.style.transform = `translate(${cx}px, ${cy}px)`;
    els.crowd.innerHTML = `<b>${fmtLoad(loadNow())}</b><small>${locked ? "fixed for the task" : "drag ↕"}</small>`;
    els.crowd.classList.toggle("locked", locked);
    const [qx, qy] = iso(QUEUE.x + 0.75, QUEUE.y + 0.75, Math.min(QUEUE.levels, Math.ceil(qn / 9)) * 0.3 + 0.7);
    els.queueTag.style.transform = `translate(${qx}px, ${qy}px)`;
    els.queueTag.innerHTML = qn ? `queue <b>${qn}</b>` : "";
    const [sx, sy] = iso(SERVER.x + SERVER.w * 0.6, SERVER.y - 0.4, SERVER.hgt + 1.4);
    els.serverTag.style.transform = `translate(${sx}px, ${sy}px)`;
    els.serverTag.innerHTML = `server <b>${sim.busy.length}/${sim.cfg.workers}</b> busy`;
  }

  // drag the crowd: up for more load, down for less; arrow keys and the wheel do the same
  function wireStage() {
    let drag = null;
    const crowdHit = (e) => {
      const r = els.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const [ax] = iso(CROWD.x, CROWD.n * 0.85 + 0.6, 0), [bx] = iso(CROWD.n, 0, 0);
      const [, ty] = iso(0, 0, 2.2), [, by] = iso(CROWD.n, CROWD.n, 0);
      return x > ax - 10 && x < bx + 10 && y > ty - 30 && y < by + 10;
    };
    const serverHit = (e) => {
      const r = els.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const [ax] = iso(SERVER.x, SERVER.y + SERVER.d, 0), [bx] = iso(SERVER.x + SERVER.w, SERVER.y, 0);
      const [, ty] = iso(SERVER.x, SERVER.y, SERVER.hgt + 0.6), [, by] = iso(SERVER.x + SERVER.w, SERVER.y + SERVER.d, 0);
      return x > ax && x < bx && y > ty && y < by;
    };
    const startDrag = (e) => {
      if (P.phase === "task" || P.phase === "done") { els.hint.textContent = "The crowd is fixed for the task. Click the server to change it."; return; }
      drag = { y: e.clientY, v: loadNow() };
      els.stage.setPointerCapture?.(e.pointerId);
      els.stage.classList.add("dragging");
      e.preventDefault();
    };
    els.stage.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".wt-insp, .wt-server")) return;
      if (e.target === els.crowd || crowdHit(e)) startDrag(e);
      else if (serverHit(e)) toggleInspect();
      else closeInspect();
    });
    els.stage.addEventListener("pointermove", (e) => {
      if (drag) {
        const span = X.crowd.max - X.crowd.min;
        setLoad(drag.v + ((drag.y - e.clientY) / Math.max(160, chh * 0.6)) * span);
      } else els.canvas.style.cursor = crowdHit(e) ? (P.phase === "task" || P.phase === "done" ? "not-allowed" : "ns-resize") : serverHit(e) ? "pointer" : "";
    });
    const end = () => { if (drag) { drag = null; els.stage.classList.remove("dragging"); } };
    els.stage.addEventListener("pointerup", end);
    els.stage.addEventListener("pointercancel", end);
    els.crowd.addEventListener("keydown", (e) => {
      if (P.phase === "task" || P.phase === "done") return;
      const s = X.crowd.step * (e.shiftKey ? 10 : 2);
      if (e.key === "ArrowUp" || e.key === "ArrowRight") { setLoad(loadNow() + s); e.preventDefault(); }
      if (e.key === "ArrowDown" || e.key === "ArrowLeft") { setLoad(loadNow() - s); e.preventDefault(); }
    });
    els.stage.addEventListener("wheel", (e) => {
      if (!crowdHit(e) || P.phase === "task" || P.phase === "done") return;
      e.preventDefault();
      setLoad(loadNow() - Math.sign(e.deltaY) * X.crowd.step * 2);
    }, { passive: false });
    els.hint.textContent = P.phase === "task" || P.phase === "done" ? "The crowd is fixed for the task. Click the server to change it." : "Drag the crowd up or down to change the load. Click the server to look inside.";
  }
  function setLoad(v) {
    const { min, max, step } = X.crowd;
    v = Math.max(min, Math.min(max, Math.round(v / step) * step));
    if (v === loadNow()) return;
    sim.set({ [knob()]: v });
    lastLoadChange = sim.t;
    els.hint.textContent = "";
  }

  // the inspector: the server's knobs and live numbers
  function toggleInspect() { els.inspect.hidden ? openInspect() : closeInspect(); }
  function closeInspect() { els.inspect.hidden = true; els.serverTag.classList.remove("on"); }
  function openInspect() {
    els.inspect.hidden = false;
    els.serverTag.classList.add("on");
    renderInspect();
  }
  function renderInspect() {
    if (els.inspect.hidden) return;
    const c = sim.cfg, canWorkers = P.phase !== "explore" && P.phase !== "predict" ? X.task.knobs.includes("workers") && P.phase === "task" : true;
    const cap = c.workers / c.service;
    const st = sim.stats(Math.max(0, sim.t - 5), sim.t);
    if (!els.inspect.firstChild) {
      els.inspect.append(
        h("p", { class: "ih" }, "Server"),
        h("div", { class: "row" }, h("span", {}, "workers"),
          els.minus = h("button", { class: "step", "aria-label": "One worker fewer", onclick: () => setWorkers(sim.cfg.workers - 1) }, "−"),
          els.wn = h("output", { class: "wn" }),
          els.plus = h("button", { class: "step", "aria-label": "One worker more", onclick: () => setWorkers(sim.cfg.workers + 1) }, "+")),
        els.inums = h("dl", {}));
    }
    els.wn.textContent = c.workers;
    els.minus.disabled = !canWorkers || c.workers <= 1;
    els.plus.disabled = !canWorkers || c.workers >= 16;
    els.inums.innerHTML = `<dt>each request</dt><dd>≈ ${ms(c.service)}</dd><dt>capacity</dt><dd>${Math.round(cap)} req/s</dd>
      <dt>busy</dt><dd>${sim.busy.length} of ${c.workers}</dd><dt>queue</dt><dd>${sim.queue.length}</dd><dt>busy, last 5 s</dt><dd>${Math.round(st.util * 100)}%</dd>`;
  }
  function setWorkers(n) {
    n = Math.max(1, Math.min(16, n));
    if (n === sim.cfg.workers) return;
    sim.set({ workers: n });
    lastServerChange = sim.t;
    renderInspect();
  }

  // -------------------------------------------------------------- charts --
  const charts = {};
  function buildCharts() {
    const c = els.charts;
    c.innerHTML = "";
    const box = (id, title, wide) => {
      const cv = h("canvas", { "aria-hidden": "true" });
      const val = h("b", {});
      const el = h("figure", { class: "ch" + (wide ? " wide" : "") }, h("figcaption", {}, h("span", {}, title), val), cv);
      charts[id] = { el, cv, val };
      c.append(el);
    };
    box("load", `p99 wait against ${X.crowd.unit}`, true);
    box("tput", "served per second");
    box("lat", "wait: p50 and p99");
    box("err", "errors per second");
    box("util", "workers busy");
  }
  function sizeCharts() {
    for (const k in charts) {
      const { cv } = charts[k], r = cv.getBoundingClientRect();
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      charts[k].w = r.width; charts[k].h = r.height;
    }
    drawCharts();
  }
  function chartCtx(k) {
    const c = charts[k];
    const x = c.cv.getContext("2d");
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, c.w, c.h);
    return [x, c.w, c.h];
  }
  function css(v) { return getComputedStyle(main).getPropertyValue(v).trim(); }
  function drawLoadChart() {
    const k = "load";
    if (!charts[k] || !charts[k].w) return;
    const [x, W, H] = chartCtx(k);
    const pad = { l: 34, r: 10, t: 8, b: 18 };
    const { min, max } = X.crowd, YMAX = 2;
    const px = (v) => pad.l + ((v - min) / (max - min)) * (W - pad.l - pad.r);
    const py = (s) => H - pad.b - (Math.min(s, YMAX) / YMAX) * (H - pad.t - pad.b);
    const ink = css("--wt-mute"), line = css("--wt-line"), acc = css("--wt-acc"), pink = css("--wt-pink");
    x.font = "10px " + css("--f-mono"); x.fillStyle = ink; x.strokeStyle = line; x.lineWidth = 1;
    for (const s of [0, 0.5, 1, 1.5, 2]) { x.beginPath(); x.moveTo(pad.l, py(s)); x.lineTo(W - pad.r, py(s)); x.stroke(); x.textAlign = "right"; x.fillText(s ? `${s} s` : "0", pad.l - 5, py(s) + 3); }
    x.textAlign = "center";
    for (let i = 0; i <= 4; i++) { const v = min + (i / 4) * (max - min); x.fillText(String(Math.round(v)), px(v), H - 4); }
    // the guess and, once revealed, the bend
    const showAns = P.revealed || P.phase === "task" || P.phase === "done";
    if (P.guess != null) {
      x.strokeStyle = pink; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(px(P.guess), pad.t); x.lineTo(px(P.guess), H - pad.b); x.stroke(); x.setLineDash([]);
      x.fillStyle = pink; x.textAlign = "left"; x.fillText("your guess", px(P.guess) + 4, pad.t + 9);
    }
    if (showAns) {
      x.strokeStyle = acc; x.beginPath(); x.moveTo(px(X.predict.answer), pad.t); x.lineTo(px(X.predict.answer), H - pad.b); x.stroke();
      x.fillStyle = acc; x.textAlign = "right"; x.fillText(`bends ≈ ${X.predict.answer}`, px(X.predict.answer) - 4, pad.t + 20);
    }
    // a dot per steady second: older ones fade
    dots.forEach((d, i) => {
      const a = 0.25 + 0.75 * (i / Math.max(1, dots.length - 1));
      x.globalAlpha = a;
      x.fillStyle = d.p99 > YMAX ? css("--wt-bad") : acc;
      const yy = py(d.p99);
      if (d.p99 > YMAX) { x.beginPath(); x.moveTo(px(d.load) - 3, yy + 5); x.lineTo(px(d.load) + 3, yy + 5); x.lineTo(px(d.load), yy); x.fill(); }
      else { x.beginPath(); x.arc(px(d.load), yy, 2.6, 0, Math.PI * 2); x.fill(); }
    });
    x.globalAlpha = 1;
    const last = dots[dots.length - 1];
    charts[k].val.textContent = last ? `${ms(last.p99)} at ${Math.round(last.load)}` : "";
  }
  function series(k, lines, ymax, fmt, unitMax) {
    if (!charts[k] || !charts[k].w) return;
    const [x, W, H] = chartCtx(k);
    const pad = { l: 4, r: 4, t: 6, b: 4 }, span = 60;
    const t1 = sim.t, t0 = t1 - span;
    const px = (t) => pad.l + ((t - t0) / span) * (W - pad.l - pad.r);
    const top = Math.max(ymax, ...samples.flatMap((s) => lines.map((l) => Math.min(unitMax || Infinity, s[l.key] || 0)))) * 1.1 || 1;
    const py = (v) => H - pad.b - (Math.min(v, top) / top) * (H - pad.t - pad.b);
    x.strokeStyle = css("--wt-line"); x.lineWidth = 1;
    x.beginPath(); x.moveTo(pad.l, H - pad.b); x.lineTo(W - pad.r, H - pad.b); x.stroke();
    for (const l of lines) {
      x.strokeStyle = l.color; x.lineWidth = l.w || 1.6; x.setLineDash(l.dash || []);
      x.beginPath();
      let first = true;
      for (const s of samples) { if (s.t < t0) continue; const X1 = px(s.t), Y1 = py(s[l.key]); first ? x.moveTo(X1, Y1) : x.lineTo(X1, Y1); first = false; }
      x.stroke();
    }
    x.setLineDash([]);
    const s = samples[samples.length - 1];
    charts[k].val.textContent = s ? fmt(s) : "";
  }
  function drawCharts() {
    drawLoadChart();
    const acc = css("--wt-acc"), pink = css("--wt-pink"), bad = css("--wt-bad"), mute = css("--wt-mute");
    const open = sim.cfg.mode === "open";
    series("tput", [...(open ? [{ key: "offered", color: mute, dash: [3, 3], w: 1 }] : []), { key: "tput", color: acc }], 10, (s) => `${Math.round(s.tput)}/s${open ? ` of ${Math.round(s.offered)}` : ""}`);
    series("lat", [{ key: "p50", color: acc }, { key: "p99", color: pink }], 0.3, (s) => `${ms(s.p50)} · ${ms(s.p99)}`, 12);
    series("err", [{ key: "err", color: bad }], 1, (s) => `${s.err.toFixed(s.err < 10 ? 1 : 0)}/s`);
    series("util", [{ key: "util", color: acc }], 1, (s) => `${Math.round(s.util * 100)}%`, 1);
  }

  // ---------------------------------------------------------------- loop --
  let lastWall = performance.now(), lastSample = 0, chartT = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - lastWall) / 1000);
    lastWall = now;
    if (X && sim) {
      if (!paused && !document.hidden) {
        sim.advance(sim.t + dt * speed);
        // spawn a few flyers per frame from the feed; at high rates most requests aren't drawn, only sampled
        const feed = sim.feed.splice(0);
        const budget = speed > 1 ? 3 : 6;
        const step = Math.max(1, Math.ceil(feed.length / budget));
        for (let i = 0; i < feed.length && flyers.length < 120; i += step) {
          const [kind, ok] = feed[i];
          const life = speed < 1 ? 1.4 : 0.45;
          flyers.push({ kind: kind === "in" ? "in" : ok ? "ok" : "bad", age: 0, life: kind === "out" && !ok ? 0.9 : life, lane: Math.random() });
        }
        while (sim.t - lastSample >= 1) { lastSample += 1; sample(lastSample); }
        if (sim.t < lastSample) lastSample = Math.floor(sim.t);
      }
      drawStage(dt);
      els.clock.textContent = clock(sim.t);
      if ((chartT += dt) > 0.12) { chartT = 0; drawCharts(); renderInspect(); }
    }
    requestAnimationFrame(frame);
  }
  const clock = (t) => `t ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  function sample(t) {
    const st = sim.stats(Math.max(0, t - 5), t);
    const s = { t, load: loadNow(), offered: sim.cfg.mode === "open" ? sim.cfg.rate : st.sent / Math.min(5, t || 1), tput: st.tput, p50: st.p50, p99: st.p99, err: st.errors / Math.min(5, t || 1), util: st.util };
    samples.push(s);
    if (samples.length > 400) samples.shift();
    // a dot only once the load has been steady for the whole 5 s window, so a drag doesn't smear the curve
    if (t - lastLoadChange >= 6 && st.ok > 3) {
      dots.push({ load: s.load, p99: s.p99 });
      if (dots.length > 240) dots.shift();
      if (P.phase === "explore" && !P.revealed && P.guess != null && s.load >= Math.min(P.guess, X.predict.answer) * 1.02 && s.load >= X.predict.answer && s.p99 > 1) reveal();
    }
    checkGoal();
  }

  addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, [contenteditable], [role=slider]")) return;
    if (e.key === " " && !e.target.closest("button, a")) { togglePause(); e.preventDefault(); }
    if (e.key === "Escape") closeInspect();
  });
  addEventListener("vnl-theme", () => drawCharts());
  route();
  requestAnimationFrame(frame);

  // for tools/e2e.js: set a knob directly and run the sim forward fast
  main.wtSet = (patch) => { sim.set(patch); if (patch.workers !== undefined) lastServerChange = sim.t; if (patch[knob()] !== undefined) lastLoadChange = sim.t; };
  main.wtRun = (secs) => { const end = sim.t + secs; while (sim.t < end) { sim.advance(Math.min(end, sim.t + 1)); sim.feed.length = 0; if (sim.t - lastSample >= 1) { lastSample += 1; sample(lastSample); } } drawCharts(); };
  main.wtState = () => ({ phase: P.phase, guess: P.guess, t: sim.t, cfg: sim.cfg, done: !!S.done[X.id] });
})();
