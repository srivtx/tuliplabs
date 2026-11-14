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
  const HOME = window.WT.home || {};
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
  // ?shot: draw the stage on transparency, with floors and wires in neutral tones, for tools/lab-thumbs.js to capture
  const SHOT = /[?&]shot\b/.test(location.search);
  if (SHOT) document.documentElement.classList.add("wt-shot");
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
  // tape: the run's start and every knob turned since, so any moment can be rebuilt (rewind). While rewound, `live` holds
  // the run's real head and `sim` is the moment you're looking at.
  let tape = null, live = null;
  let X, idx, sim, P, speed = 1, paused = false, samples = [], dots = [], lastLoadChange = 0, lastSysChange = 0, flyers = [], sparks = [], before = null;
  // a batch experiment's chart: each batch's jobs still waiting, by seconds since it landed, keyed by when it landed
  let teeth = new Map();
  const SPEEDS = [[0.1, "slow-mo"], [1, "×1"], [10, "×10"]];
  const WINDOW = 30, MAX_SERVERS = 6;
  const CACHE_SIZES = [10, 25, 50, 100, 250, 500, 1000, 1500, 2000, 3000, 5000, 10000];
  const QUEUE_SIZES = [10, 20, 40, 60, 80, 100, 120, 150, 250, 500, 1000];
  const BACKOFFS = [0, 0.1, 0.25, 0.5, 1, 2];
  const LIMITS = [1, 2, 5, 10, 15, 20, 25, 30, 40, 50, 100];
  const BURSTS = [1, 2, 3, 5, 10, 20, 50];
  const NOISY = [0, 5, 10, 15, 20, 25, 30, 40, 60, 100, 150, 200];
  const MAX_REPLICAS = 4;
  // a database experiment: the machines are a primary and its read replicas
  const isDb = () => sim && sim.cfg.writes > 0;
  const dbName = (i) => (i ? `replica ${i}` : "primary");
  // a sharded experiment: machines are shards, each owning an arc of the hash ring, in its own colour
  const isShard = () => sim && sim.cfg.shards > 0;
  const MAX_SHARDS = 6, SPLITS = [1, 2, 3, 4], HOTS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 25, 30, 35, 40, 50];
  const ARC = ["#ff6fb5", "#5fd4b0", "#86b4ff", "#c7a2ff", "#ff9d7a", "#9fe870"];
  // a step list's next value up or down from v
  const stepIn = (L, v, d) => { const i = L.findIndex((x) => x >= v); const at = i < 0 ? L.length - 1 : i; return L[Math.max(0, Math.min(L.length - 1, d > 0 ? at + (L[at] === v ? 1 : 0) : at - 1))]; };
  // knobs this experiment ever lets you turn, so the inspector shows their rows (greyed when not yet yours)
  const knobs = () => new Set([...(X.free || ["workers"]), ...X.task.knobs]);
  const surging = () => { const g = sim.cfg.surge; return !!g && sim.t >= g.at && sim.t < g.at + g.for; };
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
    tape = { cfg, seed: 1 + idx, changes: [] };
    live = null;
    before = startCfg();
    samples = []; dots = []; flyers = []; sparks = []; lastLoadChange = 0; lastSysChange = 0; lastSample = 0; teeth = new Map();
    heatOf = []; boomOf = [];
    snapView = true;
  }
  // restart the run with the knobs as they are now: a way out when a backlog won't drain
  function restart() {
    const keep = {};
    for (const k of ["rate", "users", "workers", "servers", "lb", "cache", "queueMax", "cancel", "retries", "backoff", "jitter", "jobWorkers", "noisy", "limit", "burst", "replicas", "ryw", "shards", "hot", "hotSplit"]) keep[k] = sim.cfg[k];
    // a surge lifts the rate for a while: restart from the rate underneath it
    if (surging()) keep.rate = sim.base;
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
    els.vsplit = h("div", { class: "wt-split v", role: "separator", tabindex: 0, "aria-orientation": "vertical", "aria-label": "Experiment width", "data-tab": "Experiment", title: "Drag to resize · double-click to fold · F folds both" });
    els.hsplit = h("div", { class: "wt-split h", role: "separator", tabindex: 0, "aria-orientation": "horizontal", "aria-label": "Chart height", "data-tab": "Charts", title: "Drag to resize · double-click to fold · F folds both" });
    els.right = h("div", { class: "wt-right" }, els.stage, els.hsplit, els.charts);
    els.body = h("div", { class: "wt-body" }, els.brief, els.vsplit, els.right);
    main.append(els.bar, els.body, els.handle);
    splitter(els.vsplit, "v");
    splitter(els.hsplit, "h");
    applyLay();
    ro.disconnect();
    ro.observe(els.stage);
    ro.observe(els.charts);
    tagEls = new Map();
    codeOpen = matchMedia("(max-width: 860px)").matches || SHOT ? false : codeOpen;
    buildCharts();
    renderBrief();
    wireStage();
    renderParts();
    renderCode();
    updateBar();
    resize();
  }
  // ------------------------------------------------------------- layout --
  // The brief, the stage and the charts share the window. Drag the seams between them; double-click one to fold its
  // side away (a tab stays on the edge to bring it back), or press F to fold both and give the system the room.
  // Remembered per browser.
  const LAY_KEY = "wt-layout-v1";
  const lay = (() => { try { return JSON.parse(localStorage.getItem(LAY_KEY) || "{}"); } catch (e) { return {}; } })();
  const saveLay = () => { try { localStorage.setItem(LAY_KEY, JSON.stringify(lay)); } catch (e) { /* private mode */ } };
  function applyLay() {
    main.style.setProperty("--bw", lay.bw ? `${lay.bw}px` : null);
    main.style.setProperty("--chh", lay.chh ? `${lay.chh}px` : null);
    main.classList.toggle("brief-off", !!lay.bf);
    main.classList.toggle("charts-off", !!lay.cf);
    if (els.vsplit) { els.vsplit.classList.toggle("folded", !!lay.bf); els.hsplit.classList.toggle("folded", !!lay.cf); }
  }
  function setLay(patch) { Object.assign(lay, patch); applyLay(); }
  let rq = 0;
  const ro = new ResizeObserver(() => { if (!rq) rq = requestAnimationFrame(() => { rq = 0; if (main.isConnected && X) resize(); }); });
  function splitter(el, ax) {
    const fold = ax === "v" ? "bf" : "cf";
    el.addEventListener("pointerdown", (e) => {
      if (e.button) return;
      const box = (ax === "v" ? els.body : els.right).getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
      let moved = false;
      el.setPointerCapture(e.pointerId);
      el.classList.add("drag");
      main.classList.add("resizing");
      el.onpointermove = (ev) => {
        if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
        moved = true;
        if (ax === "v") { const w = ev.clientX - box.left; setLay(w < 190 ? { bf: true } : { bf: false, bw: Math.round(Math.max(260, Math.min(w, 640, box.width * 0.55))) }); }
        else { const hh = box.bottom - ev.clientY; setLay(hh < 80 ? { cf: true } : { cf: false, chh: Math.round(Math.max(120, Math.min(hh, box.height - 180))) }); }
      };
      el.onpointerup = el.onpointercancel = () => {
        el.onpointermove = el.onpointerup = el.onpointercancel = null;
        el.classList.remove("drag");
        main.classList.remove("resizing");
        if (!moved && lay[fold]) setLay({ [fold]: false }); // a click on a folded side's tab opens it
        saveLay();
      };
      e.preventDefault();
    });
    el.addEventListener("dblclick", () => { setLay({ [fold]: !lay[fold] }); saveLay(); });
    el.addEventListener("keydown", (e) => {
      const k = e.key, cur = ax === "v" ? els.brief.getBoundingClientRect().width : els.charts.getBoundingClientRect().height;
      const grow = ax === "v" ? k === "ArrowRight" : k === "ArrowUp", shrink = ax === "v" ? k === "ArrowLeft" : k === "ArrowDown";
      if (k === "Enter" || k === " ") setLay({ [fold]: !lay[fold] });
      else if (grow || shrink) setLay(ax === "v" ? { bf: false, bw: Math.round(Math.max(260, Math.min(640, cur + (grow ? 24 : -24)))) } : { cf: false, chh: Math.round(Math.max(120, cur + (grow ? 24 : -24))) });
      else return;
      saveLay();
      e.preventDefault();
      e.stopPropagation();
    });
  }
  function focusStage() {
    const both = lay.bf && lay.cf;
    setLay({ bf: !both, cf: !both });
    saveLay();
  }

  function togglePause() { if (paused && live) branch(); paused = !paused; updateBar(); }
  function cycleSpeed() { const i = SPEEDS.findIndex((s) => s[0] === speed); speed = SPEEDS[(i + 1) % SPEEDS.length][0]; updateBar(); }
  function updateBar() {
    els.pause.textContent = paused ? (live ? "▶ play from here" : "▶ play") : "❚❚ pause";
    els.clock.classList.toggle("rew", !!live);
    // say how to rewind while paused, and what play will do once rewound
    if (paused) els.hint.textContent = live ? `Rewound to ${clock(sim.t).slice(2)}. Play carries on from here; the faint part of each timeline is dropped.` : "Paused. Drag back along a timeline, or press ←, to rewind.";
    else if (/^(Paused|Rewound)/.test(els.hint.textContent)) els.hint.textContent = "";
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
      // the problem comes first, the way it would at work; it turns green once you've fixed it
      X.incident ? h("div", { class: "wt-inc" + (P.phase === "done" ? " fixed" : "") }, h("p", { class: "wt-inc-h" }, h("i"), P.phase === "done" ? "Fixed" : "The problem"), h("p", { html: X.incident })) : null,
      h("p", { class: "wt-lede", html: X.brief }));
    const step = (k, n, title, body, folded) => h("section", { class: `wt-step ${at > k ? "past" : at === k ? "now" : "next"}` },
      h("h2", {}, h("span", { class: "n" }, at > k ? "✓" : String(n)), title, folded ? h("em", { html: folded }) : null),
      at >= k ? body() : null);
    b.append(
      step(0, 1, "Predict", predictBody, P.guess != null && at > 0 ? `you said ${fmtAxis(P.guess)}` : ""),
      step(1, 2, "Push it", exploreBody),
      step(2, 3, X.task.title, taskBody, at > 2 ? "done" : ""));
    if (HOME[X.id]) b.append(step(3, 4, "Take it home", homeBody));
    main.classList.toggle("home-on", P.phase === "done" && !!HOME[X.id]);
    els.handle.querySelector("span").textContent = P.phase === "predict" ? "1 · Predict" : P.phase === "explore" ? "2 · Push it" : P.phase === "done" && HOME[X.id] ? "4 · Take it home" : `3 · ${X.task.title}`;
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
    if (locked && (P.revealed || inTask())) track.append(h("span", { class: "ans", style: `left:${toF(a, X.predict.answer) * 100}%`, title: `about ${X.predict.answer}` }));
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
      const [lo, hi] = X.predict.words || ["It held more than you thought.", "It broke sooner than you thought."];
      verdict = d <= X.predict.tol ? "Spot on." : d <= X.predict.tol * 2 ? "Close." : (g < A ? lo : hi);
    }
    wrap.append(
      h("div", { class: "cmp" }, h("span", {}, "you said ", h("b", {}, fmtAxis(g))), h("span", {}, X.predict.said ? X.predict.said + " " : X.predict.axis && !X.predict.bend ? "it needs " : "it bends at ", h("b", {}, `≈ ${fmtAxis(A)}`)), h("strong", {}, verdict)),
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
  const taskHint = () => `The crowd is fixed for the task. ${X.task.knobs.includes("hotSplit") ? "Click the router to spread the ★ account over more shards." : X.task.knobs.includes("ryw") ? "Click the router to choose where a writer's own reads go; drag replicas on from the right." : X.task.knobs.includes("limit") ? "Drag the rate limiter on, then click it to set the rate and the burst." : X.task.knobs.includes("jobWorkers") ? `Drag the email queue on, or click the ${name("server")} or the mailer to change their workers.` : X.task.knobs.includes("servers") ? "Drag a server on, or click a part to change it." : X.clients ? `Click the ${name("server")} or the clients to change them.` : `Click the ${X.task.knobs.includes("cache") ? "cache" : name("server")} to change it.`}`;

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

  // Take it home: the fix as code with your own numbers, the config a real server reads, what to watch in production,
  // and where your language changes the picture. Each file's name is a tab; tools/tunnel-check.js runs the code.
  let homeFile = 0;
  function homeBody() {
    const H = HOME[X.id], c = { ...window.WTSim.DEFAULTS, ...startCfg(), ...(P.final || X.task.reference) };
    const wrap = h("div", { class: "wt-sb wt-home" });
    wrap.append(h("p", {}, "What you just did, the way you'll meet it outside the tunnel. The numbers are yours, from system.yaml."));
    const file = h("figure", { class: "wt-file" });
    const draw = () => {
      homeFile = Math.min(homeFile, H.files.length - 1);
      const f = H.files[homeFile], src = f.src(c);
      file.innerHTML = "";
      file.append(
        h("figcaption", {}, H.files.map((F, i) => h("button", { class: i === homeFile ? "on" : "", "aria-pressed": String(i === homeFile), onclick: () => { homeFile = i; draw(); } }, F.name)),
          h("span", { class: "grow" }),
          h("button", { class: "f-copy", title: "Copy this file", onclick: (e) => { if (navigator.clipboard) navigator.clipboard.writeText(src); e.currentTarget.textContent = "copied"; } }, "copy")),
        h("pre", { html: hlCode(src, f.lang) }),
        f.run ? h("p", { class: "f-note" }, "Runs as it is with python3. The → lines are what it prints.") : null);
    };
    draw();
    wrap.append(file,
      h("h3", {}, "Watch it in production"), h("p", { html: H.watch(c) }),
      h("h3", {}, "Where your stack changes it"),
      h("dl", { class: "wt-stack" }, H.stack.flatMap(([k, v]) => [h("dt", {}, k), h("dd", { html: v })])));
    return wrap;
  }
  // a small highlighter for the take-home files: Python, YAML, and nginx or redis config
  const PYKW = new Set("def class return import from for in if else elif try except while True False None and or not with as continue global lambda async await".split(" "));
  function hlCode(src, lang) {
    const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return src.split("\n").map((line) => {
      if (line.startsWith("# → ")) return `<span class="t-out">${esc(line.slice(2))}</span>`;
      let out = "", m, first = true, prev = "";
      const re = /(#.*$)|([fr]?"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d[\d_.]*[a-z]*\b)|([A-Za-z_][\w.-]*)|(\s+)|([\s\S])/g;
      while ((m = re.exec(line))) {
        const [t, com, str, numb, word] = m;
        if (com) out += `<i class="t-c">${esc(com)}</i>`;
        else if (str) out += `<i class="t-s">${esc(str)}</i>`;
        else if (numb) out += `<i class="t-n">${esc(numb)}</i>`;
        else if (word) {
          const key = lang === "yaml" ? line[m.index + t.length] === ":" : lang === "conf" ? first : PYKW.has(t);
          out += key ? `<i class="t-k">${esc(t)}</i>` : prev === "def" || prev === "class" ? `<i class="t-f">${esc(t)}</i>` : esc(t);
          first = false;
          prev = t;
        } else out += esc(t);
      }
      return out;
    }).join("\n");
  }

  // the task's goal, checked every simulated second over the last 30 s once the design hasn't changed for that long
  function checkGoal(quiet) {
    if (!inTask() || !els.goal || !sim) return;
    const W = X.task.window || WINDOW, t = sim.t, since = t - lastSysChange, full = since >= W;
    const st = sim.stats(Math.max(lastSysChange, t - W), t);
    const rows = X.task.goal.map((g) => {
      const [k, op, v] = g, x = k in st ? st[k] : sim.cfg[k];
      const ok = op === "<" ? x < v : op === "<=" ? x <= v : op === "==" ? x === v : op === ">" ? x > v : x >= v;
      return { k, ok, x };
    });
    for (const r of rows) {
      const li = els.goal.querySelector(`[data-k="${r.k}"]`);
      li.classList.toggle("ok", r.ok);
      li.querySelector("b").textContent = r.k === "stale" ? `${num(r.x)} in ${W} s` : r.k === "nTput" ? `${Math.round(r.x)}/s` : r.k === "p99" || r.k === "jobAge" ? ms(r.x) : r.k === "cache" ? `${num(r.x)} keys` : r.k === "errors" && st.span ? `${num(r.x)} (${Math.round(st.errRate * 100)}%)` : num(r.x);
    }
    const all = rows.every((r) => r.ok);
    els.meter.querySelector(".fill").style.width = `${Math.min(1, since / W) * 100}%`;
    els.meter.classList.toggle("ok", all && full);
    els.meter.querySelector("em").textContent = P.phase === "done" ? "met" : full ? (all ? `met for ${W} s` : `measuring the last ${W} s`) : `steady for ${Math.floor(since)} of ${W} s${speed < 10 ? " · ×10 to fast-forward" : ""}`;
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
    if (c.far > 0) {
      L.push([0, "users"]);
      kv("far_away", `${c.far}%`, `${ms(c.rtt)} round trip`);
      kv("nearby", `${100 - c.far}%`, `${ms(c.nearRtt)} round trip`);
      L.push([0, "page"]);
      kv("api_round_trips", String(c.api), `to the ${name("server")}`);
      kv("file_round_trips", String(c.trips), "one after another");
      kv("files_from", c.cdn ? "cdn_edge" : "origin", c.cdn ? `${ms(c.edgeRtt)} away` : "across the ocean");
    }
    if (c.shards > 0) {
      kv("viral_account", `${c.hot}%`, "of all requests");
      L.push([0, "sharding"]);
      kv("shards", String(c.shards));
      kv("by", "hash(account)", "a ring cut in equal arcs");
      kv("viral_copies", String(c.hotSplit), c.hotSplit > 1 ? "on the next shards" : "one shard holds it");
    }
    if (c.writes > 0) {
      kv("writes", `${Math.round(c.writes * 100)}%`, "the rest are reads");
      kv("read_back_after", `${c.readAfter}s`, "a writer checks their post");
      L.push([0, "replication"]);
      kv("primary", "1", "takes every write");
      kv("read_replicas", String(c.replicas));
      kv("replication_lag", `${c.lag}s`, "average");
      kv("read_your_writes", c.ryw ? `primary for ${c.rywFor}s` : "off");
    }
    if (X.bot) {
      kv("customers", num(c.tenants), "about 1/s each");
      L.push([0, "script"]);
      kv("arrivals", `${num(c.noisy)}/s`, "one customer");
    }
    if (c.limit > 0) {
      L.push([0, "rate_limit"]);
      kv("per", "customer");
      kv("rate", `${num(c.limit)}/s`);
      kv("burst", num(c.burst));
      kv("when_empty", "429", "Too Many Requests");
    }
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
    if (knobs().has("queueMax")) kv("queue_limit", num(c.queueMax), c.queueMax ? `${ms(c.queueMax / (c.workers / c.service))} of work` : "");
    if (knobs().has("cancel")) kv("when_client_leaves", c.cancel ? "drop_request" : "serve_anyway");
    L.push([0, "clients"]);
    kv("timeout", `${c.timeout}s`);
    if (X.clients) {
      kv("retries", String(c.retries));
      kv("backoff", c.backoff ? `${c.backoff}s` : "none", c.backoff ? (c.jitter ? "doubling, jittered" : "doubling") : "retry at once");
    }
    if (c.batch) {
      L.push([0, "newsletter"]);
      kv("every", `${c.batch.every}s`);
      kv("emails", num(c.batch.n), "all at once");
      kv("per_email", `${Math.round(c.batch.service * 1000)}ms`);
      kv("sent_by", c.jobWorkers > 0 ? "email_queue" : name("server"), c.jobWorkers > 0 ? "" : "with the pages");
      if (c.jobWorkers > 0) {
        L.push([0, "email_queue"]);
        kv("workers", String(c.jobWorkers));
        kv("drains_a_batch_in", ms(c.batch.n * c.batch.service / c.jobWorkers));
      }
    }
    if (c.surge) { L.push([0, "surge"]); kv("at", clock(c.surge.at).slice(2)); kv("for", `${c.surge.for}s`); kv("arrivals", `${num(c.surge.rate)}/s`); }
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
  const iso = (x, y, z) => [V.ox + (x - y) * V.u * c30, V.oy + (x + y) * V.u * 0.5 - z * V.u];

  // Where every part stands, from the system as it is (or would be, with `over` applied, for a ghost's slot).
  // World units: x runs right-down, y left-down, z up. The crowd stands on 0..8 × 0..7; the wire runs along y ≈ 3.
  function layout(over) {
    const c = { ...sim.cfg, ...(over || {}) };
    const n = over && over.servers ? over.servers : over && over.shards ? over.shards : over && over.replicas !== undefined && c.writes > 0 ? 1 + over.replicas : sim.srv.length;
    const L = { crowd: { x: 0, y: 0, w: 7.8, d: 6.9, h: 1 }, wy: 2.7, servers: [], queues: [] };
    let x = 8.4;
    if (X.bot) { L.bot = { x: 8.1, y: 4.7, w: 1.5, d: 1.5, h: 1.45 }; x += 1.9; }
    if (c.far > 0) {
      if (c.cdn) L.cdn = { x: x + 0.1, y: L.wy + 1.3, w: 1.5, d: 1.5, h: 1.05 };
      L.ocean = { x0: x + 2, x1: x + 7.4 };
      x += 8;
    }
    if (c.limit > 0) { L.limiter = { x: x + 0.3, y: L.wy - 0.7, w: 1.9, d: 1.9, h: 0.75 }; x += 2.9; }
    // a sharded system's router carries the hash ring: give it room clear of the crowd
    if (c.shards > 0) x += 2.4;
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
    // background jobs: the job that makes them sits in front, by the crowd; their queue and the mailer, when there's
    // one, stand in a row in front of the website
    if (c.batch) {
      const S = L.servers[L.servers.length - 1], sx = L.servers[0].x, yb = Math.max(5.2, S.y + S.d + 0.9);
      L.cron = { x: 7.9, y: yb + 2.2, w: 1.25, d: 1.25, h: 0.95 };
      if (c.jobWorkers > 0) {
        L.jq = { x: sx - 2.9, y: yb - 0.15, cols: 4, levels: 6 };
        L.mailer = { x: sx, y: yb, w: 3, d: 1.7, h: 1.1 };
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
    if (L.bot) box(L.bot, 1.4);
    if (L.limiter) box(L.limiter, 3.2);
    if (L.cache) box(L.cache, 1);
    if (L.cdn) box(L.cdn, 1);
    if (L.lb) box(L.lb, 1);
    // the hash ring floats over a sharded system's router
    if (L.lb && sim.cfg.shards > 0) { const cx = L.lb.x + L.lb.w / 2, cy = L.lb.y + L.lb.d / 2; box({ x: cx - 2.1, y: cy - 2.1, w: 4.2, d: 4.2, h: L.lb.h + 2.3 }); }
    L.servers.forEach((s) => box(s, 1.6));
    L.queues.forEach((q) => box({ x: q.x, y: q.y, w: q.cols * 0.5, d: q.cols * 0.5, h: Math.min(q.levels * 0.3, 2) }));
    if (L.cron) box(L.cron, 1);
    if (L.jq) box({ x: L.jq.x, y: L.jq.y, w: 2, d: 2, h: 1.5 });
    if (L.mailer) box(L.mailer, 1);
    // room on the right for a column of server labels; on the left for system.yaml, minus what the crowd's empty
    // top-left corner can share with it
    const left = codeOpen && !SHOT ? Math.max(12, Math.min(els.code.offsetWidth * 0.75 + 20, cw - 520)) : 12, right = L.servers.length > 1 ? 110 : 70;
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
    if (SHOT) return { ...themeOf(true), grid: "transparent", ground: "rgba(0,0,0,.22)", wire: "rgba(255,255,255,.16)", pad: "rgba(0,0,0,.28)" };
    return themeOf(document.documentElement.dataset.theme !== "light");
  }
  function themeOf(dark) {
    return dark
      ? { bg: "#0b1418", grid: "rgba(95,224,240,.07)", ground: "#10232a", wire: "#1c3a44", text: "#a9d6de", mute: "#5f8a93", q: "#ffc94a", hot: "#ff5a4f", ok: "#5fe0a0", bad: "#ff5a6e", req: "#ffe08a", pad: "#0e2a31", smoke: "120,140,148", cache: "#c7a2ff", lb: "#86b4ff", ghost: "rgb(95,224,240)", spark: "#ffb347", lit: "#5fe0a0", job: "#ff8a5c", mailer: "#3e6f8c", lim: "#5fd4b0" }
      : { bg: "#f2f6f5", grid: "rgba(16,90,104,.08)", ground: "#e3ecea", wire: "#c9dbd8", text: "#1d4a52", mute: "#6d8f95", q: "#e0a412", hot: "#e8453c", ok: "#1fa36a", bad: "#e23d55", req: "#e8a10f", pad: "#cfe2e0", smoke: "90,100,104", cache: "#9a6ce0", lb: "#4f7fd8", ghost: "rgb(15,139,160)", spark: "#f08a1c", lit: "#1fa36a", job: "#e2643a", mailer: "#7fa8c4", lim: "#2bab8a" };
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
    if (SHOT) ctx.clearRect(0, 0, cw, chh); else { ctx.fillStyle = T.bg; ctx.fillRect(0, 0, cw, chh); }
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
    if (LY.ocean) {
      const O = LY.ocean, dark = T.bg !== "#f2f6f5";
      poly([iso(O.x0, -3, 0), iso(O.x1, -3, 0), iso(O.x1, 9.5, 0), iso(O.x0, 9.5, 0)], dark ? "#0f3346" : "#bfe0ea");
      ctx.strokeStyle = dark ? "rgba(134,180,255,.38)" : "rgba(15,110,140,.32)"; ctx.lineWidth = 1.3;
      for (let k = 0; k < 10; k++) {
        const y = -2.4 + k * 1.2, x = O.x0 + 0.3 + (((k * 0.37 + (reduce ? 0 : t * 0.06)) % 1)) * (O.x1 - O.x0 - 1.4);
        const [a, b] = [iso(x, y, 0), iso(x + 0.9, y, 0)];
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 3, b[0], b[1]); ctx.stroke();
      }
    }
    const firstQ = LY.queues[0], S0 = LY.servers[0];
    const entry = LY.limiter ? LY.limiter.x : LY.cache ? LY.cache.x : LY.lb ? LY.lb.x : firstQ.x;
    strip(7.9, wy + 0.3, entry, wy + 0.3, 0.3, T.wire);
    if (LY.bot) { const bx = LY.bot.x + LY.bot.w / 2; strip(bx, LY.bot.y, bx, wy + 0.3, 0.2, T.wire); }
    if (LY.limiter) strip(LY.limiter.x + LY.limiter.w, wy + 0.3, LY.cache ? LY.cache.x : LY.lb ? LY.lb.x : firstQ.x, wy + 0.3, 0.3, T.wire);
    if (LY.cache) strip(LY.cache.x + LY.cache.w, wy + 0.3, LY.lb ? LY.lb.x : firstQ.x, wy + 0.3, 0.3, T.wire);
    if (LY.lb) LY.queues.forEach((q, i) => strip(LY.lb.x + LY.lb.w, wy + 0.3, q.x, LY.servers[i].y + LY.servers[i].d / 2, i === lastRoute ? 0.16 : 0.11, i === lastRoute && routeGlow > 0 ? mix(T.wire.startsWith("#") ? T.wire : "#1c3a44", T.req, routeGlow * 0.6) : T.wire));
    if (!LY.lb) strip(firstQ.x, wy + 0.3, S0.x, wy + 0.3, 0.3, T.wire);
    if (LY.cron) {
      const C = LY.cron, cy = C.y + C.d / 2;
      if (LY.jq) { const my = LY.mailer.y + LY.mailer.d / 2; strip(C.x + C.w, cy, LY.jq.x, my, 0.22, T.wire); strip(LY.jq.x + 2, my, LY.mailer.x, my, 0.22, T.wire); }
      else strip(C.x + C.w / 2, C.y, C.x + C.w / 2, wy + 0.3, 0.22, T.wire);
    }
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
    // the script: an orange box whose two eyes blink, sending its own stream down onto the wire
    if (LY.bot) {
      const B = LY.bot, on = reduce || Math.sin(t * 6) > -0.6;
      cube(B.x, B.y, 0, B.w, B.d, B.h, sim.cfg.noisy > 0 ? T.job : T.pad);
      for (const a of [0.3, 0.85]) poly([iso(B.x + a, B.y + B.d, B.h * 0.72), iso(B.x + a + 0.32, B.y + B.d, B.h * 0.72), iso(B.x + a + 0.32, B.y + B.d, B.h * 0.5), iso(B.x + a, B.y + B.d, B.h * 0.5)], on && sim.cfg.noisy > 0 ? T.req : T.pad);
      hits.push({ kind: "bot", r: rectOf(B) });
    }
    // the rate limiter: a block with the script's bucket on top, a token per lit pad; it empties as the script spends them
    if (LY.limiter) drawBucket(T, dt, t);
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
    // the CDN edge: a block on the crowd's side of the ocean, its top lit with the page's files
    if (LY.cdn) {
      const C = LY.cdn;
      strip(C.x + C.w / 2, wy + 0.3, C.x + C.w / 2, C.y, 0.16, T.wire);
      cube(C.x, C.y, 0, C.w, C.d, C.h, T.lim);
      for (let i = 0; i < 4; i++) { const a = i % 2, b = (i / 2) | 0, x = C.x + 0.2 + a * 0.6, y = C.y + 0.2 + b * 0.6; poly([iso(x, y, C.h), iso(x + 0.45, y, C.h), iso(x + 0.45, y + 0.45, C.h), iso(x, y + 0.45, C.h)], T.lit); }
      hits.push({ kind: "cdn", r: rectOf(C) });
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
    if (LY.lb && isShard()) drawRing(T, t);
    // queues and servers, back to front
    const order = LY.servers.map((s, i) => i).sort((a, b) => LY.servers[a].y - LY.servers[b].y);
    for (const i of order) drawServer(i, T, dt, t);
    if (LY.cron) drawJobs(T, t);
    // a ghost being dragged shows the slot it would fill
    if (ghostDrag && ghostDrag.slot) ghostBox(ghostDrag.slot, T.ghost);
    drawFlyers(T, dt);
    drawSparks(T, dt);
    placeTags();
  }
  // The rate limiter is a glass bucket you can watch. Tokens drip from a tap at the limit's pace (drawn up to 12 a
  // second, faster drips are sped-up stand-ins) and stack inside, at most the burst. The stack is the script's own
  // bucket: its flood takes them as fast as they land, and an empty bucket is a 429 bounced back down the wire.
  let drips = [], dripT = 0;
  function drawBucket(T, dt, t) {
    const B = LY.limiter, c = sim.cfg, gh = Math.min(2.6, 1.3 + c.burst * 0.03);
    cube(B.x, B.y, 0, B.w, B.d, B.h, T.lim);
    // the stack: one coin per token, in rows of four, as many as the script has left
    const have = Math.floor(sim.scriptTokens() * c.burst + 1e-9), shownN = Math.min(have, 40), rows = Math.ceil(c.burst / 4);
    const ch = Math.max(0.05, Math.min(0.16, (gh - 0.1) / Math.max(1, rows)));
    const gx = B.x + 0.2, gy = B.y + 0.2, gw = B.w - 0.4, gd = B.d - 0.4;
    for (let k = 0; k < shownN; k++) {
      const lvl = (k / 4) | 0, m = k % 4, a = m % 2, b = (m / 2) | 0;
      cube(gx + 0.08 + a * gw / 2, gy + 0.08 + b * gd / 2, B.h + lvl * ch, gw / 2 - 0.16, gd / 2 - 0.16, ch * 0.8, T.q);
    }
    // drips: a token falls from the tap into the glass
    if (!paused && !reduce) {
      dripT += dt * speed * Math.min(c.limit, 12);
      while (dripT >= 1 && drips.length < 30) { dripT -= 1; drips.push({ age: 0 }); }
      dripT = Math.min(dripT, 1);
    }
    const tapZ = B.h + gh + 0.9, top = B.h + Math.max(ch, Math.ceil(shownN / 4) * ch);
    drips = drips.filter((d) => (d.age += dt * Math.max(1, Math.min(speed, 3))) < 0.5);
    for (const d of drips) { const f = d.age / 0.5, z = tapZ - (tapZ - top) * f * f; cube(B.x + B.w / 2 - 0.1, B.y + B.d / 2 - 0.1, z, 0.2, 0.2, 0.1, T.q, 1 - f * 0.3); }
    // the tap: a short arm over the glass
    cube(B.x + B.w / 2 - 0.12, B.y + B.d / 2 - 0.12, tapZ, 0.24, 0.24, 0.18, T.lim);
    cube(B.x + B.w / 2 - 0.08, B.y - 0.25, tapZ + 0.08, 0.16, B.d / 2 + 0.25, 0.12, T.lim);
    // the glass: its four edges and a faint tint, drawn over the coins
    ctx.save();
    ctx.globalAlpha = 0.75; ctx.lineWidth = 1.6; ctx.strokeStyle = T.text;
    const z0 = B.h, z1 = B.h + gh, P = (x, y, z) => iso(x, y, z);
    const corners = [[gx, gy], [gx + gw, gy], [gx + gw, gy + gd], [gx, gy + gd]];
    for (const [x, y] of corners) { const [a1, b1] = P(x, y, z0), [a2, b2] = P(x, y, z1); ctx.beginPath(); ctx.moveTo(a1, b1); ctx.lineTo(a2, b2); ctx.stroke(); }
    ctx.beginPath(); corners.forEach(([x, y], i) => { const [a, b] = P(x, y, z1); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.closePath(); ctx.stroke();
    ctx.globalAlpha = 0.12; ctx.fillStyle = T.text;
    poly([P(gx, gy + gd, z1), P(gx + gw, gy + gd, z1), P(gx + gw, gy + gd, z0), P(gx, gy + gd, z0)], T.text);
    ctx.restore();
    // empty: the glass flashes red, which is the moment a 429 goes back
    if (!have && c.noisy > 0 && (reduce || Math.sin(t * 10) > 0)) {
      ctx.save(); ctx.globalAlpha = 0.18;
      poly([P(gx, gy, z0 + 0.02), P(gx + gw, gy, z0 + 0.02), P(gx + gw, gy + gd, z0 + 0.02), P(gx, gy + gd, z0 + 0.02)], T.bad);
      ctx.restore();
    }
    hits.push({ kind: "limiter", r: rectOf({ ...B, h: B.h + gh }) });
  }
  // The hash ring over the router: a circle cut into one arc per shard, in each shard's colour. Every account hashes to a
  // point on it and belongs to the arc it lands in. The viral account is a gold star; when it's spread, the arcs that
  // hold its copies get a gold rim.
  function drawRing(T, t) {
    const B = LY.lb, n = sim.srv.length, cx = B.x + B.w / 2, cy = B.y + B.d / 2, z = B.h + 2.1, R = 1.6;
    const at = (f, r = R) => iso(cx + Math.cos(f * Math.PI * 2) * r, cy + Math.sin(f * Math.PI * 2) * r, z);
    const pos = window.WTSim.ringPos(0), home = Math.min(n - 1, Math.floor(pos * n)), split = Math.min(sim.cfg.hotSplit || 1, n);
    // a thin stalk down to the router
    const [s0, s1] = [iso(cx, cy, B.h), iso(cx, cy, z)];
    ctx.strokeStyle = T.mute; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); ctx.stroke();
    for (let k = 0; k < n; k++) {
      const copy = sim.cfg.hot > 0 && ((k - home + n) % n) < split;
      ctx.lineCap = "butt";
      if (copy) { ctx.strokeStyle = "#ffd21f"; ctx.lineWidth = V.u * 0.42; ctx.beginPath(); for (let j = 0; j <= 16; j++) { const [a, b] = at((k + 0.04 + (j / 16) * 0.92) / n); j ? ctx.lineTo(a, b) : ctx.moveTo(a, b); } ctx.stroke(); }
      ctx.strokeStyle = ARC[k % ARC.length]; ctx.lineWidth = V.u * 0.26;
      ctx.beginPath(); for (let j = 0; j <= 16; j++) { const [a, b] = at((k + 0.04 + (j / 16) * 0.92) / n); j ? ctx.lineTo(a, b) : ctx.moveTo(a, b); } ctx.stroke();
    }
    // a few ordinary accounts as specks, and the viral one as a star that pulses
    for (let a = 1; a <= 24; a++) { const [p, q] = at(window.WTSim.ringPos(a), R + 0.32); ctx.fillStyle = T.mute; ctx.fillRect(p - 1.5, q - 1.5, 3, 3); }
    if (sim.cfg.hot > 0) {
      const [p, q] = at(pos, R + 0.4), r = V.u * (0.26 + (reduce ? 0 : Math.sin(t * 5) * 0.05));
      ctx.fillStyle = "#ffd21f"; ctx.strokeStyle = "#a07800"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let j = 0; j < 10; j++) { const a = -Math.PI / 2 + (j * Math.PI) / 5, rr = j % 2 ? r * 0.45 : r; j ? ctx.lineTo(p + Math.cos(a) * rr, q + Math.sin(a) * rr) : ctx.moveTo(p + Math.cos(a) * rr, q + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  function drawServer(i, T, dt, t) {
    const B = LY.servers[i], Q = LY.queues[i], srv = sim.srv[i];
    if (!srv) return;
    const W = sim.cfg.workers, qn = srv.queue.length;
    // the queue tower
    const per = Q.cols * Q.cols, shownQ = Math.min(qn, per * Q.levels), qcol = qn > W * 6 ? T.hot : T.q;
    for (let k = 0; k < shownQ; k++) {
      const lvl = (k / per) | 0, m = k % per, a = m % Q.cols, b = (m / Q.cols) | 0;
      cube(Q.x + a * 0.5, Q.y + b * 0.5, lvl * 0.3, 0.44, 0.44, 0.26, srv.queue[k].job ? T.job : qcol);
    }
    // overload, 0..1, eased: how far past "busy" this server is. It drives the heat, the shake, smoke and beacon
    const u = srv.busy.length / Math.max(1, W), over = Math.min(1, qn / (W * 8));
    heatOf[i] = (heatOf[i] || 0) + ((u * 0.6 + over * 0.4) - (heatOf[i] || 0)) * Math.min(1, dt * 3);
    boomOf[i] = (boomOf[i] || 0) + (over - (boomOf[i] || 0)) * Math.min(1, dt * 2);
    const hot = heatOf[i], boom = boomOf[i];
    const shake = reduce ? 0 : boom > 0.35 ? Math.sin(t * 53 + i * 2) * 0.05 * boom : 0;
    const x = B.x + shake, gone = srv.gone;
    cube(x, B.y, 0, B.w, B.d, B.h, gone ? T.pad : heat(Math.max(0, (hot - 0.45) / 0.55)), gone ? 0.5 : 1);
    // a database: disk lines on the front face; the primary's top edge is purple, so you can tell it from a replica
    if (isDb() && !gone) {
      for (const f of [0.3, 0.55, 0.8]) poly([iso(x, B.y + B.d, B.h * f), iso(x + B.w, B.y + B.d, B.h * f), iso(x + B.w, B.y + B.d, B.h * f - 0.05), iso(x, B.y + B.d, B.h * f - 0.05)], "rgba(0,0,0,.28)");
      if (i === 0) poly([iso(x, B.y + B.d, B.h), iso(x + B.w, B.y + B.d, B.h), iso(x + B.w, B.y + B.d, B.h * 0.88), iso(x, B.y + B.d, B.h * 0.88)], T.cache);
    }
    if (isShard() && !gone) poly([iso(x, B.y + B.d, B.h), iso(x + B.w, B.y + B.d, B.h), iso(x + B.w, B.y + B.d, B.h * 0.84), iso(x, B.y + B.d, B.h * 0.84)], ARC[i % ARC.length]);
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
        cube(px + pw * 0.36 - s / 2, py + pd * 0.36 - s / 2, B.h, s, s, 0.2 + 0.5 * left, q.job ? T.job : T.req);
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
  // the newsletter job, a clock on top that fills until the next batch; its queue of emails, and the mailer
  function drawJobs(T, t) {
    const C = LY.cron, B = sim.cfg.batch, bs = sim.batches, last = bs.length ? bs[bs.length - 1].t : B.at - B.every;
    const since = sim.t - last, frac = Math.max(0, Math.min(1, since / B.every)), flash = bs.length && since < 1.2;
    cube(C.x, C.y, 0, C.w, C.d, C.h, T.job);
    for (let k = 0; k < 16; k++) {
      const a = k % 4, b = (k / 4) | 0, x = C.x + 0.1 + a * 0.29, y = C.y + 0.1 + b * 0.29;
      poly([iso(x, y, C.h), iso(x + 0.22, y, C.h), iso(x + 0.22, y + 0.22, C.h), iso(x, y + 0.22, C.h)], flash || k < Math.round(frac * 16) ? T.req : T.pad);
    }
    hits.push({ kind: "cron", r: rectOf(C) });
    if (!LY.jq) return;
    const Q = LY.jq, n = sim.jobQ.length, per = Q.cols * Q.cols, shown = Math.min(n, per * Q.levels);
    for (let k = 0; k < shown; k++) {
      const lvl = (k / per) | 0, m = k % per, a = m % Q.cols, b = (m / Q.cols) | 0;
      cube(Q.x + a * 0.5, Q.y + b * 0.5, lvl * 0.2, 0.44, 0.44, 0.16, T.job);
    }
    const M = LY.mailer, W = sim.cfg.jobWorkers;
    cube(M.x, M.y, 0, M.w, M.d, M.h, T.mailer);
    const gc = Math.ceil(Math.sqrt(W * M.w / M.d)), gr = Math.ceil(W / gc), pw = M.w / gc, pd = M.d / gr;
    for (let k = 0; k < W; k++) {
      const c = k % gc, r = (k / gc) | 0, px = M.x + c * pw + pw * 0.14, py = M.y + r * pd + pd * 0.14;
      poly([iso(px, py, M.h), iso(px + pw * 0.72, py, M.h), iso(px + pw * 0.72, py + pd * 0.72, M.h), iso(px, py + pd * 0.72, M.h)], T.pad);
      const q = sim.jobBusy[k];
      if (q) {
        const left = q.end > q.began ? Math.max(0, Math.min(1, (q.end - sim.t) / (q.end - q.began))) : 0, s = Math.min(pw, pd) * 0.5;
        cube(px + pw * 0.36 - s / 2, py + pd * 0.36 - s / 2, M.h, s, s, 0.12 + 0.3 * left, T.job);
      }
    }
    hits.push({ kind: "mailer", r: rectOf(M) });
  }
  // a request's trip, as a path of floor points: crowd → (cache) → (balancer) → its queue
  function pathIn(srvI, noisy) {
    const wy = LY.wy + 0.3, p = noisy && LY.bot ? [[LY.bot.x + LY.bot.w / 2, LY.bot.y], [LY.bot.x + LY.bot.w / 2, wy]] : [[7.9, wy]];
    if (LY.limiter) p.push([LY.limiter.x, wy]);
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
      if (f.kind === "in") { const [x, y] = along(pathIn(f.srv, f.noisy), p); cube(x, y - 0.12 + f.lane * 0.24, 0.05, 0.26, 0.26, 0.22, f.noisy ? T.job : f.tint === "w" ? T.cache : f.tint === "r" ? "#ff6fb5" : f.tint === "h" ? "#ffd21f" : T.req); }
      else if (f.kind === "repl") {
        // a write copied from the primary to a replica: it arrives after the lag
        const A = LY.servers[0], B = LY.servers[Math.min(f.to, LY.servers.length - 1)]; if (!A || !B || f.to < 1) continue;
        const x = A.x + A.w * 0.5 + (B.x - A.x) * p, y = A.y + A.d + (B.y - A.y - A.d) * p;
        cube(x, y, A.h * 0.5 + Math.sin(p * Math.PI) * 0.7, 0.2, 0.2, 0.18, T.cache, 0.9);
      } else if (f.kind === "stale") {
        // a writer who can't see their own comment: a red "!" rises off the replica that answered them
        const B = LY.servers[Math.min(f.srv, LY.servers.length - 1)]; if (!B) continue;
        const [sx, sy] = iso(B.x + B.w * 0.5, B.y + B.d * 0.5, B.h + 0.4 + p * 1.6);
        ctx.globalAlpha = 1 - p * 0.7; ctx.fillStyle = T.bad; ctx.beginPath(); ctx.arc(sx, sy, V.u * 0.32, 0, 7); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = `700 ${Math.round(V.u * 0.42)}px IBM Plex Mono, monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("!", sx, sy + 1);
        ctx.globalAlpha = 1;
      }
      else if (f.kind === "lim") {
        // to the limiter, and bounced straight back as a red 429
        const B = LY.limiter; if (!B) continue;
        const go = p < 0.5, k = go ? p * 2 : (1 - p) * 2;
        const [x0, y0] = f.noisy && LY.bot ? [LY.bot.x + LY.bot.w / 2, LY.wy + 0.3] : [7.9, LY.wy + 0.3];
        const x = x0 + (B.x - x0) * k, y = y0 + (go ? -0.1 : -0.55) + f.lane * 0.2;
        cube(x, y, 0.05 + (go ? 0 : Math.sin(k * Math.PI) * 0.6), 0.22, 0.22, 0.2, go ? (f.noisy ? T.job : T.req) : T.bad);
      }
      else if (f.kind === "hit") {
        // to the cache and straight back home, green
        const C = LY.cache; if (!C) continue;
        const go = p < 0.5, k = go ? p * 2 : (1 - p) * 2, x = 7.9 + (C.x - 7.9) * k, y = LY.wy + 0.3 + (go ? -0.1 : -0.5) + f.lane * 0.2;
        cube(x, y, 0.05 + (go ? 0 : Math.sin(k * Math.PI) * 0.5), 0.22, 0.22, 0.2, go ? T.req : T.ok);
      } else if (f.kind === "job") {
        // a batch on its way: to its own queue, or up onto the website's wire
        if (f.age < 0 || !LY.cron) continue;
        const C = LY.cron, cy = C.y + C.d / 2, path = LY.jq ? [[C.x + C.w, cy], [LY.jq.x - 0.1, LY.mailer.y + LY.mailer.d / 2]] : [[C.x + C.w / 2, C.y], [C.x + C.w / 2, LY.wy + 0.3], [LY.queues[0].x - 0.1, LY.wy + 0.3]];
        const [x, y] = along(path, p);
        cube(x - 0.11, y - 0.2 + f.lane * 0.4, 0.05, 0.3, 0.3, 0.16, T.job);
      } else if (f.kind === "sent") {
        // an email leaving for the world, off the back of whoever sent it
        const M = f.srv < 0 && LY.mailer ? LY.mailer : LY.servers[Math.max(0, Math.min(f.srv, LY.servers.length - 1))];
        const x0 = M.x + M.w, y0 = M.y + M.d * (0.2 + f.lane * 0.6);
        cube(x0 + p * 2.2, y0 - p * 0.6, M.h * 0.6 + Math.sin(p * Math.PI) * 0.8, 0.26, 0.26, 0.12, T.job, 1 - p * 0.8);
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
    setHTML(els.crowd, `<b>${fmtLoad(loadNow())}</b><small>${surging() ? "surge" : inTask() ? "fixed for the task" : "drag ↕"}</small>`);
    els.crowd.classList.toggle("surge", surging());
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
      setHTML(el, srv.gone ? `${many ? (isDb() ? dbName(i) : i + 1) : name("server")} <small>leaving</small>` : many
        ? `<span${isShard() ? ` style="color:${ARC[i % ARC.length]}"` : ""}>${isDb() ? (i ? "R" + i : "P") : isShard() ? "shard " + (i + 1) : i + 1}</span> <b>${srv.busy.length}/${sim.cfg.workers}</b>${slow}`
        : `${name("server")} <b>${srv.busy.length}/${sim.cfg.workers}</b> busy${drown ? " <i>drowning</i>" : ""}`);
      const Q = LY.queues[i], qn = srv.queue.length;
      const qt = tag("q" + i, "wt-queue");
      const [qx, qy] = iso(Q.x + Q.cols * 0.25, Q.y + Q.cols * 0.25, Math.min(Q.levels, Math.ceil(qn / (Q.cols * Q.cols))) * 0.3 + 0.55);
      qt.style.transform = `translate(${qx}px, ${qy}px)`;
      const jn = sim.cfg.batch ? srv.queue.reduce((a, q) => a + (q.job ? 1 : 0), 0) : 0;
      setHTML(qt, qn ? (many ? `<b>${qn}</b>` : `queue <b>${num(qn)}</b>${jn ? ` · ${num(jn)} emails` : ""}`) : "");
    });
    if (LY.lb) {
      const el = tag("lb", "wt-lbtag", () => { if (isShard()) toggleInspect({ kind: "lb" }); else if (isDb()) { if (canTurn("ryw")) setKnob("ryw", !sim.cfg.ryw); else toggleInspect({ kind: "lb" }); } else if (canTurn("lb")) cycleLb(); else toggleInspect({ kind: "lb" }); });
      const [x, y] = iso(LY.lb.x + LY.lb.w * 0.5, LY.lb.y + LY.lb.d, 0);
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.classList.toggle("can", isShard() ? canTurn("hotSplit") || canTurn("hot") : isDb() ? canTurn("ryw") : canTurn("lb"));
      el.title = isDb() ? (canTurn("ryw") ? "Click to send a writer's own reads to the primary, or not" : "The router: writes to the primary, reads to the replicas") : canTurn("lb") ? "Click to change how the balancer picks" : "The load balancer";
      if (isShard()) setHTML(el, `<small>router</small><b>hash(account)</b>${sim.cfg.hot > 0 ? `<i>★ ${sim.cfg.hot}%${sim.cfg.hotSplit > 1 ? ` on ${Math.min(sim.cfg.hotSplit, sim.srv.length)}` : ""}</i>` : ""}`);
      else if (isDb()) setHTML(el, `<small>router</small><b>${sim.cfg.ryw ? "your writes: primary" : "reads: replicas"}</b>${canTurn("ryw") ? "<i>↻</i>" : ""}`);
      else setHTML(el, `<small>balancer</small><b>${LB[sim.cfg.lb][0]}</b>${canTurn("lb") ? "<i>↻</i>" : ""}`);
    }
    if (X.clients) {
      const el = tag("clients", "wt-cltag", () => toggleInspect({ kind: "clients" }));
      const [x, y] = iso(7.2, 7.4, 0);
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.classList.toggle("on", !!selected && selected.kind === "clients");
      const st = samples[samples.length - 1], storm = st && st.tries > st.offered * 1.3;
      el.classList.toggle("storm", !!storm);
      setHTML(el, `clients · retry <b>×${sim.cfg.retries}</b>${sim.cfg.backoff ? ` · backoff ${sim.cfg.backoff}s` : ""}${storm ? ` · <i>${Math.round(st.tries)} tries/s</i>` : ""}`);
    }
    if (LY.cron) {
      const C = LY.cron, B = sim.cfg.batch, bs = sim.batches, last = bs.length ? bs[bs.length - 1].t : B.at - B.every, next = last + B.every - sim.t;
      const el = tag("cron", "wt-ctag wt-jtag", () => toggleInspect({ kind: "cron" }));
      const [x, y] = iso(C.x + C.w * 0.5, C.y + C.d, 0);
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.classList.toggle("on", !!selected && selected.kind === "cron");
      el.classList.toggle("now", bs.length > 0 && sim.t - last < 2);
      setHTML(el, bs.length && sim.t - last < 2 ? `newsletter · <b>${num(B.n)} emails</b> landing` : `newsletter · <b>${num(B.n)}</b> in ${Math.ceil(next)} s`);
      if (LY.jq) {
        const Q = LY.jq, n = sim.jobQ.length, qt = tag("jq", "wt-queue wt-jq");
        const [qx, qy] = iso(Q.x + 1, Q.y + 1, Math.min(Q.levels, Math.ceil(n / 16)) * 0.2 + 1);
        qt.style.transform = `translate(${qx}px, ${qy}px)`;
        setHTML(qt, n ? `<b>${num(n)}</b> emails` : "");
        const M = LY.mailer, mt = tag("mailer", "wt-ctag", () => toggleInspect({ kind: "mailer" }));
        const [mx, my] = iso(M.x + M.w * 0.5, M.y + M.d, 0);
        mt.style.transform = `translate(${mx}px, ${my}px)`;
        mt.classList.toggle("on", !!selected && selected.kind === "mailer");
        setHTML(mt, `mailer <b>${sim.jobBusy.length}/${sim.cfg.jobWorkers}</b> busy`);
      }
    }
    if (LY.bot) {
      const el = tag("bot", "wt-ctag wt-jtag", () => toggleInspect({ kind: "bot" }));
      const [x, y] = iso(LY.bot.x + LY.bot.w * 0.5, LY.bot.y + LY.bot.d, 0);
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.classList.toggle("on", !!selected && selected.kind === "bot");
      const st = samples[samples.length - 1];
      setHTML(el, sim.cfg.noisy > 0 ? `script · <b>${num(sim.cfg.noisy)}/s</b>${st && sim.cfg.limit > 0 ? ` · ${num(st.n429)} 429s/s` : ""}` : "script · <b>off</b>");
    }
    if (LY.limiter) {
      const el = tag("limiter", "wt-ctag", () => toggleInspect({ kind: "limiter" }));
      const [x, y] = iso(LY.limiter.x + LY.limiter.w * 0.5, LY.limiter.y + LY.limiter.d, 0);
      el.title = "A token bucket per customer: the glass is the script's";
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.classList.toggle("on", !!selected && selected.kind === "limiter");
      const tk = Math.floor(sim.scriptTokens() * sim.cfg.burst + 1e-9);
      setHTML(el, `limit <b>${num(sim.cfg.limit)}/s</b> each · burst ${num(sim.cfg.burst)}${sim.cfg.noisy > 0 ? ` · <i>${tk ? `${tk} left` : "empty: 429"}</i>` : ""}`);
    }
    if (LY.cache) {
      const el = tag("cache", "wt-ctag", () => toggleInspect({ kind: "cache" }));
      const [x, y] = iso(LY.cache.x + LY.cache.w * 0.5, LY.cache.y + LY.cache.d, 0);
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.classList.toggle("on", !!selected && selected.kind === "cache");
      const st = samples[samples.length - 1];
      setHTML(el, `cache <b>${num(sim.cfg.cache)}</b>${st ? ` · ${Math.round(st.hit * 100)}% hits` : ""}`);
    }
    if (LY.ocean) {
      const O = LY.ocean, el = tag("ocean", "wt-ctag wt-otag");
      const [x, y] = iso((O.x0 + O.x1) / 2, LY.wy + 3.4, 0);
      el.style.transform = `translate(${x}px, ${y}px)`;
      setHTML(el, `ocean · <b>${ms(sim.cfg.rtt)}</b> there and back`);
      const pg = tag("page", "wt-cltag", () => toggleInspect({ kind: "page" }));
      const [gx, gy] = iso((O.x0 + O.x1) / 2, -2.2, 0);
      pg.style.transform = `translate(${gx}px, ${gy}px)`;
      pg.classList.toggle("on", !!selected && selected.kind === "page");
      setHTML(pg, `a page · <b>${sim.cfg.api + sim.cfg.trips}</b> round trips${sim.cfg.cdn && sim.cfg.trips ? ` · ${sim.cfg.trips} via CDN` : ""}`);
    }
    if (LY.cdn) {
      const el = tag("cdn", "wt-ctag", () => toggleInspect({ kind: "cdn" }));
      const [x, y] = iso(LY.cdn.x + LY.cdn.w * 0.5, LY.cdn.y + LY.cdn.d, 0);
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.classList.toggle("on", !!selected && selected.kind === "cdn");
      setHTML(el, `CDN edge · <b>${ms(sim.cfg.edgeRtt)}</b> away`);
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
    els.hint.textContent = inTask() ? taskHint() : X.hint || `Drag the crowd up or down to change the load. Click a part to look inside.${(X.parts || []).length ? " Drag a part on from the right." : ""}`;
  }
  function setLoad(v) {
    const { min, max, step } = X.crowd;
    v = Math.max(min, Math.min(max, Math.round(v / step) * step));
    if (v === loadNow()) return;
    change({ [knob()]: v });
    els.hint.textContent = "";
    renderCode();
  }
  // every design change goes through here, so the goal's window and the dots restart, and the code view updates
  function setKnob(k, v) {
    if (!canTurn(k) || sim.cfg[k] === v) return;
    change({ [k]: v });
    renderInspect(true); renderParts(); renderCode();
  }
  // the one way the sim changes: onto the tape, after cutting the future off if you're rewound
  function change(patch) {
    branch();
    sim.set(patch);
    tape.changes.push({ t: sim.t, patch });
    for (const k in patch) { if (k === knob()) lastLoadChange = sim.t; else lastSysChange = sim.t; }
  }

  // ------------------------------------------------------------- rewind --
  // Drag along any timeline (or ← → while paused) to go back. The stage, the numbers and system.yaml show that moment;
  // play, or a change, carries on from there and the old future is dropped.
  const headT = () => (live || sim).t;
  function seek(T) {
    const head = headT();
    T = Math.max(0, Math.min(head, T));
    if (head - T < 0.05) {
      if (live) { sim = live; live = null; }
    } else {
      if (!live) { live = sim; paused = true; }
      sim = Sim.replay(tape.cfg, tape.seed, tape.changes, T);
      sim.feed = [];
    }
    flyers = []; sparks = [];
    updateBar(); drawCharts(); renderInspect(true); renderParts(); renderCode();
  }
  let seekWant = null;
  function seekSoon(T) {
    if (seekWant === null) requestAnimationFrame(() => { const t = seekWant; seekWant = null; seek(t); });
    seekWant = T;
  }
  function branch() {
    if (!live) return;
    const T = sim.t;
    live = null;
    tape.changes = tape.changes.filter((c) => c.t <= T);
    samples = samples.filter((s) => s.t <= T);
    dots = dots.filter((d) => d.t <= T);
    lastSample = Math.floor(T);
    lastLoadChange = lastSysChange = 0;
    for (const c of tape.changes) for (const k in c.patch) { if (k === knob()) lastLoadChange = c.t; else lastSysChange = c.t; }
    for (const [k, Tt] of teeth) { if (k > T) teeth.delete(k); else { Tt.pts = Tt.pts.filter((p) => k + p[0] <= T); Tt.done = false; } }
    toast(`Carrying on from ${clock(T).slice(2)}. What happened after it is gone.`);
  }

  function cycleLb() { const K = Object.keys(LB); setKnob("lb", K[(K.indexOf(sim.cfg.lb) + 1) % K.length]); }

  // the parts tray: ghosts you drag onto the wire (or click) to add a server or a cache
  const PARTS = {
    server: { label: () => name("server"), can: () => canTurn("servers") && sim.cfg.servers < MAX_SERVERS, add: () => setKnob("servers", sim.cfg.servers + 1), slot: () => { const L = layout({ servers: sim.cfg.servers + 1 }); return { slot: L.servers[L.servers.length - 1], L }; }, note: () => `${sim.cfg.servers} of ${MAX_SERVERS}` },
    queue: { label: () => "email queue", can: () => canTurn("jobWorkers") && !(sim.cfg.jobWorkers > 0), add: () => setKnob("jobWorkers", 2), slot: () => { const L = layout({ jobWorkers: 2 }); return { slot: L.mailer, L }; }, note: () => (sim.cfg.jobWorkers > 0 ? "in place" : "2 workers") },
    shard: { label: () => "shard", can: () => canTurn("shards") && sim.cfg.shards < MAX_SHARDS, add: () => setKnob("shards", sim.cfg.shards + 1), slot: () => { const L = layout({ shards: sim.cfg.shards + 1 }); return { slot: L.servers[L.servers.length - 1], L }; }, note: () => `${sim.cfg.shards} of ${MAX_SHARDS}` },
    replica: { label: () => "read replica", can: () => canTurn("replicas") && sim.cfg.replicas < MAX_REPLICAS, add: () => setKnob("replicas", sim.cfg.replicas + 1), slot: () => { const L = layout({ replicas: sim.cfg.replicas + 1 }); return { slot: L.servers[L.servers.length - 1], L }; }, note: () => `${sim.cfg.replicas} of ${MAX_REPLICAS}` },
    limiter: { label: () => "rate limiter", can: () => canTurn("limit") && !(sim.cfg.limit > 0), add: () => setKnob("limit", 50), slot: () => { const L = layout({ limit: 50 }); return { slot: L.limiter, L }; }, note: () => (sim.cfg.limit > 0 ? "in place" : "50/s each") },
    cdn: { label: () => "CDN", can: () => canTurn("cdn") && !sim.cfg.cdn, add: () => setKnob("cdn", true), slot: () => { const L = layout({ cdn: true }); return { slot: L.cdn, L }; }, note: () => (sim.cfg.cdn ? "in place" : "files near users") },
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
    // (a shard's own box opens the router: one place for the ring's knobs)
    if (!selected || els.inspect.hidden) return;
    const c = sim.cfg;
    if (selected.kind === "server" && !sim.srv[selected.i]) return closeInspect();
    if (selected.kind === "server" && isShard()) { selected = { kind: "lb" }; rebuild = true; }
    if (selected.kind === "cache" && !(c.cache > 0)) return closeInspect();
    if (selected.kind === "lb" && sim.srv.length < 2) return closeInspect();
    if (selected.kind === "clients" && !X.clients) return closeInspect();
    if (selected.kind === "mailer" && !(c.jobWorkers > 0)) return closeInspect();
    if (selected.kind === "cron" && !c.batch) return closeInspect();
    if (selected.kind === "limiter" && !(c.limit > 0)) return closeInspect();
    if (selected.kind === "bot" && !X.bot) return closeInspect();
    if (selected.kind === "cdn" && !c.cdn) return closeInspect();
    if (selected.kind === "page" && !(c.far > 0)) return closeInspect();
    if (rebuild || !ins || ins.kind !== selected.kind || ins.i !== selected.i) {
      els.inspect.innerHTML = "";
      ins = { kind: selected.kind, i: selected.i };
      const many = sim.srv.length > 1;
      if (selected.kind === "server") {
        els.inspect.append(h("p", { class: "ih" }, isDb() ? cap1(dbName(selected.i)) : many ? `${cap1(name("server"))} ${selected.i + 1}` : cap1(name("server"))));
        ins.w = stepper("workers", () => setWorkers(sim.cfg.workers - 1), () => setWorkers(sim.cfg.workers + 1));
        els.inspect.append(ins.w.row);
        if (knobs().has("queueMax")) {
          const at = () => QUEUE_SIZES.findIndex((v) => v >= sim.cfg.queueMax);
          ins.q = stepper("queue limit", () => setKnob("queueMax", QUEUE_SIZES[Math.max(0, at() - 1)]), () => setKnob("queueMax", QUEUE_SIZES[Math.min(QUEUE_SIZES.length - 1, at() + (QUEUE_SIZES[at()] === sim.cfg.queueMax ? 1 : 0))]));
          els.inspect.append(ins.q.row);
        }
        if (knobs().has("cancel")) els.inspect.append(ins.cx = h("p", { class: "pol" }));
        els.inspect.append(ins.dl = h("dl", {}));
        if (many) els.inspect.append(h("p", { class: "note" }, "Every server has the same workers."));
      } else if (selected.kind === "lb" && isShard()) {
        els.inspect.append(h("p", { class: "ih" }, "Router"), h("p", { class: "pol" }, "Each account hashes to a point on the ring; the shard whose arc it lands in holds it."));
        ins.hot = stepper("viral share", () => setKnob("hot", stepIn(HOTS, sim.cfg.hot, -1)), () => setKnob("hot", stepIn(HOTS, sim.cfg.hot, 1)));
        ins.s = stepper("shards", () => setKnob("shards", Math.max(1, sim.cfg.shards - 1)), () => setKnob("shards", Math.min(MAX_SHARDS, sim.cfg.shards + 1)));
        ins.sp = stepper("copies of ★", () => setKnob("hotSplit", stepIn(SPLITS, sim.cfg.hotSplit, -1)), () => setKnob("hotSplit", stepIn(SPLITS, sim.cfg.hotSplit, 1)));
        els.inspect.append(ins.hot.row, ins.s.row, ins.sp.row, ins.dl = h("dl", {}));
      } else if (selected.kind === "lb" && isDb()) {
        els.inspect.append(h("p", { class: "ih" }, "Router"), h("p", { class: "pol" }, "Every write goes to the primary. Reads go to the replicas in turn."));
        ins.ry = h("p", { class: "pol" });
        ins.s = stepper("replicas", () => setKnob("replicas", Math.max(0, sim.cfg.replicas - 1)), () => setKnob("replicas", Math.min(MAX_REPLICAS, sim.cfg.replicas + 1)));
        els.inspect.append(ins.ry, ins.s.row, ins.dl = h("dl", {}));
      } else if (selected.kind === "lb") {
        els.inspect.append(h("p", { class: "ih" }, "Load balancer"));
        ins.pol = h("p", { class: "pol" });
        ins.s = stepper("servers", () => setKnob("servers", Math.max(1, sim.cfg.servers - 1)), () => setKnob("servers", Math.min(MAX_SERVERS, sim.cfg.servers + 1)));
        els.inspect.append(ins.pol, ins.s.row, ins.dl = h("dl", {}));
      } else if (selected.kind === "clients") {
        els.inspect.append(h("p", { class: "ih" }, "Clients"));
        ins.r = stepper("retries", () => setKnob("retries", Math.max(0, sim.cfg.retries - 1)), () => setKnob("retries", Math.min(5, sim.cfg.retries + 1)));
        const at = () => Math.max(0, BACKOFFS.indexOf(sim.cfg.backoff));
        ins.b = stepper("backoff", () => setKnob("backoff", BACKOFFS[Math.max(0, at() - 1)]), () => setKnob("backoff", BACKOFFS[Math.min(BACKOFFS.length - 1, at() + 1)]));
        els.inspect.append(ins.r.row, ins.b.row, ins.jit = h("p", { class: "pol" }), ins.dl = h("dl", {}));
      } else if (selected.kind === "mailer") {
        els.inspect.append(h("p", { class: "ih" }, "Mailer"));
        ins.jw = stepper("workers", () => setKnob("jobWorkers", Math.max(1, sim.cfg.jobWorkers - 1)), () => setKnob("jobWorkers", Math.min(12, sim.cfg.jobWorkers + 1)));
        els.inspect.append(ins.jw.row, ins.dl = h("dl", {}));
        ins.rm = h("button", { class: "wt-link rm", onclick: () => setKnob("jobWorkers", 0) }, `send from the ${name("server")} again`);
        els.inspect.append(ins.rm);
      } else if (selected.kind === "cron") {
        els.inspect.append(h("p", { class: "ih" }, "Newsletter"), ins.dl = h("dl", {}));
      } else if (selected.kind === "bot") {
        els.inspect.append(h("p", { class: "ih" }, "The script"));
        ins.n = stepper("sends", () => setKnob("noisy", stepIn(NOISY, sim.cfg.noisy, -1)), () => setKnob("noisy", stepIn(NOISY, sim.cfg.noisy, 1)));
        els.inspect.append(ins.n.row, ins.dl = h("dl", {}));
      } else if (selected.kind === "limiter") {
        els.inspect.append(h("p", { class: "ih" }, "Rate limiter"), h("p", { class: "pol" }, "A token bucket for every customer, the script included."));
        ins.l = stepper("limit", () => setKnob("limit", stepIn(LIMITS, sim.cfg.limit, -1)), () => setKnob("limit", stepIn(LIMITS, sim.cfg.limit, 1)));
        ins.bu = stepper("burst", () => setKnob("burst", stepIn(BURSTS, sim.cfg.burst, -1)), () => setKnob("burst", stepIn(BURSTS, sim.cfg.burst, 1)));
        els.inspect.append(ins.l.row, ins.bu.row, ins.dl = h("dl", {}));
        ins.rm = h("button", { class: "wt-link rm", onclick: () => setKnob("limit", 0) }, "remove the limiter");
        els.inspect.append(ins.rm);
      } else if (selected.kind === "page") {
        els.inspect.append(h("p", { class: "ih" }, "A page"), h("p", { class: "pol" }, `${sim.cfg.api === 1 ? "One round trip asks" : sim.cfg.api + " round trips ask"} the ${name("server")} for it; the rest fetch its files, one after another.`));
        ins.tr = stepper("file trips", () => setKnob("trips", Math.max(0, sim.cfg.trips - 1)), () => setKnob("trips", Math.min(12, sim.cfg.trips + 1)));
        els.inspect.append(ins.tr.row, ins.dl = h("dl", {}));
      } else if (selected.kind === "cdn") {
        els.inspect.append(h("p", { class: "ih" }, "CDN edge"), h("p", { class: "pol" }, "Copies of the page's files, a short hop from the people far away."), ins.dl = h("dl", {}));
        ins.rm = h("button", { class: "wt-link rm", onclick: () => setKnob("cdn", false) }, "remove the CDN");
        els.inspect.append(ins.rm);
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
    if (selected.kind === "page") {
      ins.tr.out.textContent = c.trips;
      ins.tr.minus.disabled = !canTurn("trips") || c.trips <= 0;
      ins.tr.plus.disabled = !canTurn("trips") || c.trips >= 12;
      ins.dl.innerHTML = `<dt>far away</dt><dd>${c.far}%, ${ms(c.rtt)} a trip</dd><dt>nearby</dt><dd>${ms(c.nearRtt)} a trip</dd>
        <dt>far p99, last 5 s</dt><dd>${st.ok ? ms(st.p99far) : "–"}</dd><dt>near p99, last 5 s</dt><dd>${st.ok ? ms(st.p99near) : "–"}</dd>`;
      return;
    }
    if (selected.kind === "cdn") {
      ins.rm.hidden = !canTurn("cdn");
      ins.dl.innerHTML = `<dt>files from here</dt><dd>${c.trips} a page</dd><dt>each trip</dt><dd>${ms(c.edgeRtt)}, not ${ms(c.rtt)}</dd>`;
      return;
    }
    if (selected.kind === "server") {
      const i = selected.i, s = sim.srv[i], svc = c.service * (i === 0 ? c.slow || 1 : 1);
      ins.w.out.textContent = c.workers;
      ins.w.minus.disabled = !canTurn("workers") || c.workers <= 1;
      ins.w.plus.disabled = !canTurn("workers") || c.workers >= 16;
      if (ins.q) {
        ins.q.out.textContent = num(c.queueMax);
        ins.q.minus.disabled = !canTurn("queueMax") || c.queueMax <= QUEUE_SIZES[0];
        ins.q.plus.disabled = !canTurn("queueMax") || c.queueMax >= QUEUE_SIZES[QUEUE_SIZES.length - 1];
      }
      if (ins.cx) {
        ins.cx.innerHTML = "";
        const w = c.cancel ? "drops it" : "serves it anyway";
        ins.cx.append("When a client gives up, the server ", canTurn("cancel") ? h("button", { class: "wt-link", onclick: () => setKnob("cancel", !sim.cfg.cancel), title: "Click to change" }, w) : h("b", {}, w), ".");
      }
      const wait = c.queueMax && ins.q ? `<dt>a full queue waits</dt><dd>${ms(c.queueMax * svc / c.workers)}</dd>` : "";
      ins.dl.innerHTML = `<dt>each request</dt><dd>≈ ${ms(svc)}</dd><dt>capacity</dt><dd>${Math.round(c.workers / svc)} req/s</dd>
        <dt>busy</dt><dd>${s.busy.length} of ${c.workers}</dd><dt>queue</dt><dd>${s.queue.length}${ins.q ? ` of ${num(c.queueMax)}` : ""}</dd>${wait}${sim.srv.length === 1 ? `<dt>busy, last 5 s</dt><dd>${Math.round(st.util * 100)}%</dd>` : ""}`;
    } else if (selected.kind === "lb" && isShard()) {
      ins.hot.out.textContent = `${c.hot}%`;
      ins.hot.minus.disabled = !canTurn("hot") || c.hot <= 0;
      ins.hot.plus.disabled = !canTurn("hot") || c.hot >= HOTS[HOTS.length - 1];
      ins.s.out.textContent = c.shards;
      ins.s.minus.disabled = !canTurn("shards") || c.shards <= 1;
      ins.s.plus.disabled = !canTurn("shards") || c.shards >= MAX_SHARDS;
      ins.sp.out.textContent = c.hotSplit;
      ins.sp.minus.disabled = !canTurn("hotSplit") || c.hotSplit <= 1;
      ins.sp.plus.disabled = !canTurn("hotSplit") || c.hotSplit >= SPLITS[SPLITS.length - 1];
      ins.dl.innerHTML = sim.srv.map((sv, i) => `<dt style="color:${ARC[i % ARC.length]}">shard ${i + 1}</dt><dd>${sv.busy.length}/${c.workers} busy · ${sv.queue.length} waiting</dd>`).join("") +
        `<dt>the ★ account</dt><dd>${Math.round(c.rate * c.hot / 100)}/s</dd>`;
    } else if (selected.kind === "lb" && isDb()) {
      ins.ry.innerHTML = "";
      const w = c.ryw ? `the primary, for ${c.rywFor} s` : "the replicas, like any read";
      ins.ry.append("A writer's own reads go to ", canTurn("ryw") ? h("button", { class: "wt-link", onclick: () => setKnob("ryw", !sim.cfg.ryw), title: "Click to change" }, w) : h("b", {}, w), ".");
      ins.s.out.textContent = c.replicas;
      ins.s.minus.disabled = !canTurn("replicas") || c.replicas <= 0;
      ins.s.plus.disabled = !canTurn("replicas") || c.replicas >= MAX_REPLICAS;
      ins.dl.innerHTML = `<dt>to the primary</dt><dd>${Math.round(st.primary)}/s</dd><dt>to the replicas</dt><dd>${Math.round(st.replicaLoad)}/s</dd>
        <dt>replication lag</dt><dd>≈ ${ms(c.lag)}</dd><dt>own reads stale, 5 s</dt><dd>${st.stale ? `<b class="bad">${Math.round(st.staleRate * 100)}%</b>` : "none"}</dd>`;
    } else if (selected.kind === "lb") {
      const [w, d] = LB[c.lb];
      ins.pol.innerHTML = "";
      ins.pol.append(canTurn("lb") ? h("button", { class: "wt-link", onclick: cycleLb, title: "Click to change" }, w) : h("b", {}, w), `: ${d}.`);
      ins.s.out.textContent = c.servers;
      ins.s.minus.disabled = !canTurn("servers") || c.servers <= 1;
      ins.s.plus.disabled = !canTurn("servers") || c.servers >= MAX_SERVERS;
      ins.dl.innerHTML = sim.srv.map((s, i) => `<dt>${name("server")} ${i + 1}${i === 0 && c.slow > 1 ? " (slow)" : ""}</dt><dd>${s.busy.length + s.queue.length} in flight</dd>`).join("");
    } else if (selected.kind === "clients") {
      ins.r.out.textContent = c.retries;
      ins.r.minus.disabled = !canTurn("retries") || c.retries <= 0;
      ins.r.plus.disabled = !canTurn("retries") || c.retries >= 5;
      ins.b.out.textContent = c.backoff ? `${c.backoff}s` : "none";
      ins.b.minus.disabled = !canTurn("backoff") || c.backoff <= 0;
      ins.b.plus.disabled = !canTurn("backoff") || c.backoff >= BACKOFFS[BACKOFFS.length - 1];
      ins.jit.innerHTML = "";
      const w = c.jitter ? "a random part of" : "exactly";
      if (!c.backoff) ins.jit.append("No backoff: a failed try is retried at once.");
      else ins.jit.append("Each retry waits ", canTurn("jitter") ? h("button", { class: "wt-link", onclick: () => setKnob("jitter", !sim.cfg.jitter), title: "Click to change" }, w) : h("b", {}, w),
        ` ${[0, 1, 2].map((n) => ms(c.backoff * 2 ** n)).join(", then ")}.`);
      ins.dl.innerHTML = `<dt>give up after</dt><dd>${ms(c.timeout)}</dd><dt>tries, last 5 s</dt><dd>${Math.round(st.tries)}/s</dd>
        <dt>people, last 5 s</dt><dd>${Math.round(st.sent / Math.max(1, Math.min(5, sim.t)))}/s</dd><dt>waiting to retry</dt><dd>${sim.waiting}</dd>`;
    } else if (selected.kind === "mailer") {
      const B = c.batch, js = sim.jobStats(sim.t, sim.t);
      ins.jw.out.textContent = c.jobWorkers;
      ins.jw.minus.disabled = !canTurn("jobWorkers") || c.jobWorkers <= 1;
      ins.jw.plus.disabled = !canTurn("jobWorkers") || c.jobWorkers >= 12;
      ins.rm.hidden = !canTurn("jobWorkers");
      ins.dl.innerHTML = `<dt>each email</dt><dd>≈ ${ms(B.service)}</dd><dt>sends</dt><dd>${Math.round(c.jobWorkers / B.service)}/s</dd>
        <dt>a batch of ${num(B.n)}</dt><dd>${ms(B.n * B.service / c.jobWorkers)}</dd><dt>busy</dt><dd>${sim.jobBusy.length} of ${c.jobWorkers}</dd>
        <dt>waiting</dt><dd>${num(sim.jobQ.length)}</dd><dt>oldest waiting</dt><dd>${js.backlog ? ms(js.jobAge) : "none"}</dd>`;
    } else if (selected.kind === "bot") {
      ins.n.out.textContent = `${num(c.noisy)}/s`;
      ins.n.minus.disabled = !canTurn("noisy") || c.noisy <= 0;
      ins.n.plus.disabled = !canTurn("noisy") || c.noisy >= NOISY[NOISY.length - 1];
      ins.dl.innerHTML = `<dt>sends</dt><dd>${num(c.noisy)}/s</dd><dt>answered, last 5 s</dt><dd>${Math.round(st.nTput)}/s</dd>
        <dt>429s, last 5 s</dt><dd>${Math.round(st.n429)}/s</dd><dt>everyone else</dt><dd>${num(c.rate)}/s from ${num(c.tenants)} customers</dd>`;
    } else if (selected.kind === "limiter") {
      ins.l.out.textContent = `${num(c.limit)}/s`;
      ins.l.minus.disabled = !canTurn("limit") || c.limit <= LIMITS[0];
      ins.l.plus.disabled = !canTurn("limit") || c.limit >= LIMITS[LIMITS.length - 1];
      ins.bu.out.textContent = num(c.burst);
      ins.bu.minus.disabled = !canTurn("burst") || c.burst <= BURSTS[0];
      ins.bu.plus.disabled = !canTurn("burst") || c.burst >= BURSTS[BURSTS.length - 1];
      ins.rm.hidden = !canTurn("limit");
      const room = c.workers / c.service;
      ins.dl.innerHTML = `<dt>the script's bucket</dt><dd>${Math.floor(sim.scriptTokens() * c.burst)} of ${num(c.burst)} tokens</dd><dt>429s to the script</dt><dd>${Math.round(st.n429)}/s</dd>
        <dt>429s to everyone else</dt><dd>${st.limited ? `<b class="bad">${num(st.limited)}</b> in 5 s` : "none"}</dd><dt>the server's room</dt><dd>${num(room)}/s in all</dd>`;
    } else if (selected.kind === "cron") {
      const B = c.batch, bs = sim.batches, last = bs.length ? bs[bs.length - 1].t : B.at - B.every, js = sim.jobStats(sim.t, sim.t);
      ins.dl.innerHTML = `<dt>every</dt><dd>${B.every} s</dd><dt>emails</dt><dd>${num(B.n)}, all at once</dd><dt>work in a batch</dt><dd>${num(B.n * B.service)} worker-s</dd>
        <dt>next one in</dt><dd>${Math.ceil(last + B.every - sim.t)} s</dd><dt>sent by</dt><dd>${c.jobWorkers > 0 ? "the mailer" : `the ${name("server")}`}</dd><dt>not sent yet</dt><dd>${num(js.backlog)}</dd>`;
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
      if (!wide) scrubber(el, id);
    };
    box("load", scat().label, true);
    box("tput", X.clients ? "answered" : "served per second");
    box("lat", "wait: p50 and p99");
    box("err", "errors per second");
    box("util", X.system.shards ? "busiest and quietest shard" : X.system.writes ? "own posts read stale" : X.bot ? "the script: answered and 429s" : X.system.batch ? "emails waiting" : X.parts && X.parts.includes("cache") ? "cache hits" : "workers busy");
  }
  // drag along a timeline to go back in time; the window holds still while you drag
  function scrubber(el, id) {
    el.title = "Drag back along the timeline to rewind";
    let win = null;
    const at = (e) => { const r = charts[id].cv.getBoundingClientRect(), f = (e.clientX - r.left - 4) / Math.max(1, r.width - 8); return win[0] + Math.max(0, Math.min(1, f)) * (win[1] - win[0]); };
    el.addEventListener("pointerdown", (e) => {
      if (e.button) return;
      win = timeWin();
      el.setPointerCapture(e.pointerId);
      el.classList.add("scrub");
      paused = true; updateBar();
      seekSoon(at(e));
      e.preventDefault();
    });
    el.addEventListener("pointermove", (e) => { if (win) seekSoon(at(e)); });
    const end = () => { if (!win) return; win = null; el.classList.remove("scrub"); };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
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
    if (scat().kind === "teeth") return drawTeeth();
    const [x, W, H] = chartCtx(k);
    const sc = scat(), pad = { l: 36, r: 10, t: 8, b: 18 }, YMAX = sc.ymax, pctY = sc.y === "hit" || sc.y === "errRate";
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
    if (sc.y === "hit" && sim.cfg.mode === "open") {
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
      x.fillStyle = acc; x.textAlign = "right"; x.fillText(`${X.predict.axis && !X.predict.bend ? "needs" : "bends"} ≈ ${num(A)}`, px(A) - 4, H - pad.b - 6);
    }
    // a dot per steady second: older ones fade
    dots.forEach((d, i) => {
      if (live && d.t > sim.t) return;
      x.globalAlpha = 0.25 + 0.75 * (i / Math.max(1, dots.length - 1));
      const over = !pctY && d.y > YMAX;
      x.fillStyle = over || (sc.y === "errRate" && d.y > 0.01) ? css("--wt-bad") : acc;
      const xx = px(d.x), yy = py(d.y);
      if (over) { x.beginPath(); x.moveTo(xx - 3, yy + 5); x.lineTo(xx + 3, yy + 5); x.lineTo(xx, yy); x.fill(); }
      else { x.beginPath(); x.arc(xx, yy, 2.6, 0, Math.PI * 2); x.fill(); }
    });
    x.globalAlpha = 1;
    const seen = live ? dots.filter((d) => d.t <= sim.t) : dots, last = seen[seen.length - 1];
    charts[k].val.textContent = last ? (sc.y === "errRate" ? `${Math.round(last.y * 100)}% failed at ${num(last.x)}` : pctY ? `${Math.round(last.y * 100)}% at ${num(last.x)} keys` : `${ms(last.y)} at ${num(last.x)}`) : "";
  }
  // a batch experiment: one line per batch, its jobs still waiting against the seconds since it landed. Where a line
  // meets the floor is how long that batch took; the dashed line is when the next one lands. Red ones went to the
  // website's own line, teal ones to their own queue.
  function drawTeeth() {
    const [x, W, H] = chartCtx("load");
    const sc = scat(), pad = { l: 40, r: 10, t: 8, b: 18 }, B = sim.cfg.batch;
    const all = [...teeth.entries()], top = Math.max(B.n, ...all.map(([, T]) => T.n));
    const px = (v) => pad.l + (Math.max(sc.min, Math.min(sc.max, v)) - sc.min) / (sc.max - sc.min) * (W - pad.l - pad.r);
    const py = (v) => H - pad.b - (v / top) * (H - pad.t - pad.b);
    const ink = css("--wt-mute"), line = css("--wt-line"), acc = css("--wt-acc"), pink = css("--wt-pink"), bad = css("--wt-bad");
    x.font = "10px " + css("--f-mono"); x.fillStyle = ink; x.strokeStyle = line; x.lineWidth = 1;
    for (const f of [0, 0.5, 1]) { x.beginPath(); x.moveTo(pad.l, py(f * top)); x.lineTo(W - pad.r, py(f * top)); x.stroke(); x.textAlign = "right"; x.fillText(num(f * top), pad.l - 5, py(f * top) + 3); }
    for (let v = sc.min; v <= sc.max; v += 20) { x.textAlign = v === sc.min ? "left" : v + 20 > sc.max ? "right" : "center"; x.fillText(`${v} s`, px(v), H - 4); }
    // the next batch
    if (B.every <= sc.max) {
      x.strokeStyle = ink; x.setLineDash([2, 4]); x.beginPath(); x.moveTo(px(B.every), pad.t); x.lineTo(px(B.every), H - pad.b); x.stroke(); x.setLineDash([]);
      x.textAlign = "left"; x.fillText("next batch", px(B.every) + 4, H - pad.b - 6);
    }
    if (P.guess != null) {
      x.strokeStyle = pink; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(px(P.guess), pad.t); x.lineTo(px(P.guess), H - pad.b); x.stroke(); x.setLineDash([]);
      x.fillStyle = pink; x.textAlign = "left"; x.fillText("your guess", px(P.guess) + 4, pad.t + 9);
    }
    if (P.revealed && P.phase === "explore") {
      const A = X.predict.answer;
      x.strokeStyle = acc; x.beginPath(); x.moveTo(px(A), pad.t); x.lineTo(px(A), H - pad.b); x.stroke();
      const jw = (X.predict.setup || {}).jobWorkers;
      x.fillStyle = acc; x.textAlign = "left"; x.fillText(`${jw} workers: ${A} s`, px(A) + 4, pad.t + 26);
    }
    // the batches, oldest faintest; points after a rewound moment aren't drawn
    const shown = all.slice(-6);
    shown.forEach(([t0, T], i) => {
      x.globalAlpha = 0.3 + 0.7 * ((i + 1) / shown.length);
      x.strokeStyle = T.q ? acc : bad; x.lineWidth = i === shown.length - 1 ? 2 : 1.4;
      x.beginPath();
      T.pts.filter((p) => t0 + p[0] <= sim.t + 1e-6).forEach(([dt, n], j) => (j ? x.lineTo(px(dt), py(n)) : x.moveTo(px(dt), py(n))));
      x.stroke();
    });
    x.globalAlpha = 1; x.lineWidth = 1;
    const lastDone = [...all].reverse().find(([, T]) => T.done), cur = all.length ? all[all.length - 1][1] : null;
    charts.load.val.textContent = cur && !cur.done ? `${num(cur.pts[cur.pts.length - 1][1])} waiting, ${Math.round(cur.pts[cur.pts.length - 1][0])} s in` : lastDone ? `last batch took ${Math.round(lastDone[1].pts[lastDone[1].pts.length - 1][0])} s` : "";
  }
  function series(k, lines, ymax, fmt, unitMax) {
    if (!charts[k] || !charts[k].w) return;
    const [x, W, H] = chartCtx(k);
    const pad = { l: 4, r: 4, t: 6, b: 4 }, span = 60;
    const [t0, t1] = timeWin(), T = sim.t;
    const px = (t) => pad.l + ((t - t0) / span) * (W - pad.l - pad.r);
    const top = Math.max(ymax, ...samples.flatMap((s) => lines.map((l) => Math.min(unitMax || Infinity, s[l.key] || 0)))) * 1.1 || 1;
    const py = (v) => H - pad.b - (Math.min(v, top) / top) * (H - pad.t - pad.b);
    x.strokeStyle = css("--wt-line"); x.lineWidth = 1;
    x.beginPath(); x.moveTo(pad.l, H - pad.b); x.lineTo(W - pad.r, H - pad.b); x.stroke();
    const draw = () => { for (const l of lines) {
      x.strokeStyle = l.color; x.lineWidth = l.w || 1.6; x.setLineDash(l.dash || []);
      x.beginPath();
      let first = true;
      for (const s of samples) { if (s.t < t0) continue; if (s[l.key] == null) { first = true; continue; } const X1 = px(s.t), Y1 = py(s[l.key]); first ? x.moveTo(X1, Y1) : x.lineTo(X1, Y1); first = false; }
      x.stroke();
      // a soft fill under the main line, so the shape reads at a glance
      if (!l.dash && l.fill !== false && samples.length > 1) {
        const vis = samples.filter((s) => s.t >= t0);
        if (vis.length > 1 && vis.every((s) => s[l.key] != null)) {
          x.lineTo(px(vis[vis.length - 1].t), H - pad.b); x.lineTo(px(vis[0].t), H - pad.b); x.closePath();
          const a = x.globalAlpha; x.globalAlpha = a * 0.12; x.fillStyle = l.color; x.fill(); x.globalAlpha = a;
        }
      }
    } };
    if (live) {
      // rewound: what came after this moment is faint, and a cursor marks where you are
      const cx = px(T);
      x.globalAlpha = 0.22; draw(); x.globalAlpha = 1;
      x.save(); x.beginPath(); x.rect(0, 0, cx, H); x.clip(); draw(); x.restore();
      x.setLineDash([]); x.strokeStyle = css("--wt-pink"); x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(cx, 0); x.lineTo(cx, H); x.stroke();
    } else draw();
    x.setLineDash([]);
    let s = samples[samples.length - 1];
    if (live) for (let i = samples.length - 1; i >= 0; i--) if (samples[i].t <= T + 1e-9) { s = samples[i]; break; }
    charts[k].val.textContent = s ? fmt(s) : "";
  }
  // the timelines' window: the last minute, or around the moment you've rewound to
  function timeWin() {
    const head = headT(), T = sim.t, t1 = head - T > 50 ? T + 50 : head;
    return [t1 - 60, t1];
  }
  function drawCharts() {
    if (!sim) return;
    drawLoadChart();
    const acc = css("--wt-acc"), pink = css("--wt-pink"), bad = css("--wt-bad"), mute = css("--wt-mute");
    const open = sim.cfg.mode === "open";
    if (X.clients) series("tput", [{ key: "tries", color: bad, dash: [3, 3], w: 1.2 }, { key: "offered", color: mute, dash: [1, 3], w: 1 }, { key: "tput", color: acc }], 10, (s) => `${Math.round(s.tput)}/s · ${Math.round(s.tries)} tries`);
    else series("tput", [...(open ? [{ key: "offered", color: mute, dash: [3, 3], w: 1 }] : []), { key: "tput", color: acc }], 10, (s) => `${Math.round(s.tput)}/s${open ? ` of ${Math.round(s.offered)}` : ""}`);
    series("lat", [{ key: "p50", color: acc, fill: false }, { key: "p99", color: pink }], 0.3, (s) => (s.p99 == null ? "none answered" : `${ms(s.p50)} · ${ms(s.p99)}`), 12);
    series("err", [{ key: "err", color: bad }], 1, (s) => `${s.err.toFixed(s.err < 10 ? 1 : 0)}/s`);
    if (X.system.shards) series("util", [{ key: "coolest", color: mute, dash: [3, 3], w: 1.2 }, { key: "hottest", color: "#ffd21f" }], 10, (s) => `${Math.round(s.hottest)}/s · ${Math.round(s.coolest)}/s`);
    else if (X.system.writes) series("util", [{ key: "staleRate", color: bad }], 1, (s) => `${Math.round(s.staleRate * 100)}%`, 1);
    else if (X.bot) series("util", [{ key: "n429", color: bad, dash: [3, 3], w: 1.2 }, { key: "nTput", color: theme().job }], 10, (s) => `${Math.round(s.nTput)}/s · ${Math.round(s.n429)} 429s`);
    else if (X.system.batch) series("util", [{ key: "backlog", color: theme().job }], 10, (s) => num(s.backlog));
    else if (X.parts && X.parts.includes("cache")) series("util", [{ key: "hit", color: css("--wt-ok") }], 1, (s) => `${Math.round(s.hit * 100)}%`, 1);
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
      els.clock.textContent = live ? `${clock(sim.t)} of ${clock(live.t).slice(2)}` : clock(sim.t);
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
        const nx = feed[i + 1], noisy = why === "n";
        if (nx && nx[0] === "lim") { trips.push({ kind: "lim", noisy }); i++; }
        else if (nx && nx[0] === "hit") { trips.push({ kind: "hit" }); i++; }
        else if (nx && nx[0] === "route") { trips.push({ kind: "in", srv: nx[1], noisy, tint: why }); lastRoute = nx[1]; routeGlow = 1; i++; }
        else trips.push({ kind: "in", srv: 0, noisy, tint: why });
      } else if (kind === "repl") {
        // one copy to each replica, each taking about the lag to land (sped up past 2 s so the stage stays readable)
        if (flyers.length < 120 && Math.random() < 0.6) for (let r = 1; r < sim.srv.length; r++) flyers.push({ kind: "repl", to: r, age: 0, life: Math.max(0.35, Math.min(2, a)) / Math.max(1, speed) * (speed < 1 ? 3 : 1), lane: 0 });
      } else if (kind === "stale") {
        if (flyers.length < 140) flyers.push({ kind: "stale", srv: a, age: 0, life: 1.1, lane: 0 });
      } else if (kind === "out") {
        trips.push({ kind: a ? "ok" : "bad", srv: srvI || 0 });
        if (!a) burst(srvI || 0);
      } else if (kind === "batch") {
        // a dozen envelopes stand for the whole batch, close behind each other
        for (let k = 0; k < 12; k++) flyers.push({ kind: "job", age: -k * 0.06, life: speed < 1 ? 1.6 : 0.7, lane: Math.random() });
      } else if (kind === "sent" && Math.random() < 0.25 && flyers.length < 140) flyers.push({ kind: "sent", srv: a, age: 0, life: 0.9, lane: Math.random() });
    }
    const budget = speed > 1 ? 4 : 8, step = Math.max(1, Math.ceil(trips.length / budget));
    for (let i = 0; i < trips.length && flyers.length < 140; i += step) {
      const f = trips[i], life = speed < 1 ? 1.4 : f.kind === "hit" || f.kind === "lim" ? 0.6 : 0.45;
      flyers.push({ ...f, age: 0, life: f.kind === "bad" ? 0.9 : life, lane: Math.random() });
    }
  }
  const clock = (t) => `t ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  function sample(t) {
    const st = sim.stats(Math.max(0, t - 5), t), span = Math.min(5, t) || 1;
    const s = { t, load: loadNow(), offered: sim.cfg.mode === "open" ? sim.cfg.rate : st.sent / span, tput: st.tput, p50: st.ok ? st.p50 : null, p99: st.ok ? st.p99 : null, err: st.errors / span, util: st.util, hit: st.hit, tries: st.tries, errRate: st.errRate, backlog: st.backlog, n429: st.n429, nTput: st.nTput, nIn: Math.max(0, sim.cfg.noisy - st.n429), staleRate: st.staleRate, hottest: st.hottest, coolest: st.coolest, p99far: st.ok ? st.p99far : null };
    samples.push(s);
    if (samples.length > 400) samples.shift();
    const sc = scat();
    if (sc.kind === "teeth") {
      for (const b of sim.batches) {
        let T = teeth.get(b.t);
        if (!T) { teeth.set(b.t, T = { q: b.q, n: b.n, pts: [[0, b.n]], done: false }); if (teeth.size > 12) teeth.delete(teeth.keys().next().value); }
        if (T.done) continue;
        if (b.left === 0) { T.pts.push([b.last - b.t, 0]); T.done = true; } else if (t > b.t) T.pts.push([t - b.t, b.left]);
      }
      // the answer opens once a batch has gone through the queue, start to finish
      if (P.phase === "explore" && !P.revealed && P.guess != null && sim.batches.some((b) => b.q && !b.left)) reveal();
      checkGoal();
      return;
    }
    // a dot only once the load and the design have been steady for the whole 5 s window, so a change doesn't smear it
    // the x of a dot: the load, a knob, or a measured number (what the script gets past the limiter)
    const xv = sc.x === knob() ? s.load : sc.x in s ? s[sc.x] : sim.cfg[sc.x];
    const g = sim.cfg.surge, calm = !g || t >= g.at + g.for + 10;
    if (t - Math.max(lastLoadChange, lastSysChange) >= 6 && (st.ok > 3 || (sc.y === "errRate" && st.sent > 3)) && xv > 0 && calm) {
      dots.push({ t, x: xv, y: s[sc.y], load: s.load, p99: s.p99 });
      if (dots.length > 240) dots.shift();
      if (P.phase === "explore" && !P.revealed && P.guess != null) {
        const A = X.predict.answer;
        const ok = X.predict.bend
          ? xv >= A * 1.1 && (sc.y === "p99far" ? s.p99far : s.p99) > X.predict.bend
          : X.predict.lower
          ? xv <= A * 1.3 && st.errors === 0 && s.p99 < 1
          : X.predict.axis
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
    if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey && !e.altKey && !e.target.closest("button, a")) focusStage();
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && paused && !e.defaultPrevented && !e.target.closest(".wt-crowd, .wt-pin")) {
      seek(sim.t + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10 : 1));
      e.preventDefault();
    }
  });
  addEventListener("vnl-theme", () => drawCharts());
  route();
  requestAnimationFrame(frame);

  // for tools/e2e.js: set a knob directly and run the sim forward fast
  main.wtSet = (patch) => { change(patch); renderCode(); };
  main.wtSeek = (T) => seek(T);
  main.wtFrame = () => els.canvas.toDataURL("image/png");
  main.wtRun = (secs) => { const end = sim.t + secs; while (sim.t < end) { sim.advance(Math.min(end, sim.t + 1)); sim.feed.length = 0; if (sim.t - lastSample >= 1) { lastSample += 1; sample(lastSample); } } drawCharts(); };
  main.wtState = () => { const st = sim.stats(0, sim.t); return { phase: P.phase, guess: P.guess, t: sim.t, head: headT(), rewound: !!live, cfg: sim.cfg, done: !!S.done[X.id], samples: samples.length, sent: st.sent, p99: st.p99, backlog: st.backlog, batches: sim.batches.length }; };
})();
