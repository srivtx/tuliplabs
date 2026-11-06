/* Wind Tunnel: one experiment at a time, on a live system you can push.
   The stage is an isometric voxel scene of parts: a crowd on the left sends requests down a wire, maybe through a
   cache (hits bounce straight back) and a load balancer (it fans requests out), to one or more servers. Requests that
   find every worker busy stack up as a queue tower in front of their server. A server warms from teal to red as it
   fills, and when it's drowning it shakes, smokes, throws sparks and flashes a beacon. Answers fly back green,
   failures red.
   Gestures: drag the crowd up or down to change the load. Click any part to look inside and turn its knobs. Drag a
   ghost part from the parts tray onto the wire to add it. Click the balancer's policy word to change it.
   Top left, system.yaml: the design as code, with what you changed since this step began marked as a diff.
   Underneath, charts: a dot per steady second (load against p99, or cache size against hit rate), and four timelines.
   On the left, the experiment: predict (drag a pin), explore (find the bend), why (the law), then a task with a
   goal measured live over 30 s. Progress lives in vnl-code-v1 (done.wt01…, wt: guesses and phase). */
(() => {
  "use strict";
  const { Sim } = window.WTSim;
  const X_ALL = window.WT.experiments;
  const LIVE = X_ALL.filter((x) => x.live);
  const $ = (s, r = document) => r.querySelector(s);
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
  const num = (n) => Math.round(n).toLocaleString("en-US");

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
  let X, idx, sim, P, speed = 1, paused = false, samples = [], dots = [], lastLoadChange = 0, lastSysChange = 0, flyers = [], sparks = [], before = null;
  const SPEEDS = [[0.1, "slow-mo"], [1, "×1"], [10, "×10"]];
  const WINDOW = 30, MAX_SERVERS = 6;
  const CACHE_SIZES = [10, 25, 50, 100, 250, 500, 1000, 1500, 2000, 3000, 5000, 10000];
  const LB = { rr: ["round robin", "hands each request to the next server in turn"], least: ["least connections", "sends each request to the server with the fewest in flight"], random: ["random", "picks a server at random"] };
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
    speed = 1; paused = false; selected = null;
    resetSim();
    build();
    document.title = `${X.title} · Wind Tunnel · Tulip Labs`;
    main.removeAttribute("aria-busy");
  }
  const inTask = () => P.phase === "task" || P.phase === "done";
  const startCfg = () => ({ ...X.system, ...(inTask() ? { ...X.task.set, ...X.task.start } : {}) });
  function resetSim(patch) {
    const cfg = { ...startCfg(), ...(patch || {}) };
    sim = new Sim(cfg, 1 + idx);
    sim.feed = [];
    before = startCfg();
    samples = []; dots = []; flyers = []; sparks = []; lastLoadChange = 0; lastSysChange = 0; lastSample = 0;
    heatOf = []; boomOf = [];
    snapView = true;
  }
  // restart the run with the knobs as they are now: a way out when a backlog won't drain
  function restart() {
    const keep = {};
    for (const k of ["rate", "users", "workers", "servers", "lb", "cache"]) keep[k] = sim.cfg[k];
    const b = before;
    resetSim(keep);
    before = b;
    renderCode();
    toast("Restarted with the same design.");
  }
  const knob = () => X.crowd.knob;
  const loadNow = () => sim.cfg[knob()];
  const fmtLoad = (v) => `${num(v)} ${X.crowd.short}`;
  const ms = (s) => (s >= 10 ? `${s.toFixed(0)} s` : s >= 1 ? `${s.toFixed(1)} s` : `${Math.round(s * 1000)} ms`);
  const name = (k) => (X.names && X.names[k]) || k;
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  // which knobs the learner may turn right now
  function canTurn(k) {
    if (P.phase === "done") return false;
    if (P.phase === "task") return X.task.knobs.includes(k);
    return (X.free || ["workers"]).includes(k);
  }

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
      h("button", { class: "wt-word", onclick: restart, title: "Start the run again with the same design" }, "↻ restart"),
      els.pause = h("button", { class: "wt-word", onclick: togglePause, title: "Pause or play (space)" }),
      els.speed = h("button", { class: "wt-word", onclick: cycleSpeed, title: "Speed: slow motion, real time, ten times" }));
    els.brief = h("aside", { class: "wt-brief", "aria-label": "The experiment" });
    els.canvas = h("canvas", { class: "wt-cv", "aria-label": "The system: a crowd sending requests through its parts" });
    els.crowd = h("button", { class: "wt-crowd", "aria-label": "Load. Drag up or down, or use the arrow keys" });
    els.tags = h("div", { class: "wt-tags" });
    els.inspect = h("div", { class: "wt-insp", hidden: true });
    els.hint = h("p", { class: "wt-hint" });
    els.code = h("div", { class: "wt-code" });
    els.parts = h("div", { class: "wt-parts", "aria-label": "Parts you can add" });
    els.stage = h("section", { class: "wt-stage" }, els.canvas, els.tags, els.crowd, els.code, els.parts, els.inspect, els.hint);
    els.charts = h("section", { class: "wt-charts", "aria-label": "Live numbers" });
    els.handle = h("button", { class: "wt-handle", onclick: () => main.classList.toggle("sheet-open"), "aria-label": "Show or hide the experiment" }, h("i"), h("span"));
    main.append(els.bar, h("div", { class: "wt-body" }, els.brief, h("div", { class: "wt-right" }, els.stage, els.charts)), els.handle);
    tagEls = new Map();
    codeOpen = matchMedia("(max-width: 860px)").matches ? false : codeOpen;
    buildCharts();
    renderBrief();
    wireStage();
    renderParts();
    renderCode();
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
      step(0, 1, "Predict", predictBody, P.guess != null && at > 0 ? `you said ${fmtAxis(P.guess)}` : ""),
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

  // the guess's axis: the crowd's knob, or the experiment's own (a cache size, on a log scale)
  const axis = () => X.predict.axis || { knob: X.crowd.knob, min: X.crowd.min, max: X.crowd.max, step: X.crowd.step, short: X.crowd.short };
  const fmtAxis = (v) => `${num(v)} ${axis().short}`;
  const toF = (a, v) => (a.log ? Math.log(v / a.min) / Math.log(a.max / a.min) : (v - a.min) / (a.max - a.min));
  const fromF = (a, f) => (a.log ? a.min * Math.pow(a.max / a.min, f) : a.min + f * (a.max - a.min));
  function snap(a, v) {
    v = Math.max(a.min, Math.min(a.max, v));
    if (a.log) { const m = Math.pow(10, Math.floor(Math.log10(v)) - 1); return Math.round(v / m) * m; }
    return Math.round(v / a.step) * a.step;
  }
  function predictBody() {
    const wrap = h("div", { class: "wt-sb" });
    wrap.append(h("p", { class: "q" }, X.predict.q));
    const a = axis();
    // the pin starts a third of the way along: nowhere near either answer, so nobody locks in a free win
    let g = P.guess ?? snap(a, a.log ? fromF(a, 0.3) : Math.round(fromF(a, 0.3) / 10) * 10);
    const locked = P.phase !== "predict";
    const pin = h("span", { class: "pin" + (locked ? " locked" : ""), role: "slider", tabindex: locked ? -1 : 0, "aria-label": "Your guess", "aria-valuemin": a.min, "aria-valuemax": a.max });
    const lab = h("output", { class: "pin-v" });
    const ticks = a.log ? [1, 2, 3].map((e) => Math.pow(10, e)).concat([a.max]).filter((v, i, L) => L.indexOf(v) === i && v >= a.min && v <= a.max) : [0, 0.25, 0.5, 0.75, 1].map((f) => fromF(a, f));
    const track = h("div", { class: "line" + (locked ? " locked" : "") }, h("span", { class: "rail" }), pin, lab,
      ...ticks.map((v) => h("span", { class: "tick", style: `left:${toF(a, v) * 100}%` }, num(v))));
    if (locked) track.append(h("span", { class: "ans", style: `left:${toF(a, X.predict.answer) * 100}%`, title: `about ${X.predict.answer}` }));
    const set = (v) => {
      g = snap(a, v);
      const f = toF(a, g);
      pin.style.left = lab.style.left = `${f * 100}%`;
      lab.textContent = fmtAxis(g);
      pin.setAttribute("aria-valuenow", g);
      if (!locked) P.guess = g;
    };
    set(g);
    if (!locked) {
      const drag = (e) => { const r = track.getBoundingClientRect(); set(fromF(a, Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)))); };
      track.addEventListener("pointerdown", (e) => { track.setPointerCapture(e.pointerId); drag(e); pin.focus({ preventScroll: true }); track.onpointermove = drag; });
      track.addEventListener("pointerup", () => { track.onpointermove = null; });
      pin.addEventListener("keydown", (e) => {
        const up = e.key === "ArrowRight" || e.key === "ArrowUp", down = e.key === "ArrowLeft" || e.key === "ArrowDown";
        if (up || down) {
          const f = toF(a, g) + (up ? 1 : -1) * (e.shiftKey ? 0.05 : 0.02);
          let v = fromF(a, Math.max(0, Math.min(1, f)));
          if (snap(a, v) === g) v = g + (up ? 1 : -1) * (a.step || 1) * 5;
          set(v); e.preventDefault();
        }
        if (e.key === "Enter") lock();
      });
      wrap.append(track, h("button", { class: "wt-go", onclick: lock }, "Lock in my guess"));
    } else wrap.append(track);
    function lock() { P.guess = g; P.phase = "explore"; save(); renderBrief(); renderParts(); drawLoadChart(); }
    return wrap;
  }

  function exploreBody() {
    const wrap = h("div", { class: "wt-sb" });
    const revealed = P.revealed || inTask();
    wrap.append(h("p", { html: X.explore }));
    if (!revealed) {
      wrap.append(h("p", { class: "wt-soft" }, "When you've found it, or pushed past your guess, the answer opens. ",
        h("a", { href: "#", class: "wt-link", onclick: (e) => { e.preventDefault(); reveal(); } }, "Show me now")));
      return wrap;
    }
    const A = X.predict.answer, g = P.guess ?? A;
    let verdict;
    if (X.predict.tolRatio) {
      const r = Math.max(g / A, A / g), t = X.predict.tolRatio;
      verdict = r <= t ? "Spot on." : r <= t * t ? "Close." : g < A ? "It needs more than you thought." : "Less does it than you thought.";
    } else {
      const d = Math.abs(g - A);
      verdict = d <= X.predict.tol ? "Spot on." : d <= X.predict.tol * 2 ? "Close." : (g < A ? "It held more than you thought." : "It broke sooner than you thought.");
    }
    wrap.append(
      h("div", { class: "cmp" }, h("span", {}, "you said ", h("b", {}, fmtAxis(g))), h("span", {}, X.predict.axis ? "it needs " : "it bends at ", h("b", {}, `≈ ${fmtAxis(A)}`)), h("strong", {}, verdict)),
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
    renderBrief(); renderParts(); renderCode();
    els.hint.textContent = taskHint();
  }
  const taskHint = () => `The crowd is fixed for the task. ${X.task.knobs.includes("servers") ? "Drag a server on, or click a part to change it." : `Click the ${X.task.knobs.includes("cache") ? "cache" : name("server")} to change it.`}`;

  function taskBody() {
    const wrap = h("div", { class: "wt-sb" });
    wrap.append(h("p", { html: X.task.brief }));
    els.goal = h("ul", { class: "goal" }, X.task.goal.map((g) => h("li", { "data-k": g[0] }, h("i", { class: "lamp" }), h("span", {}, g[3]), h("b", {}))));
    els.meter = h("div", { class: "wt-meter" }, h("span", { class: "fill" }), h("em", {}));
    wrap.append(els.goal, els.meter);
    if (P.phase === "done") {
      wrap.append(h("div", { class: "won" }, h("p", { html: `<b>Done.</b> ${X.task.done}` }),
        h("p", { class: "won-h" }, "What changed in system.yaml"), diffView(yaml(startCfg()), yaml(P.final || sim.cfg), true)));
      const nx = LIVE[LIVE.indexOf(X) + 1];
      wrap.append(nx ? h("a", { class: "wt-go", href: `#${X_ALL.indexOf(nx) + 1}` }, `Experiment ${X_ALL.indexOf(nx) + 1}: ${nx.title} →`)
        : h("a", { class: "wt-go", href: "./" }, "Back to all experiments →"));
      wrap.append(h("p", { class: "wt-soft" }, h("a", { href: "#", class: "wt-link", onclick: (e) => { e.preventDefault(); P.phase = "task"; resetSim(); renderBrief(); renderParts(); renderCode(); } }, "Run the task again")));
    }
    requestAnimationFrame(() => checkGoal(true));
    return wrap;
  }

  // the task's goal, checked every simulated second over the last 30 s once the design hasn't changed for that long
  function checkGoal(quiet) {
    if (!inTask() || !els.goal || !sim) return;
    const t = sim.t, since = t - lastSysChange, full = since >= WINDOW;
    const st = sim.stats(Math.max(lastSysChange, t - WINDOW), t);
    const rows = X.task.goal.map((g) => {
      const [k, op, v] = g, x = k in st ? st[k] : sim.cfg[k];
      const ok = op === "<" ? x < v : op === "<=" ? x <= v : op === "==" ? x === v : op === ">" ? x > v : x >= v;
      return { k, ok, x };
    });
    for (const r of rows) {
      const li = els.goal.querySelector(`[data-k="${r.k}"]`);
      li.classList.toggle("ok", r.ok);
      li.querySelector("b").textContent = r.k === "p99" ? ms(r.x) : r.k === "cache" ? `${num(r.x)} keys` : num(r.x);
    }
    const all = rows.every((r) => r.ok);
    els.meter.querySelector(".fill").style.width = `${Math.min(1, since / WINDOW) * 100}%`;
    els.meter.classList.toggle("ok", all && full);
    els.meter.querySelector("em").textContent = P.phase === "done" ? "met" : full ? (all ? "met for 30 s" : "measuring the last 30 s") : `steady for ${Math.floor(since)} of 30 s${speed < 10 ? " · ×10 to fast-forward" : ""}`;
    if (full && all && P.phase === "task" && !quiet) win();
  }
  function win() {
    P.phase = "done";
    P.final = { ...sim.cfg };
    if (!S.done[X.id]) { S.done[X.id] = 1; S.xp = (S.xp || 0) + 30; }
    save();
    renderBrief(); renderParts();
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

  // --------------------------------------------------------- system.yaml --
  // The design as a small config file. Lines changed since this step began show as a diff, so you can see what you
  // did to the system, the way a pull request would show it.
  let codeOpen = true;
  function yaml(c) {
    c = { ...window.WTSim.DEFAULTS, ...c };
    const L = [];
    const kv = (k, v, note) => L.push([1, k, v, note]);
    L.push([0, "traffic"]);
    if (c.mode === "open") kv("arrivals", `${num(c.rate)}/s`, "random");
    else { kv("users", num(c.users)); kv("think_time", `${c.think}s`); }
    if (c.cache > 0) {
      L.push([0, "cache"]);
      kv("holds", `${num(c.cache)} keys`, "LRU");
      kv("hit_time", `${Math.round(c.cacheTime * 1000)}ms`);
    }
    if (c.servers > 1) {
      L.push([0, "load_balancer"]);
      kv("policy", { rr: "round_robin", least: "least_connections", random: "random" }[c.lb]);
    }
    L.push([0, name("server") === "server" ? (c.servers > 1 || (X.parts || []).includes("server") ? "servers" : "server") : name("server")]);
    if (c.servers > 1 || (X.parts || []).includes("server")) kv("count", String(c.servers));
    kv("workers", String(c.workers), c.servers > 1 ? "each" : "");
    kv("per_request", `${Math.round(c.service * 1000)}ms`, "average");
    if (c.slow > 1) kv("server_1", `${c.slow}x slower`, "old box");
    if (c.keys && (X.parts || []).includes("cache")) kv("keys", num(c.keys), "Zipf");
    L.push([0, "clients"]);
    kv("timeout", `${c.timeout}s`);
    return L.map(([ind, k, v, note]) => (ind ? `  ${k}: ${v}${note ? `  # ${note}` : ""}` : `${k}:`));
  }
  // a line diff by longest common subsequence: [" ", line] kept, ["-", line] removed, ["+", line] added
  function diff(a, b) {
    const n = a.length, m = b.length, T = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
    const same = (x, y) => x.replace(/\s+#.*$/, "") === y.replace(/\s+#.*$/, "");
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i][j] = same(a[i], b[j]) ? T[i + 1][j + 1] + 1 : Math.max(T[i + 1][j], T[i][j + 1]);
    const out = [];
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && same(a[i], b[j])) { out.push([" ", b[j]]); i++; j++; }
      // removals before additions, the way a diff reads: old line, then its replacement
      else if (i < n && (j >= m || T[i + 1][j] >= T[i][j + 1])) out.push(["-", a[i++]]);
      else out.push(["+", b[j++]]);
    }
    return out;
  }
  function hl(line) {
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
    const m = line.match(/^(\s*)([\w]+):(?: (.*?))?(\s+#.*)?$/);
    if (!m) return esc(line);
    return `${m[1]}<i class="y-k">${m[2]}</i>:${m[3] !== undefined ? ` <i class="y-v">${esc(m[3])}</i>` : ""}${m[4] ? `<i class="y-c">${esc(m[4])}</i>` : ""}`;
  }
  function diffView(a, b, onlyChanges) {
    const D = diff(a, b);
    const pre = h("pre", { class: "y-diff" });
    // with onlyChanges, keep the changed lines and the header of each section that has one; fold the rest
    const keep = new Set();
    let head = -1;
    D.forEach(([op, line], i) => { if (!/^\s/.test(line)) head = i; if (op !== " ") { keep.add(i); if (head >= 0) keep.add(head); } });
    let html = "";
    D.forEach(([op, line], i) => {
      if (onlyChanges && !keep.has(i)) return;
      html +=`<span class="y-l ${op === "+" ? "add" : op === "-" ? "del" : ""}"><b>${op === " " ? "" : op}</b>${hl(line)}</span>`;
    });
    pre.innerHTML = html || `<span class="y-l"><b></b><i class="y-c"># nothing changed</i></span>`;
    return pre;
  }
  let codeKey = "";
  function renderCode() {
    const a = yaml(before), b = yaml(sim.cfg);
    const key = codeOpen + "|" + a.join() + "|" + b.join();
    if (key === codeKey) return;
    codeKey = key;
    const D = diff(a, b), changes = D.filter((d) => d[0] === "+").length;
    els.code.innerHTML = "";
    els.code.classList.toggle("open", codeOpen);
    els.code.append(h("button", { class: "y-head", "aria-expanded": String(codeOpen), onclick: () => { codeOpen = !codeOpen; codeKey = ""; renderCode(); resize(); } },
      h("i", { class: "y-ic", "aria-hidden": "true" }), h("b", {}, "system.yaml"),
      h("span", { class: "y-n" + (changes ? " on" : "") }, changes ? `${changes} change${changes > 1 ? "s" : ""}` : "as it began"), h("em", {}, codeOpen ? "−" : "+")));
    if (codeOpen) els.code.append(diffView(a, b, false));
  }

  // --------------------------------------------------------------- stage --
  let cw = 0, chh = 0, dpr = 1, ctx, V = { u: 20, ox: 0, oy: 0 }, VT = null, snapView = true;
  const c30 = Math.cos(Math.PI / 6);
  function resize() {
    const r = els.stage.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    cw = r.width; chh = r.height;
    els.canvas.width = Math.round(cw * dpr); els.canvas.height = Math.round(chh * dpr);
    els.canvas.style.width = cw + "px"; els.canvas.style.height = chh + "px";
    ctx = els.canvas.getContext("2d");
    snapView = true;
    sizeCharts();
  }
  addEventListener("resize", () => { if (main.isConnected && X) resize(); });
  const iso = (x, y, z) => [V.ox + (x - y) * V.u * c30, V.oy + (x + y) * V.u * 0.5 - z * V.u];

  // Where every part stands, from the system as it is (or would be, with `over` applied, for a ghost's slot).
  // World units: x runs right-down, y left-down, z up. The crowd stands on 0..8 × 0..7; the wire runs along y ≈ 3.
  function layout(over) {
    const c = { ...sim.cfg, ...(over || {}) };
    const n = over && over.servers ? over.servers : sim.srv.length;
    const L = { crowd: { x: 0, y: 0, w: 7.8, d: 6.9, h: 1 }, wy: 2.7, servers: [], queues: [] };
    let x = 8.4;
    if (c.cache > 0) { L.cache = { x: x + 0.3, y: L.wy - 0.5, w: 1.6, d: 1.6, h: 1.25 }; x += 2.6; }
    if (n === 1) {
      L.queues.push({ x: x + 1.4, y: 0.4, cols: 3, levels: 12 });
      L.servers.push({ x: x + 3.8, y: 1.6, w: 3.6, d: 2.8, h: 1.6 });
    } else {
      L.lb = { x: x + 0.4, y: L.wy - 0.35, w: 1.2, d: 1.3, h: 0.75 };
      const d = 1.5, gap = n > 4 ? 0.55 : 0.75, span = n * d + (n - 1) * gap, y0 = L.wy + 0.3 - span / 2;
      for (let i = 0; i < n; i++) {
        const y = y0 + i * (d + gap);
        L.servers.push({ x: x + 5, y, w: 2.5, d, h: 1.25 });
        L.queues.push({ x: x + 3.4, y: y + 0.3, cols: 2, levels: 10 });
      }
    }
    return L;
  }
  // fit the scene's bounding box in the stage, leaving room for system.yaml on the left when it's open
  function fitView(L) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const box = (b, extra = 0) => {
      for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.d], [b.x + b.w, b.y + b.d]]) for (const z of [0, b.h + extra]) {
        const sx = (x - y) * c30, sy = (x + y) / 2 - z;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
    };
    box(L.crowd, 1.2);
    if (L.cache) box(L.cache, 1);
    if (L.lb) box(L.lb, 1);
    L.servers.forEach((s) => box(s, 1.6));
    L.queues.forEach((q) => box({ x: q.x, y: q.y, w: q.cols * 0.5, d: q.cols * 0.5, h: Math.min(q.levels * 0.3, 2) }));
    // room on the right for a column of server labels; on the left for system.yaml, minus what the crowd's empty
    // top-left corner can share with it
    const wide = cw > 900, left = wide && codeOpen ? els.code.offsetWidth * 0.75 + 20 : 12, right = L.servers.length > 1 ? 110 : 70;
    const top = 44, bottom = (cw > 860 ? 34 : 14) + ((X.parts || []).length ? 30 : 0);
    const aw = Math.max(80, cw - left - right), ah = Math.max(80, chh - top - bottom);
    const u = Math.max(8, Math.min(42, aw / (x1 - x0), ah / (y1 - y0)));
    return { u, ox: left + aw / 2 - ((x0 + x1) / 2) * u, oy: top + ah / 2 - ((y0 + y1) / 2) * u };
  }

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
  // a box from (x,y,z) of size w×d×hgt: the face toward the viewer's left, the one toward the right, then the top
  function cube(x, y, z, w, d, hgt, col, alpha = 1) {
    ctx.globalAlpha = alpha;
    poly([iso(x, y + d, z + hgt), iso(x + w, y + d, z + hgt), iso(x + w, y + d, z), iso(x, y + d, z)], shade(col, 0.78));
    poly([iso(x + w, y, z + hgt), iso(x + w, y + d, z + hgt), iso(x + w, y + d, z), iso(x + w, y, z)], shade(col, 0.6));
    poly([iso(x, y, z + hgt), iso(x + w, y, z + hgt), iso(x + w, y + d, z + hgt), iso(x, y + d, z + hgt)], col);
    ctx.globalAlpha = 1;
  }
  // a dashed outline of a box: where a ghost part would land
  function ghostBox(b, col) {
    ctx.save();
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
    const t = [iso(b.x, b.y, b.h), iso(b.x + b.w, b.y, b.h), iso(b.x + b.w, b.y + b.d, b.h), iso(b.x, b.y + b.d, b.h)];
    poly(t, col.replace(")", ",.12)").replace("rgb", "rgba"), col);
    poly([iso(b.x, b.y + b.d, b.h), iso(b.x, b.y + b.d, 0), iso(b.x + b.w, b.y + b.d, 0), iso(b.x + b.w, b.y + b.d, b.h)], null, col);
    poly([iso(b.x + b.w, b.y, b.h), iso(b.x + b.w, b.y, 0), iso(b.x + b.w, b.y + b.d, 0)], null, col);
    ctx.restore();
  }
  // the box's outline on screen, for clicks
  function rectOf(b) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.d], [b.x + b.w, b.y + b.d]]) for (const z of [0, b.h]) {
      const [sx, sy] = iso(x, y, z);
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return { x0, x1, y0, y1 };
  }
  function theme() {
    const dark = document.documentElement.dataset.theme !== "light";
    return dark
      ? { bg: "#0b1418", grid: "rgba(95,224,240,.07)", ground: "#10232a", wire: "#1c3a44", text: "#a9d6de", mute: "#5f8a93", q: "#ffc94a", hot: "#ff5a4f", ok: "#5fe0a0", bad: "#ff5a6e", req: "#ffe08a", pad: "#0e2a31", smoke: "120,140,148", cache: "#c7a2ff", lb: "#86b4ff", ghost: "rgb(95,224,240)", spark: "#ffb347", lit: "#5fe0a0" }
      : { bg: "#f2f6f5", grid: "rgba(16,90,104,.08)", ground: "#e3ecea", wire: "#c9dbd8", text: "#1d4a52", mute: "#6d8f95", q: "#e0a412", hot: "#e8453c", ok: "#1fa36a", bad: "#e23d55", req: "#e8a10f", pad: "#cfe2e0", smoke: "90,100,104", cache: "#9a6ce0", lb: "#4f7fd8", ghost: "rgb(15,139,160)", spark: "#f08a1c", lit: "#1fa36a" };
  }
  const PEOPLE = ["#ff6fb5", "#ffc94a", "#86b4ff", "#5fd4b0", "#c7a2ff", "#ff9d7a", "#f0643c", "#9fe870"];
  // how hot a server is, 0..1: teal, then blue, magenta and red, so no step on the way is a muddy brown
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
  function crowdShown() {
    const v = loadNow(), { min, max } = X.crowd;
    return Math.round(Math.max(0, Math.min(1, (v - min) / (max - min))) * 64);
  }

  let heatOf = [], boomOf = [], hits = [], LY = null, ghostDrag = null, lastRoute = -1, routeGlow = 0;
  function drawStage(dt) {
    if (!ctx) return;
    const T = theme(), t = performance.now() / 1000;
    LY = layout();
    // the view eases toward its new fit when parts come and go
    const goal = fitView(ghostDrag && ghostDrag.slot ? ghostDrag.slotLayout : LY);
    if (snapView || !VT) { V = { ...goal }; snapView = false; }
    else { const k = Math.min(1, dt * 5); V = { u: V.u + (goal.u - V.u) * k, ox: V.ox + (goal.ox - V.ox) * k, oy: V.oy + (goal.oy - V.oy) * k }; }
    VT = goal;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, cw, chh);
    ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
    for (let i = -4; i <= 24; i++) { const [a, b] = [iso(i, -6, 0), iso(i, 12, 0)]; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    for (let j = -6; j <= 12; j++) { const [a, b] = [iso(-4, j, 0), iso(24, j, 0)]; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    hits = [];
    const wy = LY.wy;
    // wires: crowd → cache → balancer → each queue, as strips on the floor
    const strip = (x0, y0, x1, y1, w, col) => {
      const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * w, ny = (dx / l) * w;
      poly([iso(x0 + nx, y0 + ny, 0), iso(x1 + nx, y1 + ny, 0), iso(x1 - nx, y1 - ny, 0), iso(x0 - nx, y0 - ny, 0)], col);
    };
    const firstQ = LY.queues[0], S0 = LY.servers[0];
    const entry = LY.cache ? LY.cache.x : LY.lb ? LY.lb.x : firstQ.x;
    strip(7.9, wy + 0.3, entry, wy + 0.3, 0.3, T.wire);
    if (LY.cache) strip(LY.cache.x + LY.cache.w, wy + 0.3, LY.lb ? LY.lb.x : firstQ.x, wy + 0.3, 0.3, T.wire);
    if (LY.lb) LY.queues.forEach((q, i) => strip(LY.lb.x + LY.lb.w, wy + 0.3, q.x, LY.servers[i].y + LY.servers[i].d / 2, i === lastRoute ? 0.16 : 0.11, i === lastRoute && routeGlow > 0 ? mix(T.wire.startsWith("#") ? T.wire : "#1c3a44", T.req, routeGlow * 0.6) : T.wire));
    if (!LY.lb) strip(firstQ.x, wy + 0.3, S0.x, wy + 0.3, 0.3, T.wire);
    // the crowd: people stand on a grid; in a closed loop the ones waiting for an answer glow
    poly([iso(-0.2, -0.2, 0), iso(7.7, -0.2, 0), iso(7.7, 6.9, 0), iso(-0.2, 6.9, 0)], T.ground);
    const shown = crowdShown(), waitingFrac = sim.cfg.mode === "closed" && sim.users ? (sim.users - sim.thinking) / sim.users : 0;
    const people = [];
    for (let k = 0; k < shown; k++) people.push(k);
    people.sort((a, b) => ((a % 8) + ((a / 8) | 0)) - ((b % 8) + ((b / 8) | 0)));
    for (const k of people) {
      const c = k % 8, r = (k / 8) | 0, x = c * 0.95 + 0.2, y = r * 0.85 + 0.2;
      const bob = reduce ? 0 : Math.max(0, Math.sin(t * 3 + k * 1.7)) * 0.06;
      const waiting = waitingFrac && ((k * 0.618) % 1) < waitingFrac;
      cube(x, y, bob, 0.5, 0.5, 0.62, waiting ? T.req : PEOPLE[(k * 5) % PEOPLE.length], waiting ? 1 : 0.92);
      cube(x + 0.1, y + 0.1, 0.66 + bob, 0.3, 0.3, 0.3, "#f3d6c0");
    }
    // the cache: a block whose top lights up as it fills with keys
    if (LY.cache) {
      const C = LY.cache, fill = Math.min(1, sim.lru.size / Math.max(1, sim.cfg.cache));
      cube(C.x, C.y, 0, C.w, C.d, C.h, T.cache);
      for (let i = 0; i < 9; i++) {
        const a = i % 3, b = (i / 3) | 0, x = C.x + 0.12 + a * 0.48, y = C.y + 0.12 + b * 0.48;
        poly([iso(x, y, C.h), iso(x + 0.38, y, C.h), iso(x + 0.38, y + 0.38, C.h), iso(x, y + 0.38, C.h)], i < Math.round(fill * 9) ? T.lit : T.pad);
      }
      hits.push({ kind: "cache", r: rectOf(C) });
    }
    if (LY.lb) {
      const B = LY.lb;
      cube(B.x, B.y, 0, B.w, B.d, B.h, T.lb);
      // an arrow on top points at the server that got the last request
      const s = LY.servers[Math.max(0, Math.min(LY.servers.length - 1, lastRoute))];
      const [ax, ay] = iso(B.x + B.w / 2, B.y + B.d / 2, B.h), [bx, by] = iso(B.x + B.w / 2 + 0.5, B.y + B.d / 2 + (s.y + s.d / 2 - (B.y + B.d / 2)) * 0.18, B.h);
      ctx.strokeStyle = T.bg; ctx.lineWidth = 2.5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.lineCap = "butt";
      hits.push({ kind: "lb", r: rectOf(B) });
    }
    // queues and servers, back to front
    const order = LY.servers.map((s, i) => i).sort((a, b) => LY.servers[a].y - LY.servers[b].y);
    for (const i of order) drawServer(i, T, dt, t);
    // a ghost being dragged shows the slot it would fill
    if (ghostDrag && ghostDrag.slot) ghostBox(ghostDrag.slot, T.ghost);
    drawFlyers(T, dt);
    drawSparks(T, dt);
    placeTags();
  }
  function drawServer(i, T, dt, t) {
    const B = LY.servers[i], Q = LY.queues[i], srv = sim.srv[i];
    if (!srv) return;
    const W = sim.cfg.workers, qn = srv.queue.length;
    // the queue tower
    const per = Q.cols * Q.cols, shownQ = Math.min(qn, per * Q.levels), qcol = qn > W * 6 ? T.hot : T.q;
    for (let k = 0; k < shownQ; k++) {
      const lvl = (k / per) | 0, m = k % per, a = m % Q.cols, b = (m / Q.cols) | 0;
      cube(Q.x + a * 0.5, Q.y + b * 0.5, lvl * 0.3, 0.44, 0.44, 0.26, qcol);
    }
    // overload, 0..1, eased: how far past "busy" this server is. It drives the heat, the shake, smoke and beacon
    const u = srv.busy.length / Math.max(1, W), over = Math.min(1, qn / (W * 8));
    heatOf[i] = (heatOf[i] || 0) + ((u * 0.6 + over * 0.4) - (heatOf[i] || 0)) * Math.min(1, dt * 3);
    boomOf[i] = (boomOf[i] || 0) + (over - (boomOf[i] || 0)) * Math.min(1, dt * 2);
    const hot = heatOf[i], boom = boomOf[i];
    const shake = reduce ? 0 : boom > 0.35 ? Math.sin(t * 53 + i * 2) * 0.05 * boom : 0;
    const x = B.x + shake, gone = srv.gone;
    cube(x, B.y, 0, B.w, B.d, B.h, gone ? T.pad : heat(Math.max(0, (hot - 0.45) / 0.55)), gone ? 0.5 : 1);
    // a slow machine wears a darker band
    if (i === 0 && sim.cfg.slow > 1) poly([iso(x, B.y + B.d, B.h * 0.55), iso(x + B.w, B.y + B.d, B.h * 0.55), iso(x + B.w, B.y + B.d, B.h * 0.4), iso(x, B.y + B.d, B.h * 0.4)], "rgba(0,0,0,.35)");
    // one pad per worker on top; a busy one carries the request, shrinking as it's served
    const gc = Math.ceil(Math.sqrt(W * B.w / B.d)), gr = Math.ceil(W / gc), pw = B.w / gc, pd = B.d / gr;
    for (let k = 0; k < W; k++) {
      const c = k % gc, r = (k / gc) | 0, px = x + c * pw + pw * 0.14, py = B.y + r * pd + pd * 0.14;
      poly([iso(px, py, B.h), iso(px + pw * 0.72, py, B.h), iso(px + pw * 0.72, py + pd * 0.72, B.h), iso(px, py + pd * 0.72, B.h)], T.pad);
      const q = srv.busy[k];
      if (q) {
        const left = q.end > q.began ? Math.max(0, Math.min(1, (q.end - sim.t) / (q.end - q.began))) : 0, s = Math.min(pw, pd) * 0.5;
        cube(px + pw * 0.36 - s / 2, py + pd * 0.36 - s / 2, B.h, s, s, 0.2 + 0.5 * left, T.req);
      }
    }
    // drowning: a beacon, and smoke rising off the top
    if (boom > 0.45 && !gone) {
      const on = reduce || Math.sin(t * 9 + i) > 0;
      cube(x + B.w - 0.45, B.y + 0.15, B.h, 0.3, 0.3, 0.3, on ? T.bad : shade(T.bad, 0.45));
      if (on && !reduce) { const [bx, by] = iso(x + B.w - 0.3, B.y + 0.3, B.h + 0.3); const g = ctx.createRadialGradient(bx, by, 0, bx, by, V.u * 1.4); g.addColorStop(0, "rgba(255,90,110,.35)"); g.addColorStop(1, "rgba(255,90,110,0)"); ctx.fillStyle = g; ctx.fillRect(bx - V.u * 1.4, by - V.u * 1.4, V.u * 2.8, V.u * 2.8); }
    }
    if (!reduce && !paused && boom > 0.3 && sparks.length < 260 && Math.random() < boom * dt * 14) {
      sparks.push({ kind: "smoke", x: x + Math.random() * B.w, y: B.y + Math.random() * B.d, z: B.h + 0.2, vx: 0.15, vy: -0.1, vz: 0.7 + Math.random() * 0.4, age: 0, life: 2 + Math.random(), s: 0.14 + Math.random() * 0.12 });
    }
    hits.push({ kind: "server", i, r: rectOf(B) });
  }
  // a request's trip, as a path of floor points: crowd → (cache) → (balancer) → its queue
  function pathIn(srvI) {
    const wy = LY.wy + 0.3, p = [[7.9, wy]];
    if (LY.cache) p.push([LY.cache.x, wy]);
    if (LY.lb) p.push([LY.lb.x + LY.lb.w, wy]);
    const Q = LY.queues[Math.min(srvI, LY.queues.length - 1)], S = LY.servers[Math.min(srvI, LY.servers.length - 1)];
    p.push([Q.x - 0.1, LY.lb ? S.y + S.d / 2 : wy]);
    return p;
  }
  function along(p, f) {
    let L = 0; const seg = [];
    for (let i = 1; i < p.length; i++) { const l = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); seg.push(l); L += l; }
    let d = f * L;
    for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const k = seg[i] ? Math.min(1, d / seg[i]) : 0; return [p[i][0] + (p[i + 1][0] - p[i][0]) * k, p[i][1] + (p[i + 1][1] - p[i][1]) * k]; } d -= seg[i]; }
    return p[p.length - 1];
  }
  function drawFlyers(T, dt) {
    flyers = flyers.filter((f) => (f.age += dt) < f.life);
    for (const f of flyers) {
      const p = f.age / f.life;
      if (f.kind === "in") { const [x, y] = along(pathIn(f.srv), p); cube(x, y - 0.12 + f.lane * 0.24, 0.05, 0.26, 0.26, 0.22, T.req); }
      else if (f.kind === "hit") {
        // to the cache and straight back home, green
        const C = LY.cache; if (!C) continue;
        const go = p < 0.5, k = go ? p * 2 : (1 - p) * 2, x = 7.9 + (C.x - 7.9) * k, y = LY.wy + 0.3 + (go ? -0.1 : -0.5) + f.lane * 0.2;
        cube(x, y, 0.05 + (go ? 0 : Math.sin(k * Math.PI) * 0.5), 0.22, 0.22, 0.2, go ? T.req : T.ok);
      } else if (f.kind === "ok") {
        const S = LY.servers[Math.min(f.srv, LY.servers.length - 1)], sx = S.x, sy = S.y + S.d / 2;
        const x = sx + (7.9 - sx) * p, y = sy + (LY.wy - 0.2 - sy) * p - f.lane * 0.2;
        cube(x, y, 0.35 + Math.sin(p * Math.PI) * 0.9, 0.22, 0.22, 0.2, T.ok);
      } else {
        const S = LY.servers[Math.min(f.srv, LY.servers.length - 1)];
        cube(S.x - 0.8 - p * 1.6, S.y + S.d * 0.3 + f.lane * 0.5, Math.max(0, 1.4 - p * p * 2.2), 0.24, 0.24, 0.22, T.bad, 1 - p * 0.6);
      }
    }
  }
  // sparks fly off a server that turns requests away; smoke drifts up and spreads
  function drawSparks(T, dt) {
    sparks = sparks.filter((s) => (s.age += dt) < s.life);
    for (const s of sparks) {
      const p = s.age / s.life;
      if (s.kind === "smoke") {
        s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
        const [x, y] = iso(s.x, s.y, s.z), r = V.u * s.s * (1 + p * 1.6);
        ctx.fillStyle = `rgba(${T.smoke},${0.36 * (1 - p)})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      } else {
        s.vz -= 9 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z = Math.max(0, s.z + s.vz * dt);
        const [x, y] = iso(s.x, s.y, s.z);
        ctx.fillStyle = p < 0.5 ? T.spark : T.bad; ctx.globalAlpha = 1 - p;
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3); ctx.globalAlpha = 1;
      }
    }
  }
  function burst(i) {
    if (reduce || !LY || sparks.length > 240) return;
    const B = LY.servers[Math.min(i, LY.servers.length - 1)];
    for (let k = 0; k < 5; k++) sparks.push({ kind: "spark", x: B.x + 0.2, y: B.y + Math.random() * B.d, z: B.h * 0.8, vx: -1 - Math.random() * 2, vy: (Math.random() - 0.5) * 2, vz: 1.5 + Math.random() * 2.5, age: 0, life: 0.7 + Math.random() * 0.4 });
  }

  // ------------------------------------------------------- labels on top --
  let tagEls = new Map();
  function tag(id, cls, onclick) {
    let el = tagEls.get(id);
    if (!el) {
      el = h(onclick ? "button" : "span", { class: cls, onclick });
      els.tags.append(el);
      tagEls.set(id, el);
    }
    el._seen = true;
    return el;
  }
  const setHTML = (el, s) => { if (el._h !== s) { el.innerHTML = s; el._h = s; } };
  function placeTags() {
    for (const el of tagEls.values()) el._seen = false;
    const [cx, cy] = iso(3.7, -0.4, 1.6);
    els.crowd.style.transform = `translate(${cx}px, ${cy}px)`;
    setHTML(els.crowd, `<b>${fmtLoad(loadNow())}</b><small>${inTask() ? "fixed for the task" : "drag ↕"}</small>`);
    els.crowd.classList.toggle("locked", inTask());
    const many = LY.servers.length > 1;
    LY.servers.forEach((B, i) => {
      const srv = sim.srv[i];
      if (!srv) return;
      const el = tag("s" + i, "wt-server", () => toggleInspect({ kind: "server", i }));
      // one server: its label floats above it. Several: each label sits just right of its server, so a column of
      // servers gets a column of labels that never overlap
      const [sx, sy] = many ? iso(B.x + B.w + 0.2, B.y + B.d * 0.5, B.h * 0.5) : iso(B.x + B.w * 0.6, B.y - 0.4, B.h + 1.4);
      el.style.transform = `translate(${sx}px, ${sy}px)`;
      const drown = (boomOf[i] || 0) > 0.45 && !srv.gone;
      el.classList.toggle("hot", drown);
      el.classList.toggle("on", !!selected && selected.kind === "server" && selected.i === i);
      el.classList.toggle("many", many);
      el.setAttribute("aria-label", `${cap1(name("server"))} ${i + 1}. Click to look inside`);
      const slow = i === 0 && sim.cfg.slow > 1 ? `<em>${many ? "slow" : `${sim.cfg.slow}× slower`}</em>` : "";
      setHTML(el, srv.gone ? `${many ? i + 1 : name("server")} <small>leaving</small>` : many
        ? `<span>${i + 1}</span> <b>${srv.busy.length}/${sim.cfg.workers}</b>${slow}`
        : `${name("server")} <b>${srv.busy.length}/${sim.cfg.workers}</b> busy${drown ? " <i>drowning</i>" : ""}`);
      const Q = LY.queues[i], qn = srv.queue.length;
      const qt = tag("q" + i, "wt-queue");
      const [qx, qy] = iso(Q.x + Q.cols * 0.25, Q.y + Q.cols * 0.25, Math.min(Q.levels, Math.ceil(qn / (Q.cols * Q.cols))) * 0.3 + 0.55);
      qt.style.transform = `translate(${qx}px, ${qy}px)`;
      setHTML(qt, qn ? (many ? `<b>${qn}</b>` : `queue <b>${qn}</b>`) : "");
    });
    if (LY.lb) {
      const el = tag("lb", "wt-lbtag", () => { if (canTurn("lb")) cycleLb(); else toggleInspect({ kind: "lb" }); });
      const [x, y] = iso(LY.lb.x + LY.lb.w * 0.5, LY.lb.y + LY.lb.d, 0);
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.classList.toggle("can", canTurn("lb"));
      el.title = canTurn("lb") ? "Click to change how the balancer picks" : "The load balancer";
      setHTML(el, `<small>balancer</small><b>${LB[sim.cfg.lb][0]}</b>${canTurn("lb") ? "<i>↻</i>" : ""}`);
    }
    if (LY.cache) {
      const el = tag("cache", "wt-ctag", () => toggleInspect({ kind: "cache" }));
      const [x, y] = iso(LY.cache.x + LY.cache.w * 0.5, LY.cache.y + LY.cache.d, 0);
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.classList.toggle("on", !!selected && selected.kind === "cache");
      const st = samples[samples.length - 1];
      setHTML(el, `cache <b>${num(sim.cfg.cache)}</b>${st ? ` · ${Math.round(st.hit * 100)}% hits` : ""}`);
    }
    for (const [id, el] of tagEls) if (!el._seen) { el.remove(); tagEls.delete(id); }
  }

  // ------------------------------------------------------------ gestures --
  // drag the crowd: up for more load, down for less; arrow keys and the wheel do the same. Click a part to inspect it.
  function wireStage() {
    let drag = null;
    const pt = (e) => { const r = els.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const crowdHit = (e) => {
      const [x, y] = pt(e), [ax] = iso(0, 6.9, 0), [bx] = iso(7.8, 0, 0), [, ty] = iso(0, 0, 2.2), [, by] = iso(7.8, 6.9, 0);
      return x > ax - 10 && x < bx + 10 && y > ty - 30 && y < by + 10;
    };
    const partHit = (e) => { const [x, y] = pt(e); for (let k = hits.length - 1; k >= 0; k--) { const r = hits[k].r; if (x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) return hits[k]; } return null; };
    const startDrag = (e) => {
      if (inTask()) { els.hint.textContent = taskHint(); return; }
      drag = { y: e.clientY, v: loadNow() };
      els.stage.setPointerCapture?.(e.pointerId);
      els.stage.classList.add("dragging");
      e.preventDefault();
    };
    els.stage.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".wt-insp, .wt-tags button, .wt-code, .wt-parts")) return;
      const p = partHit(e);
      if (p) toggleInspect(p.kind === "server" ? { kind: "server", i: p.i } : { kind: p.kind });
      else if (e.target === els.crowd || crowdHit(e)) startDrag(e);
      else closeInspect();
    });
    els.stage.addEventListener("pointermove", (e) => {
      if (drag) {
        const span = X.crowd.max - X.crowd.min;
        setLoad(drag.v + ((drag.y - e.clientY) / Math.max(160, chh * 0.6)) * span);
      } else if (!ghostDrag) els.canvas.style.cursor = partHit(e) ? "pointer" : crowdHit(e) ? (inTask() ? "not-allowed" : "ns-resize") : "";
    });
    const end = () => { if (drag) { drag = null; els.stage.classList.remove("dragging"); } };
    els.stage.addEventListener("pointerup", end);
    els.stage.addEventListener("pointercancel", end);
    els.crowd.addEventListener("keydown", (e) => {
      if (inTask()) return;
      const s = X.crowd.step * (e.shiftKey ? 10 : 2);
      if (e.key === "ArrowUp" || e.key === "ArrowRight") { setLoad(loadNow() + s); e.preventDefault(); }
      if (e.key === "ArrowDown" || e.key === "ArrowLeft") { setLoad(loadNow() - s); e.preventDefault(); }
    });
    els.stage.addEventListener("wheel", (e) => {
      if (!crowdHit(e) || inTask()) return;
      e.preventDefault();
      setLoad(loadNow() - Math.sign(e.deltaY) * X.crowd.step * 2);
    }, { passive: false });
    els.hint.textContent = inTask() ? taskHint() : `Drag the crowd up or down to change the load. Click a part to look inside.${(X.parts || []).length ? " Drag a part on from the right." : ""}`;
  }
  function setLoad(v) {
    const { min, max, step } = X.crowd;
    v = Math.max(min, Math.min(max, Math.round(v / step) * step));
    if (v === loadNow()) return;
    sim.set({ [knob()]: v });
    lastLoadChange = sim.t;
    els.hint.textContent = "";
    renderCode();
  }
  // every design change goes through here, so the goal's window and the dots restart, and the code view updates
  function setKnob(k, v) {
    if (!canTurn(k) || sim.cfg[k] === v) return;
    sim.set({ [k]: v });
    lastSysChange = sim.t;
    renderInspect(true); renderParts(); renderCode();
  }
  function cycleLb() { const K = Object.keys(LB); setKnob("lb", K[(K.indexOf(sim.cfg.lb) + 1) % K.length]); }

  // the parts tray: ghosts you drag onto the wire (or click) to add a server or a cache
  const PARTS = {
    server: { label: () => name("server"), can: () => canTurn("servers") && sim.cfg.servers < MAX_SERVERS, add: () => setKnob("servers", sim.cfg.servers + 1), slot: () => { const L = layout({ servers: sim.cfg.servers + 1 }); return { slot: L.servers[L.servers.length - 1], L }; }, note: () => `${sim.cfg.servers} of ${MAX_SERVERS}` },
    cache: { label: () => "cache", can: () => canTurn("cache") && !(sim.cfg.cache > 0), add: () => setKnob("cache", 100), slot: () => { const L = layout({ cache: 100 }); return { slot: L.cache, L }; }, note: () => (sim.cfg.cache > 0 ? "in place" : "100 keys") },
  };
  function renderParts() {
    const list = X.parts || [];
    els.parts.innerHTML = "";
    els.parts.hidden = !list.length;
    if (!list.length) return;
    els.parts.append(h("p", {}, "parts"));
    for (const k of list) {
      const p = PARTS[k], ok = p.can();
      const g = h("button", { class: "ghost " + k, disabled: !ok, title: ok ? `Drag onto the wire to add a ${p.label()}` : "", "aria-label": `Add a ${p.label()}` },
        h("span", { class: "gi", "aria-hidden": "true", html: isoIcon() }), h("b", {}, p.label()), h("small", {}, p.note()));
      g.addEventListener("pointerdown", (e) => startGhost(e, k, g));
      g.addEventListener("click", (e) => { if (g._dragged) { g._dragged = false; return; } if (p.can()) p.add(); e.preventDefault(); });
      els.parts.append(g);
    }
  }
  const isoIcon = () => `<svg viewBox="0 0 28 28"><path d="M14 3 25 9v10l-11 6-11-6V9z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2.5" stroke-linejoin="round"/><path d="M3 9l11 6 11-6M14 15v10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2.5"/></svg>`;
  function startGhost(e, k, btn) {
    const p = PARTS[k];
    if (!p.can()) return;
    const x0 = e.clientX, y0 = e.clientY;
    let fly = null;
    const move = (ev) => {
      if (!fly && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      if (!fly) {
        fly = h("div", { class: "wt-fly", html: isoIcon() });
        document.body.append(fly);
        const s = p.slot();
        ghostDrag = { k, slot: s.slot, slotLayout: s.L };
        btn._dragged = true;
      }
      fly.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
      const r = els.stage.getBoundingClientRect(), inside = ev.clientX > r.left && ev.clientX < r.right && ev.clientY > r.top && ev.clientY < r.bottom;
      fly.classList.toggle("in", inside);
      ghostDrag.over = inside;
    };
    const up = () => {
      removeEventListener("pointermove", move); removeEventListener("pointerup", up);
      if (fly) { fly.remove(); if (ghostDrag && ghostDrag.over) p.add(); ghostDrag = null; }
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  }

  // the inspector: one part's knobs and live numbers
  let selected = null, ins = null;
  function toggleInspect(part) {
    if (selected && part && selected.kind === part.kind && selected.i === part.i) return closeInspect();
    selected = part;
    els.inspect.hidden = false;
    renderInspect(true);
  }
  function closeInspect() { selected = null; els.inspect.hidden = true; }
  const stepper = (label, onMinus, onPlus) => {
    const out = h("output", { class: "wn" });
    const minus = h("button", { class: "step", "aria-label": `${label}: fewer`, onclick: onMinus }, "−");
    const plus = h("button", { class: "step", "aria-label": `${label}: more`, onclick: onPlus }, "+");
    return { row: h("div", { class: "row" }, h("span", {}, label), minus, out, plus), out, minus, plus };
  };
  function renderInspect(rebuild) {
    if (!selected || els.inspect.hidden) return;
    const c = sim.cfg;
    if (selected.kind === "server" && !sim.srv[selected.i]) return closeInspect();
    if (selected.kind === "cache" && !(c.cache > 0)) return closeInspect();
    if (selected.kind === "lb" && sim.srv.length < 2) return closeInspect();
    if (rebuild || !ins || ins.kind !== selected.kind || ins.i !== selected.i) {
      els.inspect.innerHTML = "";
      ins = { kind: selected.kind, i: selected.i };
      const many = sim.srv.length > 1;
      if (selected.kind === "server") {
        els.inspect.append(h("p", { class: "ih" }, many ? `${cap1(name("server"))} ${selected.i + 1}` : cap1(name("server"))));
        ins.w = stepper("workers", () => setWorkers(sim.cfg.workers - 1), () => setWorkers(sim.cfg.workers + 1));
        els.inspect.append(ins.w.row, ins.dl = h("dl", {}));
        if (many) els.inspect.append(h("p", { class: "note" }, "Every server has the same workers."));
      } else if (selected.kind === "lb") {
        els.inspect.append(h("p", { class: "ih" }, "Load balancer"));
        ins.pol = h("p", { class: "pol" });
        ins.s = stepper("servers", () => setKnob("servers", Math.max(1, sim.cfg.servers - 1)), () => setKnob("servers", Math.min(MAX_SERVERS, sim.cfg.servers + 1)));
        els.inspect.append(ins.pol, ins.s.row, ins.dl = h("dl", {}));
      } else {
        els.inspect.append(h("p", { class: "ih" }, "Cache"));
        const at = () => CACHE_SIZES.findIndex((v) => v >= sim.cfg.cache);
        ins.c = stepper("keys", () => setKnob("cache", CACHE_SIZES[Math.max(0, at() - 1)]), () => setKnob("cache", CACHE_SIZES[Math.min(CACHE_SIZES.length - 1, at() + (CACHE_SIZES[at()] === sim.cfg.cache ? 1 : 0))]));
        els.inspect.append(ins.c.row, ins.dl = h("dl", {}));
        ins.rm = h("button", { class: "wt-link rm", onclick: () => setKnob("cache", 0) }, "remove the cache");
        els.inspect.append(ins.rm);
      }
    }
    const st = sim.stats(Math.max(0, sim.t - 5), sim.t);
    if (selected.kind === "server") {
      const i = selected.i, s = sim.srv[i], svc = c.service * (i === 0 ? c.slow || 1 : 1);
      ins.w.out.textContent = c.workers;
      ins.w.minus.disabled = !canTurn("workers") || c.workers <= 1;
      ins.w.plus.disabled = !canTurn("workers") || c.workers >= 16;
      ins.dl.innerHTML = `<dt>each request</dt><dd>≈ ${ms(svc)}</dd><dt>capacity</dt><dd>${Math.round(c.workers / svc)} req/s</dd>
        <dt>busy</dt><dd>${s.busy.length} of ${c.workers}</dd><dt>queue</dt><dd>${s.queue.length}</dd>${sim.srv.length === 1 ? `<dt>busy, last 5 s</dt><dd>${Math.round(st.util * 100)}%</dd>` : ""}`;
    } else if (selected.kind === "lb") {
      const [w, d] = LB[c.lb];
      ins.pol.innerHTML = "";
      ins.pol.append(canTurn("lb") ? h("button", { class: "wt-link", onclick: cycleLb, title: "Click to change" }, w) : h("b", {}, w), `: ${d}.`);
      ins.s.out.textContent = c.servers;
      ins.s.minus.disabled = !canTurn("servers") || c.servers <= 1;
      ins.s.plus.disabled = !canTurn("servers") || c.servers >= MAX_SERVERS;
      ins.dl.innerHTML = sim.srv.map((s, i) => `<dt>${name("server")} ${i + 1}${i === 0 && c.slow > 1 ? " (slow)" : ""}</dt><dd>${s.busy.length + s.queue.length} in flight</dd>`).join("");
    } else {
      ins.c.out.textContent = num(c.cache);
      ins.c.minus.disabled = !canTurn("cache") || c.cache <= CACHE_SIZES[0];
      ins.c.plus.disabled = !canTurn("cache") || c.cache >= CACHE_SIZES[CACHE_SIZES.length - 1];
      ins.rm.hidden = !canTurn("cache");
      ins.dl.innerHTML = `<dt>holding</dt><dd>${num(sim.lru.size)} of ${num(c.cache)}</dd><dt>of all keys</dt><dd>${(c.cache / c.keys * 100).toFixed(c.cache < c.keys / 10 ? 1 : 0)}%</dd>
        <dt>hits, last 5 s</dt><dd>${Math.round(st.hit * 100)}%</dd><dt>to the ${name("server")}</dt><dd>${Math.round(st.misses)}/s</dd>`;
    }
  }
  function setWorkers(n) { setKnob("workers", Math.max(1, Math.min(16, n))); }

  // -------------------------------------------------------------- charts --
  const charts = {};
  const scat = () => X.scatter || { x: knob(), min: X.crowd.min, max: X.crowd.max, y: "p99", ymax: 2, label: `p99 wait against ${X.crowd.unit}` };
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
    box("load", scat().label, true);
    box("tput", "served per second");
    box("lat", "wait: p50 and p99");
    box("err", "errors per second");
    box("util", X.parts && X.parts.includes("cache") ? "cache hits" : "workers busy");
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
    const sc = scat(), pad = { l: 36, r: 10, t: 8, b: 18 }, YMAX = sc.ymax, pctY = sc.y === "hit";
    const ax = { min: sc.min, max: sc.max, log: sc.log };
    const px = (v) => pad.l + toF(ax, Math.max(sc.min, Math.min(sc.max, v))) * (W - pad.l - pad.r);
    const py = (s) => H - pad.b - (Math.min(s, YMAX) / YMAX) * (H - pad.t - pad.b);
    const ink = css("--wt-mute"), line = css("--wt-line"), acc = css("--wt-acc"), pink = css("--wt-pink");
    x.font = "10px " + css("--f-mono"); x.fillStyle = ink; x.strokeStyle = line; x.lineWidth = 1;
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const s = f * YMAX;
      x.beginPath(); x.moveTo(pad.l, py(s)); x.lineTo(W - pad.r, py(s)); x.stroke();
      x.textAlign = "right"; x.fillText(pctY ? `${Math.round(f * 100)}%` : s ? `${s} s` : "0", pad.l - 5, py(s) + 3);
    }
    x.textAlign = "center";
    const ticks = sc.log ? [10, 100, 1000, 10000].filter((v) => v >= sc.min && v <= sc.max) : [0, 0.25, 0.5, 0.75, 1].map((f) => sc.min + f * (sc.max - sc.min));
    ticks.forEach((v, i) => { x.textAlign = i === 0 ? "left" : i === ticks.length - 1 ? "right" : "center"; x.fillText(num(v), px(v) + (i === 0 ? -2 : 0), H - 4); });
    // for a cache: the hit rate the database needs at today's load, dashed
    if (pctY && sim.cfg.mode === "open") {
      const cap = sim.cfg.workers / sim.cfg.service * sim.cfg.servers, need = 1 - cap / Math.max(1, sim.cfg.rate);
      if (need > 0) {
        x.strokeStyle = css("--wt-amber"); x.setLineDash([3, 4]); x.beginPath(); x.moveTo(pad.l, py(need)); x.lineTo(W - pad.r, py(need)); x.stroke(); x.setLineDash([]);
        x.fillStyle = css("--wt-amber"); x.textAlign = "left"; x.fillText(`the ${name("server")} needs ${Math.round(need * 100)}% at ${num(sim.cfg.rate)}/s`, pad.l + 6, py(need) - 5);
      }
    }
    // the guess and, once revealed, the answer
    const showAns = P.revealed || inTask();
    if (P.guess != null) {
      x.strokeStyle = pink; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(px(P.guess), pad.t); x.lineTo(px(P.guess), H - pad.b); x.stroke(); x.setLineDash([]);
      x.fillStyle = pink; x.textAlign = "left"; x.fillText("your guess", px(P.guess) + 4, pad.t + 9);
    }
    if (showAns) {
      const A = X.predict.answer;
      x.strokeStyle = acc; x.beginPath(); x.moveTo(px(A), pad.t); x.lineTo(px(A), H - pad.b); x.stroke();
      x.fillStyle = acc; x.textAlign = "right"; x.fillText(`${X.predict.axis ? "needs" : "bends"} ≈ ${num(A)}`, px(A) - 4, H - pad.b - 6);
    }
    // a dot per steady second: older ones fade
    dots.forEach((d, i) => {
      x.globalAlpha = 0.25 + 0.75 * (i / Math.max(1, dots.length - 1));
      const over = !pctY && d.y > YMAX;
      x.fillStyle = over ? css("--wt-bad") : acc;
      const xx = px(d.x), yy = py(d.y);
      if (over) { x.beginPath(); x.moveTo(xx - 3, yy + 5); x.lineTo(xx + 3, yy + 5); x.lineTo(xx, yy); x.fill(); }
      else { x.beginPath(); x.arc(xx, yy, 2.6, 0, Math.PI * 2); x.fill(); }
    });
    x.globalAlpha = 1;
    const last = dots[dots.length - 1];
    charts[k].val.textContent = last ? (pctY ? `${Math.round(last.y * 100)}% at ${num(last.x)} keys` : `${ms(last.y)} at ${num(last.x)}`) : "";
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
      // a soft fill under the main line, so the shape reads at a glance
      if (!l.dash && l.fill !== false && samples.length > 1) {
        const vis = samples.filter((s) => s.t >= t0);
        if (vis.length > 1) {
          x.lineTo(px(vis[vis.length - 1].t), H - pad.b); x.lineTo(px(vis[0].t), H - pad.b); x.closePath();
          x.globalAlpha = 0.12; x.fillStyle = l.color; x.fill(); x.globalAlpha = 1;
        }
      }
    }
    x.setLineDash([]);
    const s = samples[samples.length - 1];
    charts[k].val.textContent = s ? fmt(s) : "";
  }
  function drawCharts() {
    if (!sim) return;
    drawLoadChart();
    const acc = css("--wt-acc"), pink = css("--wt-pink"), bad = css("--wt-bad"), mute = css("--wt-mute");
    const open = sim.cfg.mode === "open";
    series("tput", [...(open ? [{ key: "offered", color: mute, dash: [3, 3], w: 1 }] : []), { key: "tput", color: acc }], 10, (s) => `${Math.round(s.tput)}/s${open ? ` of ${Math.round(s.offered)}` : ""}`);
    series("lat", [{ key: "p50", color: acc, fill: false }, { key: "p99", color: pink }], 0.3, (s) => `${ms(s.p50)} · ${ms(s.p99)}`, 12);
    series("err", [{ key: "err", color: bad }], 1, (s) => `${s.err.toFixed(s.err < 10 ? 1 : 0)}/s`);
    if (X.parts && X.parts.includes("cache")) series("util", [{ key: "hit", color: css("--wt-ok") }], 1, (s) => `${Math.round(s.hit * 100)}%`, 1);
    else series("util", [{ key: "util", color: acc }], 1, (s) => `${Math.round(s.util * 100)}%`, 1);
  }

  // ---------------------------------------------------------------- loop --
  let lastWall = performance.now(), lastSample = 0, chartT = 0;
  function frame(now) {
    // rAF's timestamp can be a little older than the clock read at load: never step the sim backwards
    const dt = Math.max(0, Math.min(0.1, (now - lastWall) / 1000));
    lastWall = Math.max(lastWall, now);
    if (X && sim) {
      if (!paused && !document.hidden) {
        sim.advance(sim.t + dt * speed);
        spawn(sim.feed.splice(0));
        while (sim.t - lastSample >= 1) { lastSample += 1; sample(lastSample); }
      }
      routeGlow = Math.max(0, routeGlow - dt * 3);
      drawStage(dt);
      els.clock.textContent = clock(sim.t);
      if ((chartT += dt) > 0.12) { chartT = 0; drawCharts(); renderInspect(); }
    }
    requestAnimationFrame(frame);
  }
  // turn the sim's feed into a few flyers a frame; at high rates most requests aren't drawn, only sampled
  function spawn(feed) {
    const trips = [];
    for (let i = 0; i < feed.length; i++) {
      const [kind, a, why, srvI] = feed[i];
      if (kind === "in") {
        const nx = feed[i + 1];
        if (nx && nx[0] === "hit") { trips.push({ kind: "hit" }); i++; }
        else if (nx && nx[0] === "route") { trips.push({ kind: "in", srv: nx[1] }); lastRoute = nx[1]; routeGlow = 1; i++; }
        else trips.push({ kind: "in", srv: 0 });
      } else if (kind === "out") {
        trips.push({ kind: a ? "ok" : "bad", srv: srvI || 0 });
        if (!a) burst(srvI || 0);
      }
    }
    const budget = speed > 1 ? 4 : 8, step = Math.max(1, Math.ceil(trips.length / budget));
    for (let i = 0; i < trips.length && flyers.length < 140; i += step) {
      const f = trips[i], life = speed < 1 ? 1.4 : f.kind === "hit" ? 0.6 : 0.45;
      flyers.push({ ...f, age: 0, life: f.kind === "bad" ? 0.9 : life, lane: Math.random() });
    }
  }
  const clock = (t) => `t ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  function sample(t) {
    const st = sim.stats(Math.max(0, t - 5), t), span = Math.min(5, t) || 1;
    const s = { t, load: loadNow(), offered: sim.cfg.mode === "open" ? sim.cfg.rate : st.sent / span, tput: st.tput, p50: st.p50, p99: st.p99, err: st.errors / span, util: st.util, hit: st.hit };
    samples.push(s);
    if (samples.length > 400) samples.shift();
    // a dot only once the load and the design have been steady for the whole 5 s window, so a change doesn't smear it
    const sc = scat(), xv = sc.x === knob() ? s.load : sim.cfg[sc.x];
    if (t - Math.max(lastLoadChange, lastSysChange) >= 6 && st.ok > 3 && xv > 0) {
      dots.push({ x: xv, y: s[sc.y], load: s.load, p99: s.p99 });
      if (dots.length > 240) dots.shift();
      if (P.phase === "explore" && !P.revealed && P.guess != null) {
        const A = X.predict.answer;
        const ok = X.predict.axis
          ? xv >= A / 1.3 && s.load >= (X.predict.atLoad || 0) && s.p99 < 2 && st.errors === 0
          : s.load >= Math.min(P.guess, A) * 1.02 && s.load >= A && s.p99 > 1;
        if (ok) reveal();
      }
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
  main.wtSet = (patch) => { sim.set(patch); for (const k in patch) { if (k === knob()) lastLoadChange = sim.t; else lastSysChange = sim.t; } renderCode(); };
  main.wtRun = (secs) => { const end = sim.t + secs; while (sim.t < end) { sim.advance(Math.min(end, sim.t + 1)); sim.feed.length = 0; if (sim.t - lastSample >= 1) { lastSample += 1; sample(lastSample); } } drawCharts(); };
  main.wtState = () => ({ phase: P.phase, guess: P.guess, t: sim.t, cfg: sim.cfg, done: !!S.done[X.id] });
})();
