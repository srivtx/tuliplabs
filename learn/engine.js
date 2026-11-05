/* Tulip Labs: code tracks.
   One engine renders every chapter of every track from content/<track>.json.
   Python runs in the browser through Pyodide (learn/py-worker.js), or through
   tools/devserver.py when the page is opened with ?runner=local. */
(function () {
  "use strict";

  const CFG = window.TRACK || {};
  const TRACK = CFG.id;
  const DAY = 864e5;
  const BOXES = [0, 1, 3, 7, 16, 35]; // days until the next review, per Leitner box

  // ------------------------------------------------------------ helpers --
  const $ = (s, r = document) => r.querySelector(s);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function toast(msg) {
    const t = h("div", { class: "toast", role: "status" }, msg);
    document.body.append(t);
    setTimeout(() => t.remove(), 2200);
  }
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ------------------------------------------------------------ storage --
  const KEY = "vnl-code-v1";
  let S = { done: {}, code: {}, rev: {}, sol: {} };
  try { S = Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { /* private mode */ }
  let saveT = 0;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }, 150);
  }
  const XP = { run: 5, predict: 10, parsons: 10, quiz: 5, recall: 10, exercise: 20, viz: 10, project: 40 };
  let onProgress = null;
  function award(n, why) {
    S.xp = (S.xp || 0) + n;
    const today = new Date().toISOString().slice(0, 10);
    S.days = S.days || [];
    if (!S.days.includes(today)) S.days.push(today);
    save();
    drawStats();
    toast(`+${n} XP · ${why}`);
  }
  function streak() {
    const days = new Set(S.days || []);
    let n = 0;
    const d = new Date();
    if (!days.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1);
    while (days.has(d.toISOString().slice(0, 10))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function drawStats() {
    const el = document.getElementById("stats");
    if (!el) return;
    const st = streak();
    el.innerHTML = `<b>${S.xp || 0}</b> XP` + (st ? ` · <b>${st}</b>-day streak` : "");
  }
  function markDone(id) {
    const first = !S.done[id];
    S.done[id] = 1;
    save();
    if (first && DATA) {
      const f = findBlock(id);
      if (f) {
        const b = f.b;
        const pts = b.type === "exercise" && b.kind === "rebuild" ? 30 : XP[b.type] || 5;
        award(pts, { run: "ran it", predict: "prediction made", parsons: "order rebuilt", quiz: "answered", recall: "explained", exercise: "all checks pass", viz: "explored it", project: "project shipped" }[b.type] || "done");
      }
    }
    refreshProgress();
    onProgress && onProgress();
    return first;
  }
  function schedule(id, correct) {
    const r = S.rev[id] || { box: 0 };
    r.box = correct ? Math.min(r.box + 1, BOXES.length - 1) : 1;
    r.due = Date.now() + BOXES[r.box] * DAY;
    S.rev[id] = r;
    save();
    updateReviewCount();
  }
  function enroll(id, correct) { if (!S.rev[id]) schedule(id, correct); }

  // ------------------------------------------------------------- runner --
  const params = new URLSearchParams(location.search);
  const LOCAL = params.get("runner") === "local";
  const Runner = {
    worker: null, seq: 0, pending: new Map(), state: "idle", listeners: new Set(), warmed: new Set(),
    start(prelude) {
      if (LOCAL) return;
      if (!this.worker) {
        this.worker = new Worker("../learn/py-worker.js");
        this.warmed.clear();
        this.status = null;
        this.worker.onmessage = (e) => {
          const d = e.data;
          if (d.status) {
            this.status = d.text;
            if (d.text === "failed") setChip("", "Python couldn't download. Press Run to try again.");
            else setChip(d.text === "ready" ? "ready" : "busy", d.text === "ready" ? "Python ready" : d.text);
            for (const fn of this.listeners) fn(d.text);
            return;
          }
          const p = this.pending.get(d.id);
          if (d.started) { if (p && p.onStart) p.onStart(); return; }
          if (p) { this.pending.delete(d.id); p.resolve(d.res); }
          if (!this.pending.size) setChip("ready", "Python ready");
        };
        // If the worker itself dies (its script failed to load, say), answer every waiting Run
        // instead of leaving its button spinning, and start a fresh worker on the next Run.
        this.worker.onerror = (e) => {
          e.preventDefault && e.preventDefault();
          setChip("", "Python couldn't start. Press Run to try again.");
          this.worker && this.worker.terminate();
          this.worker = null;
          this.status = null;
          for (const p of this.pending.values()) p.resolve({ error: "Python couldn't start (the connection dropped?). Press Run again to retry.", stdout: "", figures: [] });
          this.pending.clear();
        };
        setChip("busy", "Starting Python…");
      }
      // Download the packages this chapter needs now, so the first Run doesn't wait for them.
      if (prelude && !this.warmed.has(prelude)) {
        this.warmed.add(prelude);
        this.worker.postMessage({ id: ++this.seq, req: { op: "warm", prelude } });
      }
    },
    async run(req, onStart) {
      if (LOCAL) {
        setChip("busy", "Running…");
        try {
          const r = await fetch("/__run", { method: "POST", body: JSON.stringify(req) });
          return await r.json();
        } finally { setChip("ready", "Python ready (local)"); }
      }
      this.start();
      const id = ++this.seq;
      return new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject, onStart });
        this.worker.postMessage({ id, req });
      });
    },
    stop() {
      if (!this.worker) return;
      this.worker.terminate();
      this.worker = null;
      for (const p of this.pending.values()) p.resolve({ error: "You stopped the run. Python was restarted, so run the earlier examples on this page again before this one.", stdout: "", figures: [] });
      this.pending.clear();
      ranCells.clear();
      const warmed = [...this.warmed];
      this.start();
      for (const pre of warmed) this.start(pre);
    },
  };
  // The header wraps on narrower screens; sticky things below it follow its real height.
  const topBar = document.querySelector("header.top");
  if (topBar) new ResizeObserver(() => document.documentElement.style.setProperty("--top-h", topBar.offsetHeight + "px")).observe(topBar);
  const ranCells = new Set();
  function setChip(cls, text) {
    const c = $("#py-chip");
    if (!c) return;
    c.className = "chip " + cls;
    c.lastChild.textContent = text;
    c.title = text;
  }

  // Run a request with a Run button that turns into Stop while it waits.
  async function runWith(btn, req) {
    const label = btn.textContent;
    const handler = btn.onclick;
    btn.disabled = true;
    btn.textContent = !LOCAL && Runner.status && Runner.status !== "ready" ? Runner.status : "Running…";
    btn.classList.add("loading");
    // The first run on a page may wait for Python itself: say so, so a slow start doesn't look broken.
    let note = null;
    if (!LOCAL && Runner.status !== "ready") {
      note = h("div", { class: "load-note" }, "First run: downloading Python into your browser. This happens once per visit and can take up to a minute.");
      btn.parentNode && btn.parentNode.after(note);
    }
    // While Python is still downloading, show its progress on the button. Stop is offered only once
    // the code itself has been running for a while: stopping a download just starts it over.
    const onStatus = (text) => { if (btn.disabled) btn.textContent = text === "ready" ? "Running…" : text; };
    Runner.listeners.add(onStatus);
    let stopT = null;
    const onStart = () => {
      if (btn.disabled) btn.textContent = "Running…";
      stopT = setTimeout(() => {
        btn.disabled = false;
        btn.textContent = "■ Stop";
        btn.classList.remove("loading");
        btn.onclick = (e) => { e.stopImmediatePropagation(); Runner.stop(); };
      }, 2500);
    };
    // The output box under this cell dims and shows three hopping blocks while it runs, then the
    // result slides in, so a fast run still reads as "it ran" rather than text that just changed.
    let box = null;
    for (let p = btn.parentNode; p && p !== document.body && !box; p = p.parentNode) box = p.querySelector(".out");
    if (box) { box.classList.remove("fresh"); box.classList.add("pending"); }
    try { return await Runner.run(req, onStart); }
    finally {
      if (box) { box.classList.remove("pending"); void box.offsetWidth; box.classList.add("fresh"); }
      Runner.listeners.delete(onStatus);
      clearTimeout(stopT);
      btn.classList.remove("loading");
      if (note) note.remove();
      btn.onclick = handler;
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  // ------------------------------------------------------------- editor --
  const KW = new Set("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" "));
  const BI = new Set("print len range int float str list dict set tuple sum min max abs sorted enumerate zip map filter isinstance type round any all super self".split(" "));
  const TOK = /(#[^\n]*)|("""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|[rbfuRBFU]{0,2}"(?:\\.|[^"\\\n])*"?|[rbfuRBFU]{0,2}'(?:\\.|[^'\\\n])*'?)|(_{3,})|(\b\d+\.?\d*(?:[eE][+-]?\d+)?j?\b)|([A-Za-z_]\w*)/g;
  function highlight(code) {
    let out = "", last = 0, m, prevWord = "";
    TOK.lastIndex = 0;
    while ((m = TOK.exec(code))) {
      out += esc(code.slice(last, m.index));
      const t = esc(m[0]);
      if (m[1]) out += `<span class="tk-c">${t}</span>`;
      else if (m[2]) out += `<span class="tk-s">${t}</span>`;
      else if (m[3]) out += `<span class="tk-blank">${t}</span>`;
      else if (m[4]) out += `<span class="tk-n">${t}</span>`;
      else {
        const w = m[5];
        if (KW.has(w)) out += `<span class="tk-k">${t}</span>`;
        else if (prevWord === "def" || prevWord === "class" || code[TOK.lastIndex] === "(") out += `<span class="tk-f">${t}</span>`;
        else if (BI.has(w)) out += `<span class="tk-b">${t}</span>`;
        else out += t;
        prevWord = w;
      }
      last = TOK.lastIndex;
    }
    return out + esc(code.slice(last)) + "\n";
  }

  function Editor(code, opts = {}) {
    const pre = h("pre", { "aria-hidden": "true" });
    const gut = h("div", { class: "gut", "aria-hidden": "true" });
    const ta = h("textarea", { spellcheck: "false", autocapitalize: "off", autocomplete: "off", "aria-label": opts.label || "Python code", wrap: "off" });
    if (opts.readonly) ta.readOnly = true;
    const el = h("div", { class: "ed" + (opts.readonly ? " ro" : "") }, gut, pre, ta);
    let escaped = false;
    ta.value = code;
    function paint() {
      pre.innerHTML = highlight(ta.value);
      const n = ta.value.split("\n").length;
      gut.textContent = Array.from({ length: n }, (_, i) => i + 1).join("\n");
    }
    function insert(text) {
      ta.focus();
      if (!document.execCommand || !document.execCommand("insertText", false, text)) {
        ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, "end");
        ta.dispatchEvent(new Event("input"));
      }
    }
    ta.addEventListener("input", () => { paint(); opts.onChange && opts.onChange(ta.value); });
    ta.addEventListener("scroll", () => { pre.scrollLeft = ta.scrollLeft; });
    ta.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); opts.onRun && opts.onRun(); return; }
      if (opts.readonly) return;
      if (e.key === "Escape") { escaped = true; return; }
      const v = ta.value, s = ta.selectionStart, en = ta.selectionEnd;
      if (e.key === "Tab" && !escaped) {
        e.preventDefault();
        const ls = v.lastIndexOf("\n", s - 1) + 1;
        if (s === en && !e.shiftKey) { insert("    "); return; }
        // indent or dedent every selected line
        const le = v.indexOf("\n", en - (en > s && v[en - 1] === "\n" ? 1 : 0));
        const end = le === -1 ? v.length : le;
        const block = v.slice(ls, end);
        const changed = e.shiftKey ? block.replace(/^ {1,4}/gm, "") : block.replace(/^/gm, "    ");
        ta.setSelectionRange(ls, end);
        insert(changed);
        ta.setSelectionRange(ls, ls + changed.length);
        return;
      }
      escaped = false;
      if (e.key === "Enter") {
        e.preventDefault();
        const ls = v.lastIndexOf("\n", s - 1) + 1;
        const line = v.slice(ls, s);
        let ind = (line.match(/^ */) || [""])[0];
        if (/:\s*(#.*)?$/.test(line)) ind += "    ";
        insert("\n" + ind);
        return;
      }
      if (e.key === "Backspace" && s === en && s > 0) {
        const ls = v.lastIndexOf("\n", s - 1) + 1;
        const before = v.slice(ls, s);
        if (before.length && /^ +$/.test(before) && before.length % 4 === 0) {
          e.preventDefault();
          ta.setSelectionRange(s - 4, s);
          insert("");
        }
      }
    });
    paint();
    return {
      el, ta,
      get: () => ta.value,
      set(v) { ta.value = v; paint(); opts.onChange && opts.onChange(v); },
    };
  }

  // ------------------------------------------------------------- output --
  function Output() {
    const out = h("div", { class: "out", "aria-live": "polite" });
    const figs = h("div", { class: "figs" });
    const el = h("div", {}, out, figs);
    return {
      el,
      clear() { out.textContent = ""; out.className = "out"; figs.textContent = ""; },
      show(res, extra) {
        out.className = "out";
        let text = res.stdout || "";
        if (res.error) { out.classList.add("err"); text += (text ? "\n" : "") + res.error; }
        out.textContent = text;
        figs.textContent = "";
        figs.append(visuals(res));
        if (extra) figs.append(extra);
      },
    };
  }

  // ------------------------------------------------------------ visuals --
  const REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function Player(anim) {
    const n = anim.frames.length;
    const img = h("img", { class: "flip", alt: "Animation produced by the code" });
    const slider = h("input", { type: "range", min: 0, max: n - 1, value: 0, "aria-label": "Frame" });
    const btn = h("button", { class: "btn small" }, "❚❚ Pause");
    const lab = h("span", { class: "kbd" });
    let i = 0, timer = null;
    function show(k) {
      i = k;
      img.src = "data:image/png;base64," + anim.frames[k];
      slider.value = k;
      lab.textContent = (anim.titles && anim.titles[k] != null ? anim.titles[k] + " · " : "") + `frame ${k + 1} / ${n}`;
    }
    function stop() { clearInterval(timer); timer = null; btn.textContent = "▶ Play"; }
    function play() {
      if (n < 2) return;
      stop();
      btn.textContent = "❚❚ Pause";
      timer = setInterval(() => {
        if (!document.body.contains(img)) return stop();
        show(i + 1 < n ? i + 1 : 0);
      }, 1000 / (anim.fps || 8));
    }
    btn.onclick = () => (timer ? stop() : play());
    slider.oninput = () => { stop(); show(+slider.value); };
    show(0);
    if (!REDUCED) play(); else stop();
    return h("div", { class: "player" }, img, h("div", { class: "pctl" }, btn, slider, lab));
  }
  function confetti(anchor) {
    if (REDUCED || !anchor) return;
    const colors = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)"];
    const box = h("div", { class: "burst", "aria-hidden": "true" });
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2, d = 40 + Math.random() * 40;
      box.append(h("i", { style: `background:${colors[k % 4]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 20}px` }));
    }
    anchor.append(box);
    setTimeout(() => box.remove(), 1000);
  }
  function visuals(res) {
    const wrap = h("div", { class: "figs" });
    for (const f of res.figures || []) wrap.append(h("img", { src: "data:image/png;base64," + f, alt: "Plot produced by the code" }));
    for (const a of res.anims || []) wrap.append(Player(a));
    return wrap;
  }

  // ------------------------------------------------------------- blocks --
  const KIND_LABEL = { fill: "Fill the blanks", bug: "Bug hunt", write: "Write it", rebuild: "Rebuild from memory" };

  function shell(b, badgeCls, badgeText, title) {
    const tick = h("span", { class: "tick" }, S.done[b.id] ? "✓ done" : "");
    const head = h("div", { class: "bh" }, h("span", { class: "badge " + badgeCls }, badgeText), title ? h("span", { class: "t" }, title) : null, tick);
    const body = h("div", { class: "bb" });
    const el = h("div", { class: "blk" + (S.done[b.id] ? " done" : ""), id: "b-" + b.id }, head, body);
    return {
      el, body,
      done() { el.classList.add("done"); tick.textContent = "✓ done"; },
    };
  }

  function nameErrorHelp(res, ctx, b, rerun) {
    if (!res.error || !/^NameError/.test(res.error) || ctx.review) return null;
    const prev = ctx.runBlocksBefore(b.id);
    if (!prev.length) return null;
    const btn = h("button", { class: "btn" }, "Run the earlier examples first");
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = "Running earlier examples…";
      for (const p of prev) {
        await Runner.run({ op: "cell", ns: ctx.ch.id, prelude: ctx.ch.prelude, code: S.code[p.id] ?? p.code });
        ranCells.add(p.id);
      }
      btn.remove();
      rerun();
    };
    return h("div", { class: "hint" }, h("p", {}, "This example builds on code from earlier on the page. Python forgets it when you reload. "), btn);
  }

  function renderRun(b, ctx) {
    const sh = shell(b, "run", "Example", b.title || "Run it, then change something");
    const out = Output();
    const ed = Editor(S.code[b.id] ?? b.code, {
      onRun: () => go(),
      onChange: (v) => { if (v === b.code) delete S.code[b.id]; else S.code[b.id] = v; save(); },
    });
    const runBtn = h("button", { class: "btn primary" }, "▶ Run");
    async function go() {
      const res = await runWith(runBtn, { op: "cell", ns: ctx.ch.id, prelude: ctx.ch.prelude, code: ed.get() });
      out.show(res, nameErrorHelp(res, ctx, b, go));
      if (!res.error) { ranCells.add(b.id); if (markDone(b.id)) sh.done(); }
    }
    runBtn.onclick = go;
    sh.body.append(ed.el, h("div", { class: "btns" }, runBtn, h("button", { class: "btn", onclick: () => ed.set(b.code) }, "Reset"), h("span", { class: "kbd" }, "Ctrl/⌘ + Enter runs")), out.el);
    return sh.el;
  }

  const norm = (s) => s.replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").trim();

  function renderPredict(b, ctx) {
    const sh = shell(b, "predict", "Predict", b.title || "What will this print? Commit to a guess first.");
    const ed = Editor(b.code, { readonly: true });
    const guess = h("textarea", { class: "guess", placeholder: "Type exactly what you think it prints…", "aria-label": "Your prediction" });
    const lock = h("button", { class: "btn primary", disabled: true }, "Lock in & run");
    const skip = h("button", { class: "btn" }, "No idea, just run it");
    const res = h("div");
    guess.addEventListener("input", () => { lock.disabled = !guess.value.trim(); });
    async function go(guessed) {
      guess.readOnly = true;
      const r = await runWith(lock, { op: "cell", ns: ctx.ch.id + ":predict", prelude: ctx.ch.prelude, code: b.code });
      const actual = r.error ? (r.stdout || "") + r.error : r.stdout;
      const match = guessed && norm(actual) === norm(guess.value);
      res.textContent = "";
      res.append(
        h("div", { class: "result " + (match ? "pass" : "fail") },
          guessed ? (match ? "Spot on. You could run this program in your head." : "Not quite. Compare line by line and find the first place they differ, then work out why.") : "Now read the code again with the answer in front of you. Which line produces each line of output?"),
        h("div", { class: "cmp" },
          h("div", {}, h("b", {}, "Your guess"), h("div", { class: "out" }, guessed ? guess.value : "(skipped)")),
          h("div", {}, h("b", {}, "Python says"), h("div", { class: "out" + (r.error ? " err" : "") }, actual || "(nothing)"))),
        visuals(r),
      );
      lock.disabled = true;
      skip.remove();
      if (markDone(b.id)) sh.done();
      if (ctx.review) ctx.onResult(match);
      else if (guessed) enroll(b.id, match);
    }
    lock.onclick = () => go(true);
    skip.onclick = () => go(false);
    sh.body.append(ed.el, guess, h("div", { class: "btns" }, lock, skip), res);
    return sh.el;
  }

  function renderParsons(b, ctx) {
    const sh = shell(b, "parsons", "Rebuild the order", b.title || "Put the lines in order");
    const all = shuffle(b.lines.map((t, i) => ({ t, i })).concat(b.distractors.map((t) => ({ t, i: -1 }))));
    let pool = all.slice(), ans = [];
    const poolEl = h("ol", { "aria-label": "Scrambled lines" });
    const ansEl = h("ol", { "aria-label": "Your program" });
    const msg = h("div");
    const out = Output();
    function line(item, where, idx) {
      const btn = h("button", { class: "ln", title: where === "pool" ? "Add to your program" : "Send back" }, item.t);
      btn.onclick = () => {
        if (where === "pool") { pool = pool.filter((x) => x !== item); ans.push(item); }
        else { ans = ans.filter((x) => x !== item); pool.push(item); }
        msg.textContent = ""; draw();
      };
      const li = h("li", {}, btn);
      if (where === "ans") {
        const up = h("button", { class: "mv", "aria-label": "Move up" }, "▲");
        const dn = h("button", { class: "mv", "aria-label": "Move down" }, "▼");
        up.onclick = () => { if (idx > 0) { [ans[idx - 1], ans[idx]] = [ans[idx], ans[idx - 1]]; draw(); } };
        dn.onclick = () => { if (idx < ans.length - 1) { [ans[idx + 1], ans[idx]] = [ans[idx], ans[idx + 1]]; draw(); } };
        li.append(up, dn);
      }
      return li;
    }
    function draw(marks) {
      poolEl.textContent = ""; ansEl.textContent = "";
      pool.forEach((it, i) => poolEl.append(line(it, "pool", i)));
      ans.forEach((it, i) => { const li = line(it, "ans", i); if (marks) li.classList.add(marks[i] ? "right" : "wrong"); ansEl.append(li); });
    }
    const check = h("button", { class: "btn primary" }, "Check order");
    check.onclick = async () => {
      const exact = ans.length === b.lines.length && ans.every((it, i) => it.t === b.lines[i]);
      let ok = exact;
      if (!ok && b.tests && ans.length === b.lines.length && ans.every((it) => it.i >= 0)) {
        const r = await runWith(check, { op: "check", prelude: ctx.ch.prelude, setup: b.setup, code: ans.map((x) => x.t).join("\n"), tests: b.tests });
        ok = r.passed;
      }
      msg.textContent = "";
      if (ok) {
        draw(ans.map(() => true));
        msg.append(h("div", { class: "result pass" }, "Correct. ", h("span", {}, "Now say out loud why each line has to come where it does.")));
        const r = await Runner.run({ op: "check", prelude: ctx.ch.prelude, setup: b.setup, code: ans.map((x) => x.t).join("\n"), tests: b.tests || "" });
        out.show(r);
        if (markDone(b.id)) sh.done();
        ctx.review ? ctx.onResult(true) : enroll(b.id, true);
      } else {
        const marks = ans.map((it, i) => it.t === b.lines[i]);
        draw(marks);
        const usedBad = ans.some((x) => x.i < 0);
        const missing = b.lines.length - ans.filter((x) => x.i >= 0).length;
        let why = usedBad ? "One of your lines is a decoy that doesn't belong. " : "";
        if (missing > 0) why += `${missing} line${missing > 1 ? "s are" : " is"} still missing. `;
        if (!why) why = "Every line is there, but the order is off. Red lines are in the wrong spot. ";
        msg.append(h("div", { class: "result fail" }, why + "Check indentation too: it decides which block a line belongs to."));
        if (ctx.review) ctx.onResult(false);
      }
    };
    draw();
    sh.body.append(
      b.prompt ? h("div", { class: "prompt", html: b.prompt }) : null,
      h("div", { class: "pz" }, h("div", {}, h("h4", {}, "Scrambled" + (b.distractors.length ? " (with decoys)" : "")), poolEl), h("div", {}, h("h4", {}, "Your program"), ansEl)),
      h("div", { class: "btns" }, check, h("button", { class: "btn", onclick: () => { pool = shuffle(all); ans = []; msg.textContent = ""; out.clear(); draw(); } }, "Start over")),
      msg, out.el);
    return sh.el;
  }

  function renderExercise(b, ctx) {
    const kind = b.kind || "write";
    const sh = shell(b, kind, KIND_LABEL[kind] || "Exercise", b.title);
    const startCode = ctx.review ? b.starter : (S.code[b.id] ?? b.starter);
    const ed = Editor(startCode, {
      onRun: () => go(),
      onChange: (v) => { if (ctx.review) return; if (v === b.starter) delete S.code[b.id]; else S.code[b.id] = v; save(); },
    });
    const out = Output();
    const res = h("div");
    const hintBox = h("div");
    const solBox = h("div");
    const runBtn = h("button", { class: "btn primary" }, "▶ Run & check");
    let fails = 0, hintN = 0, solved = false;
    const hintBtn = b.hints.length ? h("button", { class: "btn" }, `Hint (${b.hints.length})`) : null;
    const solBtn = h("button", { class: "btn", disabled: true, title: "Unlocks after two tries" }, "Show solution");
    async function go() {
      const r = await runWith(runBtn, { op: "check", prelude: ctx.ch.prelude, setup: b.setup, code: ed.get(), tests: b.tests, show: b.show || "" });
      out.show({ stdout: r.stdout, error: r.error, figures: r.figures, anims: r.anims });
      res.textContent = "";
      const meter = h("span", { class: "meter" }, Array.from({ length: r.total || 0 }, (_, i) => h("i", { class: i < r.ok ? "on" : "" })));
      if (r.passed) {
        const passBox = h("div", { class: "result pass" }, h("b", {}, "All checks pass."), meter, " ", kind === "rebuild" ? "You rebuilt it from memory. That's the strongest kind of practice." : "Nice work.");
        res.append(passBox);
        confetti(passBox);
        if (r.show) {
          res.append(h("div", { class: "reward" }, h("div", { class: "rw-h" }, "▶ Your code, running"),
            r.show.stdout ? h("div", { class: "out" }, r.show.stdout) : null,
            r.show.error ? h("div", { class: "out err" }, r.show.error) : null,
            visuals(r.show)));
        }
        if (!solved) {
          solved = true;
          const first = markDone(b.id);
          if (first) sh.done();
          if (ctx.review) ctx.onResult(fails === 0 && !S.sol[b.id + ":r"]);
          else enroll(b.id, fails === 0 && !S.sol[b.id]);
        }
      } else {
        fails++;
        if (fails >= 2) { solBtn.disabled = false; solBtn.title = ""; }
        if (!r.error) {
          res.append(h("div", { class: "result fail" },
            h("b", {}, `${r.ok} of ${r.total} checks pass.`), meter,
            r.failed ? h("pre", {}, "Failed: " + r.failed) : null,
            r.message ? h("div", {}, r.message) : null));
        } else {
          res.append(h("div", { class: "result fail" }, "Your code raised an error before the checks could run (see above). Read the last line of the error first."));
        }
        if (ctx.review && fails === 1) ctx.onResult(false, true);
      }
    }
    runBtn.onclick = go;
    if (hintBtn) hintBtn.onclick = () => {
      if (hintN >= b.hints.length) return;
      hintBox.append(h("div", { class: "hint", html: `<b>Hint ${hintN + 1}.</b> ` + b.hints[hintN] }));
      hintN++;
      hintBtn.textContent = hintN < b.hints.length ? `Another hint (${b.hints.length - hintN} left)` : "No more hints";
      if (hintN >= b.hints.length) hintBtn.disabled = true;
    };
    solBtn.onclick = () => {
      S.sol[ctx.review ? b.id + ":r" : b.id] = 1; save();
      solBox.textContent = "";
      const sol = Editor(b.solution, { readonly: true, label: "Reference solution" });
      solBox.append(h("div", { class: "sol" }, h("b", {}, "One working solution. Read it, close it, then type yours from memory."), sol.el,
        h("div", { class: "btns" }, h("button", { class: "btn", onclick: () => { solBox.textContent = ""; } }, "Hide it"))));
    };
    sh.body.append(
      b.prompt ? h("div", { class: "prompt", html: b.prompt }) : null,
      ed.el,
      h("div", { class: "btns" }, runBtn, hintBtn, solBtn, h("button", { class: "btn", onclick: () => ed.set(b.starter) }, "Reset"), h("span", { class: "kbd" }, "Ctrl/⌘ + Enter")),
      out.el, res, hintBox, solBox);
    return sh.el;
  }

  function renderQuiz(b, ctx) {
    const sh = shell(b, "quiz", "Check", "");
    const why = h("div", { class: "why" });
    let answered = false;
    const opts = h("div", { class: "opts" }, shuffle(b.opts).map((o) => {
      const btn = h("button", { class: "opt", html: o.t });
      btn.onclick = () => {
        if (answered) return;
        answered = true;
        btn.classList.add(o.ok ? "right" : "wrong");
        if (!o.ok) [...opts.children].forEach((c, i) => { if (c.dataset.ok) c.classList.add("right"); });
        why.innerHTML = (o.ok ? "<p><b>Right.</b></p>" : "<p><b>Not this one.</b></p>") + b.why;
        if (markDone(b.id)) sh.done();
        ctx.review ? ctx.onResult(o.ok) : enroll(b.id, o.ok);
      };
      if (o.ok) btn.dataset.ok = "1";
      return btn;
    }));
    sh.body.append(h("div", { class: "prompt", html: b.q }), opts, why);
    return sh.el;
  }

  function renderRecall(b, ctx) {
    const sh = shell(b, "recall", "Explain it", "From memory: no scrolling up");
    const ta = h("textarea", { class: "guess", placeholder: "Write your answer in your own words (it stays on this device)…", "aria-label": "Your explanation" });
    const show = h("button", { class: "btn primary" }, "Compare with a model answer");
    const area = h("div");
    show.onclick = () => {
      show.remove();
      area.append(h("div", { class: "ans", html: "<b>A good answer covers:</b>" + b.a }),
        h("div", { class: "rate" }, "How did you do?",
          ...[["Nailed it", true], ["Partly", false], ["Missed it", false]].map(([label, ok]) => h("button", {
            class: "btn", onclick: (e) => {
              [...e.target.parentNode.querySelectorAll("button")].forEach((x) => (x.disabled = true));
              e.target.classList.add("primary");
              if (markDone(b.id)) sh.done();
              ctx.review ? ctx.onResult(ok) : schedule(b.id, ok);
            },
          }, label))));
    };
    sh.body.append(h("div", { class: "prompt", html: b.q }), ta, h("div", { class: "btns" }, show), area);
    return sh.el;
  }


  // A live simulation from learn/viz/<name>.js. It marks itself done when the
  // learner reaches its goal (the widget calls api.done()).
  function renderViz(b, ctx) {
    const sh = shell(b, "viz", "Simulate", b.title || "Play with it");
    sh.el.classList.add("vizblk");
    const goal = b.goal ? h("div", { class: "vgoal" }, h("b", {}, S.done[b.id] ? "✓ Goal reached: " : "Your goal: "), h("span", { html: b.goal })) : null;
    const stage = h("div", { class: "vstage" }, h("p", { class: "kbd" }, "Loading the simulation…"));
    sh.body.append(b.intro ? h("div", { class: "prompt", html: b.intro }) : null, goal, stage);
    const finish = (msg) => {
      if (ctx.review) { ctx.onResult(true); return; }
      if (goal) goal.firstChild.textContent = "✓ Goal reached: ";
      if (markDone(b.id)) { sh.done(); if (msg) toast(msg); confetti(sh.el.querySelector(".bh")); }
    };
    stage.vizDone = finish; // lets tools/e2e.js complete a goal
    if (!window.VIZ) { stage.textContent = "The simulation library did not load."; return sh.el; }
    const start = () => window.VIZ.mount(b.name, stage, { done: finish, height: b.height, wasDone: !!S.done[b.id], key: b.id })
      .catch((e) => {
        console.error(e);
        stage.replaceChildren(h("div", { class: "vfail" },
          h("p", {}, "The simulation didn't load (", (e && e.message) || String(e), "). This is usually a network hiccup."),
          h("button", { class: "btn", onclick: () => { stage.replaceChildren(h("p", { class: "kbd" }, "Loading the simulation…")); start(); } }, "Try again")));
      });
    start();
    return sh.el;
  }

  // A real-world project: a brief, why it matters, milestones you tick off, and
  // stretch ideas. The exercises that follow in the same step are its parts.
  function renderProject(b, ctx) {
    const sh = shell(b, "project", "Real-world project", b.title);
    sh.el.classList.add("projblk");
    S.ms = S.ms || {};
    const ticks = S.ms[b.id] = S.ms[b.id] || [];
    const bar = h("div", { class: "pbar big" }, h("i"));
    const count = h("span", { class: "kbd" });
    const ship = h("button", { class: "btn primary", disabled: true }, "I built it ✓");
    function sync() {
      const n = b.milestones.length, d = b.milestones.filter((_, i) => ticks[i]).length;
      bar.firstChild.style.width = Math.round((100 * d) / (n || 1)) + "%";
      count.textContent = `${d} / ${n} milestones`;
      ship.disabled = d < n || !!S.done[b.id];
      if (S.done[b.id]) ship.textContent = "✓ Shipped";
    }
    const list = h("ol", { class: "miles" }, b.milestones.map((m, i) => {
      const cb = h("input", { type: "checkbox", id: `${b.id}-m${i}` });
      cb.checked = !!ticks[i];
      cb.onchange = () => { ticks[i] = cb.checked ? 1 : 0; save(); sync(); };
      return h("li", {}, cb, h("label", { for: `${b.id}-m${i}`, html: m }));
    }));
    ship.onclick = () => { if (markDone(b.id)) { sh.done(); confetti(sh.el.querySelector(".bh")); } sync(); };
    sh.body.append(
      b.client ? h("div", { class: "client" }, h("b", {}, "Client: "), h("span", { html: b.client })) : null,
      h("div", { class: "prompt", html: b.brief }),
      b.why ? h("div", { class: "pwhy" }, h("b", {}, "Where this shows up for real"), h("div", { html: b.why })) : null,
      b.skills && b.skills.length ? h("div", { class: "skills" }, b.skills.map((k) => h("span", { class: "pill", html: k }))) : null,
      h("h4", { class: "mh" }, "Milestones"), list,
      h("div", { class: "btns" }, ship, count), bar,
      b.stretch && b.stretch.length ? h("details", { class: "stretch" }, h("summary", {}, "Make it yours: stretch ideas"), h("ul", {}, b.stretch.map((x) => h("li", { html: x })))) : null);
    sync();
    return sh.el;
  }

  // ------------------------------------------------------------ puzzles --
  // Puzzle mode: no reading, just a picture to touch. Five kinds, all checked here in the page.
  // Stars (1-3) say how cleanly you solved it; your best is kept in S.stars.
  const CELL = { ".": "e", "#": "c2", "*": "c1", "o": "c3", "+": "c4" };
  function cell(tok, attrs, tag) {
    const k = CELL[tok];
    return h(tag || "button", Object.assign({ class: "pc " + (k || "t"), "aria-label": tok === "." ? "empty" : tok }, attrs || {}), k ? "" : tok);
  }
  function gridEl(rows, make) {
    const w = Math.max(...rows.map((r) => r.length));
    return h("div", { class: "pgrid", style: `grid-template-columns:repeat(${w},auto)` }, rows.flatMap((r, i) => r.map((t, j) => make ? make(t, i, j) : cell(t, { tabindex: -1 }))));
  }
  function starsEl(n) { return h("span", { class: "stars", "aria-label": `${n} of 3 stars` }, [1, 2, 3].map((k) => h("i", { class: k <= n ? "on" : "" }))); }
  function renderPuzzle(b) {
    const best = (S.stars = S.stars || {})[b.id] || 0;
    const head = h("span", { class: "pstar" }, best ? starsEl(best) : "");
    const sh = shell(b, "puzzle", "Puzzle", b.title);
    sh.el.querySelector(".bh").append(head);
    const board = h("div", { class: "pboard" });
    const msg = h("div", { class: "pmsg" });
    const btns = h("div", { class: "btns" });
    let tries = 0;
    function solved(stars, note) {
      const prev = S.stars[b.id] || 0;
      if (stars > prev) { S.stars[b.id] = stars; save(); award(5 * (stars - prev), stars === 3 ? "puzzle, 3 stars" : "puzzle solved"); }
      head.replaceChildren(starsEl(Math.max(stars, prev)));
      msg.replaceChildren(h("div", { class: "result pass" }, starsEl(stars), " ", note || "Solved."), b.why ? h("div", { class: "why", html: b.why }) : "");
      sh.done();
      confetti(sh.el.querySelector(".bh"));
    }
    const fail = (t) => { tries++; msg.replaceChildren(h("div", { class: "result fail" }, t)); };
    const byTries = () => (tries === 0 ? 3 : tries <= 2 ? 2 : 1);
    if (b.kind === "swap") {
      // Fewest moves: click two cells to swap them (neighbours only when `adjacent`).
      let cur = b.cells.slice(), pick = -1, moves = 0;
      const count = h("span", { class: "pcount" });
      const draw = () => {
        const won = cur.every((x, i) => x === b.goal[i]);
        board.replaceChildren(h("div", { class: "prow" }, cur.map((t, i) => cell(t, { class: "pc t" + (i === pick ? " sel" : "") + (won ? " good" : ""), onclick: () => tap(i) }))),
          h("div", { class: "prow goal" }, h("span", { class: "plab" }, "goal"), b.goal.map((t) => h("span", { class: "pc t ghost" }, t))));
        count.textContent = `${moves} swap${moves === 1 ? "" : "s"} · fewest possible: ${b.par}`;
        if (won) solved(moves <= b.par ? 3 : moves <= b.par + 2 ? 2 : 1, moves <= b.par ? "The fewest swaps possible." : `Done in ${moves}. It can be done in ${b.par}: try again for 3 stars.`);
      };
      const tap = (i) => {
        if (cur.every((x, k) => x === b.goal[k])) return;
        if (pick < 0) { pick = i; return draw(); }
        if (pick === i) { pick = -1; return draw(); }
        if (b.adjacent && Math.abs(pick - i) !== 1) { pick = i; msg.replaceChildren(h("div", { class: "result fail" }, "Only neighbours can swap here.")); return draw(); }
        [cur[pick], cur[i]] = [cur[i], cur[pick]]; pick = -1; moves++; msg.textContent = ""; draw();
      };
      btns.append(count, h("button", { class: "btn", onclick: () => { cur = b.cells.slice(); pick = -1; moves = 0; msg.textContent = ""; draw(); } }, "Start over"));
      draw();
    } else if (b.kind === "fix") {
      // Fix the picture: mark every cell that's wrong, then check.
      const marked = new Set();
      const key = (i, j) => i + "," + j;
      const draw = () => board.replaceChildren(gridEl(b.grid, (t, i, j) => cell(t, { class: "pc " + (CELL[t] || "t") + (marked.has(key(i, j)) ? " mark" : ""), onclick: () => { marked.has(key(i, j)) ? marked.delete(key(i, j)) : marked.add(key(i, j)); draw(); } })));
      const check = h("button", { class: "btn primary" }, "Check");
      check.onclick = () => {
        const want = new Set(b.wrong.map(([i, j]) => key(i, j)));
        const miss = [...want].filter((k) => !marked.has(k)).length, extra = [...marked].filter((k) => !want.has(k)).length;
        if (!miss && !extra) {
          if (b.fixed) board.replaceChildren(gridEl(b.fixed, (t, i, j) => cell(t, { class: "pc " + (CELL[t] || "t") + (want.has(key(i, j)) ? " good" : "") }, "span")));
          return solved(byTries());
        }
        fail(`${miss ? `${miss} wrong cell${miss > 1 ? "s" : ""} still unmarked. ` : ""}${extra ? `${extra} marked cell${extra > 1 ? "s are" : " is"} actually fine.` : ""}`);
      };
      btns.append(check);
      draw();
    } else if (b.kind === "frame") {
      // Predict the frame: which picture comes next?
      const opts = shuffle(b.options.map((g, k) => ({ g, ok: k === 0 })));
      let over = false;
      board.append(h("div", { class: "pnow" }, h("span", { class: "plab" }, "now"), gridEl(b.grid)),
        h("div", { class: "popts" }, opts.map((o, k) => {
          const el = h("button", { class: "popt", "aria-label": `Option ${k + 1}` }, h("span", { class: "plab" }, String.fromCharCode(65 + k)), gridEl(o.g));
          el.onclick = () => {
            if (over || el.classList.contains("wrong")) return;
            if (o.ok) { over = true; el.classList.add("right"); solved(byTries()); }
            else { el.classList.add("wrong"); fail("Not that one. Look again at what changes from one step to the next."); }
          };
          return el;
        })));
    } else if (b.kind === "order") {
      // Order the steps: tap them in the order they happen.
      let pool = shuffle(b.items.map((t, i) => ({ t, i }))), ans = [];
      const draw = (marks) => board.replaceChildren(h("div", { class: "pz" },
        h("div", {}, h("h4", {}, "Steps"), h("ol", {}, pool.map((it) => h("li", {}, h("button", { class: "ln wrapln", html: it.t, onclick: () => { pool = pool.filter((x) => x !== it); ans.push(it); msg.textContent = ""; draw(); } }))))),
        h("div", {}, h("h4", {}, "In order"), h("ol", {}, ans.map((it, k) => h("li", { class: marks ? (marks[k] ? "right" : "wrong") : "" }, h("button", { class: "ln wrapln", html: it.t, onclick: () => { ans = ans.filter((x) => x !== it); pool.push(it); msg.textContent = ""; draw(); } })))))));
      const check = h("button", { class: "btn primary" }, "Check order");
      check.onclick = () => {
        if (pool.length) return fail("Place every step first.");
        const marks = ans.map((it, k) => it.i === k);
        draw(marks);
        if (marks.every(Boolean)) solved(byTries()); else fail(`${marks.filter((m) => !m).length} step${marks.filter((m) => !m).length > 1 ? "s are" : " is"} in the wrong place (red). Tap one to send it back.`);
      };
      btns.append(check, h("button", { class: "btn", onclick: () => { pool = shuffle(b.items.map((t, i) => ({ t, i }))); ans = []; msg.textContent = ""; draw(); } }, "Start over"));
      draw();
    } else if (b.kind === "target") {
      // Hit the target: move the sliders until the value lands on the target.
      const names = b.sliders.map((s) => s.name);
      const f = new Function(...names, `return (${b.expr});`);
      const vals = b.sliders.map((s) => s.start);
      const fmt = (x) => (Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 1 ? x.toFixed(2) : x.toFixed(3)).replace(/\.?0+$/, "") || "0";
      const out = h("div", { class: "ptarget" });
      const draw = () => {
        const v = f(...vals), off = v - b.target, close = Math.abs(off) <= b.tol;
        const span = Math.max(Math.abs(b.target) * 2, 1), pos = (x) => Math.max(0, Math.min(100, 50 + (50 * (x - b.target)) / span));
        out.replaceChildren(h("div", { class: "ptbar" }, h("i", { class: "tgt", style: `left:${pos(b.target - b.tol)}%;width:${Math.max(1, pos(b.target + b.tol) - pos(b.target - b.tol))}%` }), h("b", { class: close ? "hit" : "", style: `left:${pos(v)}%` })),
          h("p", {}, `${b.output}: `, h("b", {}, fmt(v) + (b.unit ? " " + b.unit : "")), ` · target ${fmt(b.target)}${b.tol ? ` ± ${fmt(b.tol)}` : ""}`));
        return close;
      };
      board.append(...b.sliders.map((s, k) => {
        const lab = h("output", {}, fmt(vals[k]));
        const r = h("input", { type: "range", min: s.min, max: s.max, step: s.step, value: s.start, "aria-label": s.label });
        r.oninput = () => { vals[k] = +r.value; lab.textContent = fmt(vals[k]); draw(); };
        return h("label", { class: "pslider" }, h("span", {}, s.label), r, lab);
      }), out);
      const check = h("button", { class: "btn primary" }, "Lock it in");
      check.onclick = () => (draw() ? solved(byTries(), "On target.") : fail("Not on target yet. Watch which way the marker moves as you drag."));
      btns.append(check);
      draw();
    }
    const ask = b.prompt || (b.kind === "order" ? "<p>Tap the steps in the order they happen. Tap a placed step to send it back.</p>" : "");
    sh.body.append(...[ask ? h("div", { class: "prompt", html: ask }) : null, board, btns, msg].filter(Boolean));
    return sh.el;
  }

  // Puzzle mode for one chapter: its simulation to play with, then its puzzles, no prose.
  function pagePuzzles(ch) {
    sidebar(ch.id);
    const m = main();
    m.textContent = "";
    const viz = ch.sections.flatMap((s) => s.blocks).filter((b) => b.type === "viz");
    const got = ch.puzzles.reduce((a, p) => a + ((S.stars || {})[p.id] || 0), 0);
    const ctx = { ch, review: false, runBlocksBefore: () => [] };
    m.append(h("div", { class: "col pmode" },
      h("header", { class: "ch-head cover dark" },
        h("div", { class: "cv-text" },
          h("div", { class: "eyebrow" }, `Chapter ${ch.num} · ${CFG.short} · puzzle mode`),
          h("h1", {}, ch.title),
          h("p", { class: "tag" }, "No reading. Touch the pictures until they're right."),
          h("div", { class: "meta" }, modeSwitch(ch, "puzzle"), h("span", { class: "pill" }, `${got} / ${ch.puzzles.length * 3} stars`))),
        h("div", { class: "cv-art" }, flower(ch.id, "cv-ghost", { "data-stage": 4 }), flower(ch.id, "cv-fl"))),
      ...ch.puzzles.map(renderPuzzle),
      ...viz.map((b) => renderBlock(b, ctx)),
      h("div", { class: "pager" }, h("a", { class: "btn", href: "#" + ch.num }, "← Back to the lesson"), h("a", { class: "btn", href: "#puzzles" }, "Every puzzle →"))));
    requestAnimationFrame(() => bloomAll(true));
    document.title = `Puzzles · ${ch.num}. ${ch.title} · ${CFG.pageTitle}`;
    window.scrollTo(0, 0);
  }
  function modeSwitch(ch, on) {
    if (!ch.puzzles || !ch.puzzles.length) return null;
    return h("span", { class: "mode-sw", role: "group", "aria-label": "Mode" },
      h("a", { href: "#" + ch.num, class: on === "learn" ? "on" : "", "aria-current": on === "learn" ? "page" : null }, "Learn"),
      h("a", { href: "#" + ch.num + "/puzzle", class: on === "puzzle" ? "on" : "", "aria-current": on === "puzzle" ? "page" : null }, `Puzzle · ${ch.puzzles.length}`));
  }
  // Every puzzle in this track, as a wall of keycaps: play them in any order.
  function pagePuzzleWall() {
    sidebar("puzzles");
    const m = main();
    m.textContent = "";
    const chs = DATA.chapters.filter((c) => c.puzzles && c.puzzles.length);
    const all = chs.flatMap((c) => c.puzzles), got = all.reduce((a, p) => a + ((S.stars || {})[p.id] || 0), 0);
    m.append(h("div", { class: "col" },
      h("header", { class: "ch-head cover dark" }, h("div", { class: "cv-text" },
        h("div", { class: "eyebrow" }, `${CFG.short} · puzzle mode`), h("h1", {}, "Every puzzle"),
        h("p", { class: "tag" }, all.length ? `${all.length} puzzles in ${chs.length} chapters · ${got} of ${all.length * 3} stars` : "Puzzles are on their way for this track."))),
      h("div", { class: "pwall" }, chs.map((c) => h("a", { class: "pkey", href: `#${c.num}/puzzle` },
        h("b", {}, String(c.num).padStart(2, "0")), h("span", {}, c.title),
        starsEl(Math.round(c.puzzles.reduce((a, p) => a + ((S.stars || {})[p.id] || 0), 0) / c.puzzles.length)))))));
    document.title = `Puzzles · ${CFG.pageTitle}`;
    window.scrollTo(0, 0);
  }

  function renderBlock(b, ctx) {
    switch (b.type) {
      case "md": return h("div", { class: "prose", html: b.html });
      case "run": return renderRun(b, ctx);
      case "predict": return renderPredict(b, ctx);
      case "parsons": return renderParsons(b, ctx);
      case "exercise": return renderExercise(b, ctx);
      case "quiz": return renderQuiz(b, ctx);
      case "recall": return renderRecall(b, ctx);
      case "viz": return renderViz(b, ctx);
      case "project": return renderProject(b, ctx);
      case "bridge": return h("div", { class: "bridge" }, h("div", { class: "cube", "aria-hidden": "true" }, h("i"), h("i"), h("i"), h("i")), h("div", { html: b.html }));
    }
    return h("div");
  }

  // ------------------------------------------------------------ progress --
  let DATA = null;
  const COUNTABLE = new Set(["run", "predict", "parsons", "exercise", "quiz", "recall", "viz", "project"]);
  function chProgress(ch) {
    let n = 0, d = 0;
    for (const s of ch.sections) for (const b of s.blocks) if (COUNTABLE.has(b.type)) { n++; if (S.done[b.id]) d++; }
    return { n, d, pct: n ? Math.round((100 * d) / n) : 0 };
  }
  function refreshProgress() {
    if (!DATA) return;
    for (const ch of DATA.chapters) {
      const p = chProgress(ch);
      document.querySelectorAll(`[data-prog="${ch.id}"]`).forEach((el) => { el.style.width = p.pct + "%"; });
      document.querySelectorAll(`[data-count="${ch.id}"]`).forEach((el) => { el.textContent = `${p.d} / ${p.n} done`; });
      const a = document.querySelector(`.side a[data-ch="${ch.id}"]`);
      if (a) { a.classList.toggle("done", p.n > 0 && p.d === p.n); a.querySelector(".g")?.replaceWith(glyph(p)); }
    }
    bloomAll();
  }
  function findBlock(id) {
    for (const ch of DATA.chapters) for (const s of ch.sections) for (const b of s.blocks) if (b.id === id) return { ch, b };
    return null;
  }
  // ------------------------------------------------------------- garden --
  // Each chapter grows a pixel flower (learn/garden.js) as its tasks get done.
  const STAGE_NAMES = ["a seed", "a sprout", "a bud", "half open", "in full bloom"];
  let HUES = ["#ff6fb5"];
  function setHues() {
    const kc = getComputedStyle(document.body).getPropertyValue("--kc").trim() || "#ff6fb5";
    // a green track would vanish into the leaves, so it blooms in pinks and sky blue instead
    HUES = TRACK === "ds" ? ["#ff6fb5", "#4a9cf0", "#ff8a5c"] : [kc, "#ff6fb5", kc];
  }
  const inkFor = (el) => (el.closest(".dark") ? "rgba(255,255,255,.7)" : getComputedStyle(document.body).getPropertyValue("--muted").trim() || "#777");
  function flower(id, cls, extra) { return h("canvas", Object.assign({ class: "fl " + (cls || ""), "data-fl": id, "aria-hidden": "true" }, extra || {})); }
  function trackPct() {
    let n = 0, d = 0;
    for (const ch of DATA.chapters) { const p = chProgress(ch); n += p.n; d += p.d; }
    return n ? Math.round((100 * d) / n) : 0;
  }
  // Draw every flower on the page whose stage changed (or all of them, after a resize).
  function bloomAll(force) {
    if (!window.GARDEN) return;
    document.querySelectorAll("canvas[data-fl]").forEach((cv) => {
      if (!cv.isConnected || !cv.clientWidth) return;
      const id = cv.dataset.fl;
      const ch = DATA.chapters.find((c) => c.id === id);
      const st = cv.dataset.stage != null ? +cv.dataset.stage : GARDEN.stage(ch ? chProgress(ch).pct : trackPct());
      const key = st + ":" + cv.clientWidth + "x" + cv.clientHeight;
      if (!force && cv.dataset.drawn === key) return;
      cv.dataset.drawn = key;
      GARDEN.draw(cv, { id: TRACK + ":" + id, stage: st, hues: HUES, ink: inkFor(cv) });
    });
  }
  let bloomT = 0;
  addEventListener("resize", () => { clearTimeout(bloomT); bloomT = setTimeout(() => DATA && bloomAll(true), 200); });
  const glyph = (p) => h("i", { class: "g " + (p.n && p.d === p.n ? "g2" : p.d ? "g1" : "g0"), title: `${p.d} / ${p.n} done` });

  function dueItems() {
    const now = Date.now();
    return Object.entries(S.rev).filter(([id, r]) => r.due <= now && findBlock(id)).sort((a, b) => a[1].due - b[1].due).map(([id]) => id);
  }
  function updateReviewCount() {
    const el = $("#rv-count");
    if (!el || !DATA) return;
    const n = dueItems().length;
    el.textContent = n;
    el.classList.toggle("zero", !n);
  }

  // --------------------------------------------------------------- pages --
  const main = () => $("#main");
  function sidebar(current) {
    const side = $("#side");
    side.textContent = "";
    side.append(h("h2", {}, h("i", { class: "sq" }), CFG.short || "Chapters"));
    side.append(h("a", { class: "top-link", href: "#", "aria-current": current === "home" ? "page" : null }, h("span", { class: "n" }, "✿"), "Your garden"));
    side.append(h("a", { class: "top-link", href: "#review", "aria-current": current === "review" ? "page" : null }, h("span", { class: "n" }, "↻"), "Spaced review"));
    if (DATA.chapters.some((c) => c.puzzles && c.puzzles.length)) side.append(h("a", { class: "top-link", href: "#puzzles", "aria-current": current === "puzzles" ? "page" : null }, h("span", { class: "n" }, "◆"), "Puzzles"));
    // Parts are branches; chapters hang off them like └── lines in a file tree.
    let part = null, branch = null;
    for (const ch of DATA.chapters) {
      if (!branch || (ch.part && ch.part !== part)) {
        part = ch.part;
        branch = h("div", { class: "branch" });
        side.append(h("div", { class: "part" }, part || "Chapters"), branch);
      }
      const p = chProgress(ch);
      branch.append(h("a", { href: "#" + ch.num, "data-ch": ch.id, class: p.n && p.d === p.n ? "done" : null, "aria-current": current === ch.id ? "page" : null },
        h("span", { class: "n" }, ch.num), h("span", { class: "t" }, ch.title), glyph(p)));
    }
    side.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }

  function pageHome() {
    onProgress = null;
    sidebar("home");
    const m = main();
    m.textContent = "";
    const chs = DATA.chapters, N = chs.length;
    const fin = chs.filter((c) => { const p = chProgress(c); return p.n && p.d === p.n; }).length;
    const pct = trackPct(), st = window.GARDEN ? GARDEN.stage(pct) : 0;
    // the chapter to carry on with: the furthest one started but not finished, else the first untouched
    const started = chs.filter((c) => { const p = chProgress(c); return p.d && p.d < p.n; });
    const nextCh = started[started.length - 1] || chs.find((c) => !chProgress(c).d) || chs[0];
    const parts = [...new Set(chs.map((c) => c.part || ""))];

    // A poster: corner notes, a big serif title, and the track's own flower, with its full bloom
    // drawn faintly behind it as the shape you're growing towards.
    const poster = h("section", { class: "poster dark" },
      h("div", { class: "p-corner tl" }, "Tulip Labs", h("br"), "Track · " + (CFG.short || "")),
      h("div", { class: "p-corner tr", html: `<b>${fin}</b> / ${N}<br>chapters in bloom` }),
      h("div", { class: "p-body" },
        h("h1", {}, CFG.heroTitle),
        h("div", { class: "p-code", html: `└── { growGarden(<i>${N}</i>); }` }),
        h("p", { class: "lede", html: CFG.heroLede }),
        h("div", { class: "p-cta" },
          h("a", { class: "key primary", href: "#" + nextCh.num }, (chProgress(nextCh).d ? "Carry on · " : "Start · ") + nextCh.num + ". " + nextCh.title + " →"),
          h("a", { class: "key", href: "#review" }, "Spaced review"))),
      h("div", { class: "p-art" }, h("i", { class: "p-glow" }), flower("track", "p-ghost", { "data-stage": 4 }), flower("track", "p-fl")),
      h("div", { class: "p-corner bl" }, `${N} chapters` + (parts.length > 1 ? ` · ${parts.length} parts` : "") + " · Python in your browser"),
      h("div", { class: "p-corner br" }, `fig. 1 — your flower, ${STAGE_NAMES[st]}`));

    const ladder = [["Read & run", "Working code, live. Change a number and run it again."], ["Predict", "Type what a program prints before you run it."],
      ["Reorder", "Scrambled lines, sometimes with decoys. Rebuild the program."], ["Fill the blanks", "The skeleton is there; you write the heart of it."],
      ["Bug hunt", "It runs, but it's wrong. Find out why."], ["Write it", "A blank function and a set of checks."],
      ["Rebuild & explain", "The chapter's core idea from memory, then in your own words."]];

    const beds = parts.map((pt) => {
      const list = chs.filter((c) => (c.part || "") === pt);
      const bloomed = list.filter((c) => { const p = chProgress(c); return p.n && p.d === p.n; }).length;
      return h("div", { class: "bed" },
        h("h3", { class: "bed-h" }, h("span", { class: "tree" }, "└──"), pt || "Chapters", h("small", {}, `${bloomed} / ${list.length} in bloom`)),
        h("div", { class: "plots" }, list.map((ch) => {
          const p = chProgress(ch);
          return h("a", { class: "plot" + (p.n && p.d === p.n ? " bloomed" : p.d ? " growing" : "") + (ch === nextCh ? " next" : ""), href: "#" + ch.num },
            h("div", { class: "soil" }, h("span", { class: "ghost", "aria-hidden": "true" }, String(ch.num).padStart(2, "0")), flower(ch.id), ch === nextCh ? h("span", { class: "next-tag" }, p.d ? "carry on" : "start here") : null),
            h("span", { class: "num" }, String(ch.num).padStart(2, "0")),
            h("b", {}, ch.title), h("small", {}, ch.tagline),
            h("span", { class: "pbar" }, h("i", { "data-prog": ch.id, style: `width:${p.pct}%` })));
        })));
    });

    const col = h("div", { class: "col wide hero" },
      poster,
      h("h3", { class: "sec-h" }, h("span", { class: "tree" }, "└──"), "Every chapter climbs the same ladder"),
      h("ol", { class: "ladder" }, ladder.map(([b, t], i) => h("li", { style: `--n:${i}` }, h("b", {}, b), t))),
      h("p", { html: "Anything you get right (or wrong) joins your <a href=\"#review\">spaced review</a> deck and comes back after 1, 3, 7, 16 and 35 days. Coming back is what makes it stick." }),
      CFG.homeNote ? h("div", { class: "note", html: CFG.homeNote }) : null,
      CFG.wires ? wireMap() : null,
      h("h3", { class: "sec-h" }, h("span", { class: "tree" }, "└──"), "Your garden", h("small", {}, "every chapter grows a flower: seed, sprout, bud, half open, full bloom")),
      beds);
    m.append(col);
    document.title = CFG.pageTitle;
    window.scrollTo(0, 0);
    requestAnimationFrame(() => bloomAll(true));
  }

  // A wiring map for tracks whose chapters reuse each other (CFG.wires = [[from, to], ...] by chapter
  // number, CFG.short_names = labels). Rows are layers: a build sits one row below everything it reuses.
  // A wire lights up in the track colour once both of its ends are finished.
  function wireMap() {
    const chs = DATA.chapters, E = CFG.wires, NS = "http://www.w3.org/2000/svg";
    const by = new Map(chs.map((c) => [c.num, c])), layer = new Map();
    const depth = (n) => { if (layer.has(n)) return layer.get(n); const ps = E.filter((e) => e[1] === n); const d = ps.length ? 1 + Math.max(...ps.map((e) => depth(e[0]))) : 0; layer.set(n, d); return d; };
    chs.forEach((c) => depth(c.num));
    const rows = [];
    chs.forEach((c) => (rows[layer.get(c.num)] ||= []).push(c.num));
    // roots that feed something go first, then order each lower row by where its parents sit
    rows[0].sort((a, b) => (E.some((e) => e[0] === b) - E.some((e) => e[0] === a)) || a - b);
    const pos = new Map(), W = 74, Hh = 92, KW = 62, KH = 44;
    // each lower build sits under the average of its parents, nudged right only to avoid overlapping
    const mid = (n) => { const ps = E.filter((e) => e[1] === n).map((e) => pos.get(e[0]).x); return ps.reduce((s, v) => s + v, 0) / ps.length; };
    rows.forEach((r, y) => {
      if (y) r.sort((a, b) => mid(a) - mid(b));
      let x = -Infinity;
      r.forEach((n, i) => { x = y ? Math.max(mid(n), x + W) : 8 + i * W; pos.set(n, { x, y: 10 + y * Hh }); });
    });
    const width = Math.max(...[...pos.values()].map((p) => p.x)) + KW + 10, height = rows.length * Hh + 8;
    const st = (n) => { const p = chProgress(by.get(n)); return p.n && p.d === p.n ? 2 : p.d ? 1 : 0; };
    const el = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
    const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width, height, class: "wires", role: "img", "aria-label": "How the builds reuse each other" });
    for (const [a, b] of E) {
      const p = pos.get(a), q = pos.get(b), x1 = p.x + KW / 2, y1 = p.y + KH, x2 = q.x + KW / 2, y2 = q.y, my = (y1 + y2) / 2;
      svg.append(el("path", { d: `M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}`, class: "wire" + (st(a) === 2 && st(b) === 2 ? " lit" : "") }));
    }
    for (const c of chs) {
      const p = pos.get(c.num), s = st(c.num), a = el("a", { href: "#" + c.num, class: "wnode s" + s });
      const t = el("title", {}); t.textContent = `${c.num}. ${c.title}`; a.append(t);
      a.append(el("rect", { x: p.x, y: p.y, width: KW, height: KH, rx: 7, class: "cap" }));
      const num = el("text", { x: p.x + 8, y: p.y + 17, class: "wn" }); num.textContent = String(c.num).padStart(2, "0");
      const lbl = el("text", { x: p.x + 8, y: p.y + 34, class: "wl" }); lbl.textContent = (CFG.short_names || [])[c.num - 1] || "";
      a.append(num, lbl); svg.append(a);
    }
    return h("div", { class: "wiremap" },
      h("h3", { class: "sec-h" }, h("span", { class: "tree" }, "└──"), CFG.wireTitle || "How the builds wire together", h("small", {}, "each one reuses what sits above it · finish both ends and the wire lights up")),
      h("div", { class: "wm-scroll" }, svg));
  }

  function pageChapter(ch, sectionId) {
    sidebar(ch.id);
    const m = main();
    m.textContent = "";
    const runBlocks = [];
    for (const s of ch.sections) for (const b of s.blocks) if (b.type === "run") runBlocks.push(b);
    const ctx = {
      ch, review: false,
      runBlocksBefore(id) {
        const i = runBlocks.findIndex((b) => b.id === id);
        return runBlocks.slice(0, i < 0 ? runBlocks.length : i).filter((b) => !ranCells.has(b.id));
      },
    };
    const p = chProgress(ch);
    const pills = [modeSwitch(ch, "learn"), h("span", { class: "pill" }, `≈ ${ch.minutes} min`), h("span", { class: "pill", "data-count": ch.id }, `${p.d} / ${p.n} done`)].filter(Boolean);
    if (ch.world) pills.push(h("a", { class: "pill", href: "../worlds/#" + ch.world }, "Play this chapter in 3D →"));
    // The cover: a stepped wash of the track's colour that glows pink at its heart, the title in
    // serif, and this chapter's flower on the right, growing as the tasks below get done.
    const col = h("div", { class: "col" },
      h("header", { class: "ch-head cover dark" },
        h("div", { class: "cv-text" },
          h("div", { class: "eyebrow" }, `Chapter ${ch.num} · ${CFG.short}`),
          h("h1", {}, ch.title),
          h("p", { class: "tag" }, ch.tagline),
          h("div", { class: "meta" }, pills)),
        h("div", { class: "cv-art" }, flower(ch.id, "cv-ghost", { "data-stage": 4 }), flower(ch.id, "cv-fl"))),
      ch.goals.length ? h("div", { class: "goals" }, h("b", {}, "By the end you can"), h("ul", {}, ch.goals.map((g) => h("li", { html: g })))) : null,
    );
    // ---- step-by-step: one section at a time, the next unlocks when this one is done
    S.step = S.step || {};
    const N = ch.sections.length;
    let reached = Math.min(S.step[ch.id] || 0, N - 1);
    const stepsEl = h("div");
    const dots = h("div", { class: "dots" });
    const bar = h("div", { class: "stepbar" }, h("div", { class: "stepfill" }));
    const label = h("div", { class: "steplabel" });
    const head = h("div", { class: "stephead" }, label, dots, bar);
    // Build X: a blueprint of this build. Each step is one voxel part, and the parts stack into the
    // machine as you finish steps. The builds it reuses and the ones it unlocks hang off either side.
    const bp = CFG.wires ? h("div", { class: "bp" }) : null;
    col.append(...[bp, head, stepsEl].filter(Boolean));
    const unit = CFG.bpUnit || "part", bpName = ((CFG.short_names || [])[ch.num - 1] || ch.id).toLowerCase().replace(/\s+/g, "-");
    function drawBlueprint() {
      if (!bp) return;
      const built = ch.sections.filter((sec, i) => i < reached || (i === reached && !left(sec))).length, fin = !!S.step[ch.id + ":fin"];
      const sz = 20, cx = 34, cy = 22 + 3 * sz, k = 0.866 * sz;
      let cubes = "";
      ch.sections.forEach((sec, i) => {
        const gx = Math.floor(i / 3), gz = i % 3, x = cx + gx * k, y = cy + gx * sz * 0.5 - gz * sz;
        const st = i < built ? "done" : i === built && !fin ? "now" : "todo";
        cubes += `<g class="bp-c ${st}"><title>${i + 1}. ${esc(sec.title)}</title>`
          + `<path class="t" d="M${x} ${y - sz / 2}l${k} ${-sz / 2}l${k} ${sz / 2}l${-k} ${sz / 2}z"/>`
          + `<path class="l" d="M${x} ${y - sz / 2}l${k} ${sz / 2}v${sz}l${-k} ${-sz / 2}z"/>`
          + `<path class="r" d="M${x + k} ${y}l${k} ${-sz / 2}v${sz}l${-k} ${sz / 2}z"/></g>`;
      });
      const cols = Math.ceil(N / 3), w = cx + (cols + 1) * k + 10, hh = cy + cols * sz * 0.5 + sz + 6;
      const chip = (n, dir) => { const c = DATA.chapters.find((x) => x.num === n); return c ? h("a", { class: "bp-chip", href: "#" + n, title: c.title }, dir === "in" ? "← " : "→ ", h("b", {}, String(n).padStart(2, "0")), " " + ((CFG.short_names || [])[n - 1] || c.title)) : null; };
      const ins = CFG.wires.filter((e) => e[1] === ch.num).map((e) => chip(e[0], "in")), outs = CFG.wires.filter((e) => e[0] === ch.num).map((e) => chip(e[1], "out"));
      bp.textContent = "";
      bp.append(
        h("div", { class: "bp-art", html: `<svg viewBox="0 0 ${w} ${hh}" width="${w}" height="${hh}" aria-hidden="true">${cubes}</svg>` }),
        h("div", { class: "bp-txt" },
          h("div", { class: "bp-eye" }, `blueprint · ${ch.id}`),
          h("div", { class: "bp-name", html: `${esc(bpName)} <i>${fin ? "v1.0 · " + (CFG.shipWord || "shipped") : "v0." + built}</i>` }),
          h("p", { class: "bp-sub" }, fin ? `All ${N} ${unit}s in place. It works.` : `${built} of ${N} ${unit}s in place. Every step you finish adds one.`),
          ins.length ? h("div", { class: "bp-row" }, h("span", {}, "builds on"), ins) : null,
          outs.length ? h("div", { class: "bp-row" }, h("span", {}, "leads to"), outs) : null));
    }
    const req = (sec) => sec.blocks.filter((b) => COUNTABLE.has(b.type));
    const left = (sec) => req(sec).filter((b) => !S.done[b.id]).length;
    let gate = null, finale = null;
    // On wide screens a rail on the right lists every step as a branch, with where you are.
    const railList = h("ol", { class: "rail-steps" });
    // Words you met: every bold term in the lesson text, with the sentence that explains it.
    // They line up in the rail as you read, and come back as a glossary when you finish.
    const words = new Map();
    const railWords = h("div", { class: "rail-words" });
    function collectWords(el) {
      el.querySelectorAll(".prose strong, .prose b").forEach((s) => {
        const t = s.textContent.trim(), k = t.toLowerCase();
        if (t.length < 3 || t.length > 40 || /[=()[\]{}<>]/.test(t) || words.has(k)) return;
        const p = s.closest("p, li");
        if (!p) return;
        const txt = p.textContent.replace(/\s+/g, " "), at = txt.indexOf(t);
        const from = txt.slice(0, at).search(/[.!?:] [^.!?:]*$/);
        let to = txt.slice(at + t.length).search(/[.!?](\s|$)/);
        to = to < 0 ? txt.length : at + t.length + to + 1;
        s.classList.add("term");
        words.set(k, { t, def: txt.slice(from < 0 ? 0 : from + 2, to).trim(), el: s });
      });
    }
    const flash = (el) => { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); };
    function drawWords() {
      railWords.textContent = "";
      if (!words.size) return;
      railWords.append(h("div", { class: "rail-h" }, `Words you met · ${words.size}`),
        h("div", { class: "chips" }, [...words.values()].map((w) => h("button", { class: "word", title: w.def, onclick: () => flash(w.el) }, w.t))));
    }
    // Say it in your own words: one note per step. Writing it is how you find the part you don't get yet.
    S.notes = S.notes || {};
    function noteBox(sec) {
      const k = ch.id + ":" + sec.id;
      const ta = h("textarea", { rows: 2, placeholder: "One or two sentences, as if you were explaining it to a friend…", "aria-label": "This step in your own words" });
      ta.value = S.notes[k] || "";
      const said = h("span", { class: "own-s" }, ta.value ? "saved · it goes in your build log" : "");
      ta.addEventListener("input", () => {
        const v = ta.value.trim();
        if (v) S.notes[k] = v; else delete S.notes[k];
        if (v.length > 30 && !S.notes[k + "#xp"]) { S.notes[k + "#xp"] = 1; award(5, "said it in your own words"); }
        said.textContent = v ? "saved · it goes in your build log" : "";
        save();
      });
      return h("details", { class: "own", open: ta.value ? true : null },
        h("summary", {}, h("code", {}, "└──"), h("b", {}, "Say it in your own words"), h("small", {}, "+5 XP")), ta, said);
    }
    const railNote = h("p", { class: "rail-note" });
    const rail = h("aside", { class: "rail", "aria-label": "Steps in this chapter" },
      h("div", { class: "rail-fl" }, flower(ch.id, "rail-flower")),
      h("div", { class: "rail-h" }, `Chapter ${ch.num} · steps`), railList, railNote, railWords);
    function drawRail() {
      railList.textContent = "";
      ch.sections.forEach((sec, i) => {
        const done = i < reached || (i === reached && !left(sec));
        const state = done ? "done" : i === reached ? "now" : "locked";
        railList.append(h("li", { class: state },
          h("button", { disabled: i > reached, onclick: () => document.getElementById("s-" + sec.id)?.scrollIntoView({ behavior: "smooth" }) },
            h("i", { class: "g " + (done ? "g2" : i === reached ? "g1" : "g0") }), h("span", {}, sec.title))));
      });
      const pr = chProgress(ch);
      railNote.textContent = `${pr.d} of ${pr.n} tasks · your flower is ${STAGE_NAMES[window.GARDEN ? GARDEN.stage(pr.pct) : 0]}`;
      drawWords();
    }
    function drawHead() {
      drawRail();
      drawBlueprint();
      const doneSteps = ch.sections.filter((sec, i) => i < reached || (i === reached && !left(sec) && S.step[ch.id + ":fin"])).length;
      label.innerHTML = `<b>Step ${reached + 1} of ${N}</b> · ${esc(ch.sections[reached].title)}`;
      bar.firstChild.style.width = Math.round(100 * (reached + (left(ch.sections[reached]) ? 0 : 1)) / N) + "%";
      dots.textContent = "";
      ch.sections.forEach((sec, i) => {
        const state = i < reached ? "done" : i === reached ? "now" : "locked";
        const d = h("button", { class: "dot " + state, title: (i + 1) + ". " + sec.title + (state === "locked" ? " (locked)" : ""), "aria-label": `Step ${i + 1}: ${sec.title}`, disabled: state === "locked" });
        d.onclick = () => document.getElementById("s-" + sec.id)?.scrollIntoView({ behavior: "smooth" });
        dots.append(d);
      });
    }
    function drawGate() {
      if (gate) gate.remove();
      const sec = ch.sections[reached];
      const n = left(sec);
      const last = reached === N - 1;
      const go = h("button", { class: "btn primary big", disabled: n > 0 }, last ? "Finish chapter ✓" : `Continue to step ${reached + 2}: ${ch.sections[reached + 1].title} →`);
      const skip = n > 0 ? h("button", { class: "linkish" }, "skip for now") : null;
      const msg = n > 0 ? `Finish the ${n} task${n > 1 ? "s" : ""} in this step to unlock the next one.` : (last ? "Every step done. Wrap it up:" : "Step complete. Nice.");
      gate = h("div", { class: "gate" + (n ? "" : " open") }, h("p", {}, msg), h("div", { class: "btns" }, go, skip));
      const advance = (earned) => {
        if (earned) award(10, "step complete");
        if (last) { S.step[ch.id + ":fin"] = 1; save(); gate.remove(); gate = null; drawHead(); showFinale(); return; }
        reached++;
        S.step[ch.id] = Math.max(S.step[ch.id] || 0, reached);
        save();
        gate.remove(); gate = null;
        const el = renderSection(ch.sections[reached]);
        stepsEl.append(el);
        drawHead(); drawGate();
        el.scrollIntoView({ behavior: "smooth" });
      };
      go.onclick = () => advance(true);
      if (skip) skip.onclick = () => advance(false);
      stepsEl.append(gate);
    }
    function renderSection(sec) {
      const i = ch.sections.indexOf(sec);
      const el = h("section", { class: "sec", id: "s-" + sec.id }, h("h2", {}, h("span", { class: "stepno" }, "Step " + (i + 1)), sec.title));
      for (const b of sec.blocks) el.append(renderBlock(b, ctx));
      collectWords(el);
      el.append(noteBox(sec));
      return el;
    }
    // The build log: every step as a branch with your own note under it, then the words you met.
    // One button copies it all as Markdown, ready for your own notes app.
    function buildLog() {
      const rows = ch.sections.map((sec, i) => {
        const note = S.notes[ch.id + ":" + sec.id];
        return h("li", {}, h("code", {}, i === N - 1 ? "└──" : "├──"), h("b", {}, sec.title),
          note ? h("q", {}, note) : h("span", { class: "nope" }, "no note yet: open “Say it in your own words” in this step"));
      });
      const list = [...words.values()];
      const md = () => [`# ${ch.num}. ${ch.title}`, "", ...ch.sections.map((sec) => `- **${sec.title}**` + (S.notes[ch.id + ":" + sec.id] ? `: ${S.notes[ch.id + ":" + sec.id]}` : "")),
        ...(list.length ? ["", "## Words", "", ...list.map((w) => `- **${w.t}**: ${w.def}`)] : [])].join("\n");
      const copy = h("button", { class: "btn" }, "Copy as Markdown");
      copy.onclick = () => navigator.clipboard?.writeText(md()).then(() => { copy.textContent = "Copied ✓"; }, () => toast("Couldn't copy. Select the log and copy it by hand."));
      return h("div", { class: "log" },
        CFG.wires ? h("div", { class: "shipped", "aria-hidden": "true" }, CFG.shipWord || "shipped", h("small", {}, `${bpName} v1.0`)) : null,
        h("div", { class: "log-h" }, h("span", {}, `build log · ${ch.id}`), h("span", {}, new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }))),
        h("ol", { class: "log-steps" }, rows),
        list.length ? h("details", { class: "log-words" }, h("summary", {}, `Words you met · ${list.length}`),
          h("dl", {}, list.map((w) => [h("dt", {}, w.t), h("dd", {}, w.def)]))) : null,
        h("div", { class: "btns" }, copy));
    }
    function showFinale() {
      if (finale) finale.remove();
      const pr = chProgress(ch);
      const i = DATA.chapters.indexOf(ch);
      const nxt = DATA.chapters[i + 1];
      const grown = flower(ch.id, "fin-fl", { "data-stage": 4 });
      finale = h("div", { class: "finale" },
        h("div", { class: "fin-art dark" }, grown),
        h("div", { class: "eyebrow" }, "Chapter " + ch.num + " complete · in full bloom"),
        h("h2", {}, "You can now…"),
        h("ul", { class: "wins" }, ch.goals.map((g) => h("li", { html: g }))),
        buildLog(),
        h("p", {}, `${pr.d} of ${pr.n} tasks done. ${Object.keys(S.rev).filter((k) => k.startsWith(ch.id)).length} items from this chapter are in your review deck; they'll come back tomorrow, then in 3, 7, 16 and 35 days.`),
        h("div", { class: "btns" },
          nxt ? h("a", { class: "btn primary big", href: "#" + nxt.num }, `Start chapter ${nxt.num}: ${nxt.title} →`) : h("a", { class: "btn primary big", href: "#review" }, "Go to spaced review →"),
          ch.world ? h("a", { class: "btn", href: "../worlds/#" + ch.world }, "Replay it in 3D") : null));
      stepsEl.append(finale);
      // grow it from seed in front of you, the first time; after that, just show it
      requestAnimationFrame(() => {
        if (!window.GARDEN || !grown.clientWidth) return;
        grown.dataset.drawn = "4:" + grown.clientWidth + "x" + grown.clientHeight;
        const o = { id: TRACK + ":" + ch.id, stage: 4, hues: HUES, ink: "rgba(255,255,255,.7)" };
        if (S.step[ch.id + ":bloomed"]) GARDEN.draw(grown, o);
        else { S.step[ch.id + ":bloomed"] = 1; save(); GARDEN.grow(grown, o); }
      });
      finale.scrollIntoView({ behavior: "smooth" });
    }
    for (let k = 0; k <= reached; k++) stepsEl.append(renderSection(ch.sections[k]));
    onProgress = () => { if (gate) drawGate(); drawHead(); bloomAll(); };
    drawHead();
    if (S.step[ch.id + ":fin"]) showFinale(); else drawGate();
    const i = DATA.chapters.indexOf(ch);
    const prev = DATA.chapters[i - 1], next = DATA.chapters[i + 1];
    col.append(h("div", { class: "pager" },
      prev ? h("a", { class: "btn", href: "#" + prev.num }, "← " + prev.num + ". " + prev.title) : h("span"),
      next ? h("a", { class: "btn", href: "#" + next.num }, next.num + ". " + next.title + " →") : h("span")));
    m.append(h("div", { class: "chgrid" }, col, rail));
    requestAnimationFrame(() => bloomAll(true));
    document.title = `${ch.num}. ${ch.title} · ${CFG.pageTitle}`;
    if (sectionId) { const t = document.getElementById("s-" + sectionId); if (t) t.scrollIntoView(); else window.scrollTo(0, 0); }
    else window.scrollTo(0, 0);
    warmSoon(ch);
  }

  // Start Python once the page has painted and gone quiet, so arriving on a chapter never stutters.
  // A Run pressed before then starts it at once anyway.
  let warmT = 0;
  function warmSoon(ch) {
    clearTimeout(warmT);
    const go = () => { if (location.hash.slice(1).split("/")[0] === String(ch.num)) Runner.start(ch.prelude); };
    warmT = setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(go, { timeout: 2000 }) : go()), 600);
  }

  function pageReview() {
    onProgress = null;
    sidebar("review");
    const m = main();
    m.textContent = "";
    const queue = dueItems();
    const total = queue.length;
    const col = h("div", { class: "col" },
      h("header", { class: "ch-head" }, h("div", { class: "eyebrow" }, "Spaced review · " + CFG.short), h("h1", {}, "Bring it back"),
        h("p", { class: "tag" }, "Each item returns just as you're about to forget it. Get it right and it waits longer next time; miss it and it comes back tomorrow. Exercises start from the blank starter again: no peeking at your old code.")));
    const stage = h("div");
    col.append(stage);
    m.append(col);
    document.title = "Review · " + CFG.pageTitle;
    window.scrollTo(0, 0);
    const upcoming = Object.values(S.rev).filter((r) => r.due > Date.now()).length;
    if (!total) {
      stage.append(h("div", { class: "empty" }, h("p", {}, Object.keys(S.rev).length ? `Nothing due right now. ${upcoming} item${upcoming === 1 ? "" : "s"} scheduled for later.` : "Your deck is empty. Work through a chapter: every prediction, quiz, puzzle and exercise you finish lands here."), h("a", { class: "btn primary", href: "#1" }, "Open chapter 1")));
      return;
    }
    let idx = 0, right = 0;
    Runner.start();
    function next() {
      stage.textContent = "";
      if (idx >= queue.length) {
        stage.append(h("div", { class: "empty" }, h("p", {}, `Done: ${right} of ${total} on the first try. Come back tomorrow for the next batch.`), h("a", { class: "btn primary", href: "#" }, "Back to chapters")));
        updateReviewCount();
        return;
      }
      const { ch, b } = findBlock(queue[idx]);
      let graded = false;
      const nextBtn = h("button", { class: "btn primary", disabled: true }, idx + 1 < queue.length ? "Next →" : "Finish");
      const ctx = {
        ch, review: true, runBlocksBefore: () => [],
        onResult(ok, provisional) {
          if (graded) return;
          graded = true;
          if (ok) right++;
          schedule(b.id, ok);
          nextBtn.disabled = false;
          if (provisional) nextBtn.textContent = (idx + 1 < queue.length ? "Next →" : "Finish") + " (or keep trying)";
        },
      };
      nextBtn.onclick = () => { idx++; next(); };
      stage.append(h("p", { class: "kbd" }, `Item ${idx + 1} of ${total} · from chapter ${ch.num}, ${ch.title}`), renderBlock(b, ctx), h("div", { class: "btns" }, nextBtn, h("a", { class: "btn", href: `#${ch.num}` }, "Revisit the chapter")));
    }
    next();
  }

  function route() {
    document.body.classList.remove("menu");
    const hash = decodeURIComponent(location.hash.slice(1));
    if (!hash) return pageHome();
    if (hash === "review") return pageReview();
    if (hash === "puzzles") return pagePuzzleWall();
    const [num, sec] = hash.split("/");
    const ch = DATA.chapters.find((c) => String(c.num) === num);
    if (ch && sec === "puzzle" && ch.puzzles && ch.puzzles.length) return pagePuzzles(ch);
    if (ch) return pageChapter(ch, sec === "puzzle" ? undefined : sec);
    pageHome();
  }

  // ---------------------------------------------------------------- boot --
  async function boot() {
    if (TRACK) document.body.classList.add("k-" + TRACK);
    setHues();
    document.querySelector(".menu-btn")?.addEventListener("click", () => document.body.classList.toggle("menu"));
    // Lessons are one JSON file. Try it a few times before giving up, then offer a retry button.
    for (let i = 0; i < 4 && !DATA; i++) {
      try {
        const r = await fetch(CFG.data, { cache: "no-cache" });
        if (!r.ok) throw new Error(r.status);
        DATA = await r.json();
      } catch (e) {
        if (i < 3) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
      }
    }
    if (!DATA) {
      const m = main();
      m.textContent = "";
      m.append(h("div", { class: "empty" },
        h("p", {}, location.protocol === "file:" ? "Could not load the lessons. Serve the folder instead (python3 -m http.server)." : "Could not load the lessons. The connection may have dropped."),
        h("button", { class: "btn primary", onclick: () => location.reload() }, "Try again")));
      return;
    }
    if (LOCAL) setChip("ready", "Python ready (local)");
    window.addEventListener("hashchange", route);
    route();
    updateReviewCount();
    drawStats();
  }
  boot();
})();
