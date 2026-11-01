/* Voxel Network Lab: code tracks.
   One engine renders every chapter of both books from content/<track>.json.
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
  function markDone(id) {
    const first = !S.done[id];
    S.done[id] = 1;
    save();
    refreshProgress();
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
    worker: null, seq: 0, pending: new Map(), state: "idle",
    start() {
      if (LOCAL || this.worker) return;
      this.worker = new Worker("../learn/py-worker.js");
      this.worker.onmessage = (e) => {
        const d = e.data;
        if (d.status) { setChip(d.text === "ready" ? "ready" : "busy", d.text === "ready" ? "Python ready" : d.text); return; }
        const p = this.pending.get(d.id);
        if (p) { this.pending.delete(d.id); p.resolve(d.res); }
        if (!this.pending.size) setChip("ready", "Python ready");
      };
      this.worker.onerror = () => setChip("", "Python failed to load. Check your connection and reload.");
      setChip("busy", "Starting Python…");
    },
    async run(req) {
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
        this.pending.set(id, { resolve, reject });
        this.worker.postMessage({ id, req });
      });
    },
    stop() {
      if (!this.worker) return;
      this.worker.terminate();
      this.worker = null;
      for (const p of this.pending.values()) p.resolve({ error: "Stopped. Python was restarted, so earlier examples need running again.", stdout: "", figures: [] });
      this.pending.clear();
      ranCells.clear();
      this.start();
    },
  };
  const ranCells = new Set();
  function setChip(cls, text) {
    const c = $("#py-chip");
    if (!c) return;
    c.className = "chip " + cls;
    c.lastChild.textContent = text;
  }

  // Run a request with a Run button that turns into Stop while it waits.
  async function runWith(btn, req) {
    const label = btn.textContent;
    const handler = btn.onclick;
    btn.disabled = true;
    btn.textContent = "Running…";
    let stopT = setTimeout(() => {
      if (LOCAL) return;
      btn.disabled = false;
      btn.textContent = "■ Stop";
      btn.onclick = (e) => { e.stopImmediatePropagation(); Runner.stop(); };
    }, 2500);
    try { return await Runner.run(req); }
    finally {
      clearTimeout(stopT);
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
        for (const f of res.figures || []) figs.append(h("img", { src: "data:image/png;base64," + f, alt: "Plot produced by your code" }));
        if (extra) figs.append(extra);
      },
    };
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
        ...(r.figures || []).map((f) => h("div", { class: "figs" }, h("img", { src: "data:image/png;base64," + f, alt: "Plot" }))),
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
      const r = await runWith(runBtn, { op: "check", prelude: ctx.ch.prelude, setup: b.setup, code: ed.get(), tests: b.tests });
      out.show({ stdout: r.stdout, error: r.error, figures: r.figures });
      res.textContent = "";
      const meter = h("span", { class: "meter" }, Array.from({ length: r.total || 0 }, (_, i) => h("i", { class: i < r.ok ? "on" : "" })));
      if (r.passed) {
        res.append(h("div", { class: "result pass" }, h("b", {}, "All checks pass."), meter, " ", kind === "rebuild" ? "You rebuilt it from memory. That's the strongest kind of practice." : "Nice work."));
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

  function renderBlock(b, ctx) {
    switch (b.type) {
      case "md": return h("div", { class: "prose", html: b.html });
      case "run": return renderRun(b, ctx);
      case "predict": return renderPredict(b, ctx);
      case "parsons": return renderParsons(b, ctx);
      case "exercise": return renderExercise(b, ctx);
      case "quiz": return renderQuiz(b, ctx);
      case "recall": return renderRecall(b, ctx);
      case "bridge": return h("div", { class: "bridge" }, h("div", { class: "cube", "aria-hidden": "true" }, h("i"), h("i"), h("i"), h("i")), h("div", { html: b.html }));
    }
    return h("div");
  }

  // ------------------------------------------------------------ progress --
  let DATA = null;
  const COUNTABLE = new Set(["run", "predict", "parsons", "exercise", "quiz", "recall"]);
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
      if (a) a.classList.toggle("done", p.n > 0 && p.d === p.n);
    }
  }
  function findBlock(id) {
    for (const ch of DATA.chapters) for (const s of ch.sections) for (const b of s.blocks) if (b.id === id) return { ch, b };
    return null;
  }
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
    side.append(h("h2", {}, CFG.short || "Chapters"));
    side.append(h("a", { href: "#", "aria-current": current === "home" ? "page" : null }, h("span", { class: "n" }, "★"), "How this works"));
    side.append(h("a", { href: "#review", "aria-current": current === "review" ? "page" : null }, h("span", { class: "n" }, "↻"), "Spaced review"));
    let part = null;
    for (const ch of DATA.chapters) {
      if (ch.part && ch.part !== part) { part = ch.part; side.append(h("div", { class: "part" }, part)); }
      const p = chProgress(ch);
      side.append(h("a", { href: "#" + ch.num, "data-ch": ch.id, class: p.n && p.d === p.n ? "done" : null, "aria-current": current === ch.id ? "page" : null },
        h("span", { class: "n" }, ch.num), h("span", {}, ch.title), h("span", { class: "pbar" }, h("i", { "data-prog": ch.id, style: `width:${p.pct}%` }))));
    }
  }

  function pageHome() {
    sidebar("home");
    const m = main();
    m.textContent = "";
    const col = h("div", { class: "col hero" },
      h("h1", {}, CFG.heroTitle),
      h("p", { class: "lede", html: CFG.heroLede }),
      h("h3", {}, "Every chapter climbs the same ladder"),
      h("ol", { class: "ladder" },
        h("li", {}, h("b", {}, "Read & run"), "The book's code, live. Change a number and run it again."),
        h("li", {}, h("b", {}, "Predict"), "Type what a program prints before you run it."),
        h("li", {}, h("b", {}, "Reorder"), "Scrambled lines, sometimes with decoys. Rebuild the program."),
        h("li", {}, h("b", {}, "Fill the blanks"), "The skeleton is there; you write the heart of it."),
        h("li", {}, h("b", {}, "Bug hunt"), "It runs, but it's wrong. Find out why."),
        h("li", {}, h("b", {}, "Write it"), "A blank function and a set of checks."),
        h("li", {}, h("b", {}, "Rebuild & explain"), "The chapter's core idea from memory, then in your own words.")),
      h("p", { html: "Anything you get right (or wrong) joins your <a href=\"#review\">spaced review</a> deck and comes back after 1, 3, 7, 16 and 35 days. Coming back is what makes it stick." }),
      CFG.homeNote ? h("div", { class: "note", html: CFG.homeNote }) : null,
      h("h3", {}, "Chapters"),
      h("div", { class: "grid" }, DATA.chapters.map((ch) => {
        const p = chProgress(ch);
        return h("a", { class: "card", href: "#" + ch.num }, h("span", { class: "num" }, "Chapter " + ch.num), h("h3", {}, ch.title), h("p", {}, ch.tagline), h("div", { class: "pbar" }, h("i", { "data-prog": ch.id, style: `width:${p.pct}%` })));
      })));
    m.append(col);
    document.title = CFG.pageTitle;
    window.scrollTo(0, 0);
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
    const pills = [h("span", { class: "pill" }, `≈ ${ch.minutes} min`), h("span", { class: "pill", "data-count": ch.id }, `${p.d} / ${p.n} done`)];
    if (ch.world) pills.push(h("a", { class: "pill", href: "../#" + ch.world }, "Play this chapter in 3D →"));
    const col = h("div", { class: "col" },
      h("header", { class: "ch-head" },
        h("div", { class: "eyebrow" }, `Chapter ${ch.num} · ${CFG.short}`),
        h("h1", {}, ch.title),
        h("p", { class: "tag" }, ch.tagline),
        h("div", { class: "meta" }, pills),
        ch.goals.length ? h("div", { class: "goals" }, h("b", {}, "By the end you can"), h("ul", {}, ch.goals.map((g) => h("li", { html: g })))) : null),
      h("nav", { class: "toc", "aria-label": "Sections" }, ch.sections.map((s) => h("a", { href: `#${ch.num}/${s.id}` }, s.title))));
    for (const s of ch.sections) {
      const sec = h("section", { class: "sec", id: "s-" + s.id }, h("h2", {}, s.title));
      for (const b of s.blocks) sec.append(renderBlock(b, ctx));
      col.append(sec);
    }
    const i = DATA.chapters.indexOf(ch);
    const prev = DATA.chapters[i - 1], next = DATA.chapters[i + 1];
    col.append(h("div", { class: "pager" },
      prev ? h("a", { class: "btn", href: "#" + prev.num }, "← " + prev.num + ". " + prev.title) : h("span"),
      next ? h("a", { class: "btn primary", href: "#" + next.num }, next.num + ". " + next.title + " →") : h("a", { class: "btn primary", href: "#review" }, "Go to spaced review →")));
    m.append(col);
    document.title = `${ch.num}. ${ch.title} · ${CFG.pageTitle}`;
    if (sectionId) { const t = document.getElementById("s-" + sectionId); if (t) { t.scrollIntoView(); return; } }
    window.scrollTo(0, 0);
    Runner.start();
  }

  function pageReview() {
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
    const [num, sec] = hash.split("/");
    const ch = DATA.chapters.find((c) => String(c.num) === num);
    if (ch) return pageChapter(ch, sec);
    pageHome();
  }

  // ---------------------------------------------------------------- boot --
  async function boot() {
    document.querySelector(".menu-btn")?.addEventListener("click", () => document.body.classList.toggle("menu"));
    try {
      const r = await fetch(CFG.data, { cache: "no-cache" });
      DATA = await r.json();
    } catch (e) {
      main().textContent = "Could not load the lessons. If you opened this file directly, serve the folder instead (python3 -m http.server).";
      return;
    }
    if (LOCAL) setChip("ready", "Python ready (local)");
    window.addEventListener("hashchange", route);
    route();
    updateReviewCount();
  }
  boot();
})();
