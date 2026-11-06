/* Workbench: build one real program, ticket by ticket, in a real editor.
   The program is a few Python files. Run starts it (learn/harness.py project_load) and the terminal sends each
   line to its handle(line). Test runs this ticket's checks and every earlier ticket's. When they all pass you
   commit, the history grows a node, the map grows a block, and the next ticket opens.
   Progress lives in the shared store (vnl-code-v1) under S.wb, merged on save like the design studio. */
(async () => {
  "use strict";
  const CM = window.CM;
  const $ = (s, r = document) => r.querySelector(s);
  const h = (tag, attrs, ...kids) => {
    const el = document.createElementNS(tag.startsWith("svg:") ? "http://www.w3.org/2000/svg" : "http://www.w3.org/1999/xhtml", tag.replace(/^svg:/, ""));
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const ICON = {
    run: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l9-5.5z"/></svg>',
    test: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M2.5 8.5l3.5 3.5 7.5-8"/></svg>',
    commit: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="8" r="3"/><path d="M1 8h4M11 8h4"/></svg>',
    branch: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="4" cy="3" r="1.6"/><circle cx="4" cy="13" r="1.6"/><circle cx="12" cy="5" r="1.6"/><path d="M4 4.6v6.8M12 6.6c0 3-8 2-8 4.8"/></svg>',
  };
  const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
  const MOD = MAC ? "⌘" : "Ctrl ";

  // ------------------------------------------------------------ storage --
  const KEY = "vnl-code-v1";
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } };
  let S = Object.assign({ done: {}, code: {} }, load());
  S.wb = S.wb || {};
  let saveT = 0;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const now = Object.assign({ done: {}, code: {} }, load());
      now.done = Object.assign(now.done, S.done);
      now.wb = Object.assign(now.wb || {}, S.wb);
      now.xp = Math.max(now.xp || 0, S.xp || 0);
      now.days = [...new Set([...(now.days || []), ...(S.days || [])])];
      S = Object.assign(now, { wb: now.wb });
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ }
      saved(true);
    }, 300);
  }

  // ------------------------------------------------------------- runner --
  // The same two runners the lessons use: Pyodide in a worker, or the dev server's CPython (?runner=local).
  const LOCAL = new URLSearchParams(location.search).get("runner") === "local";
  const Runner = {
    worker: null, seq: 0, pending: new Map(), status: LOCAL ? "ready" : "idle",
    start() {
      if (LOCAL || this.worker) return;
      this.worker = new Worker("../learn/py-worker.js");
      this.worker.onmessage = (e) => {
        const d = e.data;
        if (d.status) { this.status = d.text; pyStatus(); return; }
        if (d.started) return;
        const p = this.pending.get(d.id);
        if (p) { this.pending.delete(d.id); p(d.res); }
        pyStatus();
      };
      this.worker.onerror = (e) => {
        e.preventDefault && e.preventDefault();
        this.worker && this.worker.terminate();
        this.worker = null;
        this.status = "failed";
        for (const p of this.pending.values()) p({ error: "Python couldn't start (the connection dropped?). Press Run to try again." });
        this.pending.clear();
        pyStatus();
      };
      this.status = "Starting Python…";
      this.worker.postMessage({ id: ++this.seq, req: { op: "warm" } });
      pyStatus();
    },
    async run(req) {
      if (LOCAL) {
        this.busy = true; pyStatus();
        try { return await (await fetch("/__run", { method: "POST", body: JSON.stringify(req) })).json(); }
        catch (e) { return { error: "The local runner didn't answer." }; }
        finally { this.busy = false; pyStatus(); }
      }
      this.start();
      const id = ++this.seq;
      this.busy = true; pyStatus();
      return new Promise((resolve) => {
        this.pending.set(id, (r) => { this.busy = this.pending.size > 0; resolve(r); });
        this.worker.postMessage({ id, req });
      });
    },
    // A program stuck in a loop can only be stopped by throwing the whole worker away.
    stop() {
      if (LOCAL || !this.worker) return;
      this.worker.terminate();
      this.worker = null;
      for (const p of this.pending.values()) p({ error: "Stopped. Python restarted, so the program and its disk start fresh." });
      this.pending.clear();
      this.busy = false;
      this.start();
    },
  };

  // --------------------------------------------------------------- data --
  const root = $("#ide");
  let DATA;
  try { DATA = await (await fetch("../content/wb.json", { cache: "no-cache" })).json(); }
  catch (e) { root.innerHTML = '<p class="ide-load">Couldn\'t load the projects. Reload to try again.</p>'; return; }
  const PROJECTS = DATA.projects;
  const route = () => {
    const m = /^#(\d+)(?:\/(t\d+))?/.exec(location.hash) || [];
    const proj = PROJECTS.find((p) => p.num === +m[1]) || PROJECTS[0];
    return { proj, tid: m[2] };
  };
  let P, ST, ticketIx, view;   // project, its saved state, the ticket being read, the CodeMirror view
  const states = new Map();    // file -> EditorState
  const diags = {};            // file -> diagnostics
  let running = false, lastPass = null, termLog = [], hist = [], histAt = 0, disk = [], panelTab = "term", diffWhat = null, tested = null;

  function stateFor(proj) {
    let st = S.wb[proj.id];
    if (!st) {
      st = S.wb[proj.id] = { cur: 0, files: { ...proj.tickets[0].start }, commits: [], todo: {}, hints: {}, open: [], active: null };
      st.open = Object.keys(st.files);
      st.active = st.open[0];
    }
    return st;
  }
  const cur = () => P.tickets[ST.cur] || null;            // the ticket you're working on (null when all done)
  const shown = () => P.tickets[ticketIx] || null;          // the ticket the panel shows
  const lastCommit = () => ST.commits[ST.commits.length - 1];
  const committedFiles = () => (lastCommit() ? lastCommit().files : P.tickets[0].start);
  const changed = (f) => (committedFiles()[f] ?? null) !== ST.files[f];
  const fileOrder = (names) => P.files.filter((f) => names.includes(f));
  const filesKey = () => JSON.stringify(ST.files);
  function sha(text) {
    let a = 0x811c9dc5, b = 0x1b873593;
    for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822507); }
    return ((a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0")).slice(0, 7);
  }

  // ------------------------------------------------------------- editor --
  const tagsHL = CM.HighlightStyle.define([
    { tag: CM.tags.keyword, class: "tk-k" },
    { tag: [CM.tags.controlKeyword, CM.tags.definitionKeyword, CM.tags.moduleKeyword, CM.tags.operatorKeyword], class: "tk-k" },
    { tag: CM.tags.function(CM.tags.definition(CM.tags.variableName)), class: "tk-def" },
    { tag: CM.tags.definition(CM.tags.className), class: "tk-cls" },
    { tag: CM.tags.className, class: "tk-cls" },
    { tag: [CM.tags.string, CM.tags.special(CM.tags.string)], class: "tk-str" },
    { tag: [CM.tags.number, CM.tags.bool, CM.tags.null], class: "tk-num" },
    { tag: CM.tags.comment, class: "tk-com" },
    { tag: CM.tags.self, class: "tk-self" },
    { tag: [CM.tags.standard(CM.tags.variableName), CM.tags.function(CM.tags.variableName)], class: "tk-bi" },
    { tag: [CM.tags.operator, CM.tags.punctuation, CM.tags.bracket], class: "tk-op" },
    { tag: CM.tags.propertyName, class: "tk-prop" },
  ]);
  const PYWORDS = "False None True and as assert break class continue def del elif else except finally for from global if import in is lambda not or pass raise return try while with yield print len range sorted dict list str int open isinstance enumerate zip self".split(" ");
  // Autocomplete from every file in the project, not just the open one: import store, then store.<names>.
  function complete(ctx) {
    const w = ctx.matchBefore(/[A-Za-z_]\w*/);
    if (!w || (w.from === w.to && !ctx.explicit)) return null;
    const seen = new Set(PYWORDS);
    for (const src of Object.values(ST.files)) for (const m of src.matchAll(/[A-Za-z_]\w{2,}/g)) seen.add(m[0]);
    seen.delete(w.text);
    return { from: w.from, options: [...seen].map((label) => ({ label, type: PYWORDS.includes(label) ? "keyword" : "variable" })), validFor: /^\w*$/ };
  }
  const keys = CM.keymap.of([
    { key: "Mod-Enter", run: () => { doRun(); return true; } },
    { key: "Shift-Mod-Enter", run: () => { doTest(); return true; } },
    { key: "Mod-s", run: () => { openCommit(); return true; }, preventDefault: true },
  ]);
  // Indent guides, as real editors draw them: a faint line at the start of each four-space step of indentation,
  // so you can see which block a line belongs to.
  const guide = CM.Decoration.mark({ class: "cm-ig" });
  const indentGuides = CM.ViewPlugin.fromClass(class {
    constructor(v) { this.decorations = this.build(v); }
    update(u) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view); }
    build(v) {
      const out = [];
      for (const { from, to } of v.visibleRanges) {
        for (let pos = from; pos <= to;) {
          const line = v.state.doc.lineAt(pos), lead = (line.text.match(/^ +/) || [""])[0].length;
          for (let c = 0; c + 4 <= lead; c += 4) out.push(guide.range(line.from + c, line.from + c + 4));
          pos = line.to + 1;
        }
      }
      return CM.Decoration.set(out, true);
    }
  }, { decorations: (p) => p.decorations });
  function editorState(file, doc) {
    return CM.EditorState.create({
      doc,
      extensions: [
        keys,
        CM.lineNumbers(), CM.highlightActiveLineGutter(), CM.highlightSpecialChars(), CM.history(), CM.foldGutter({ markerDOM: (open) => h("span", { class: open ? "fo" : "fc" }, open ? "⌄" : "›") }), indentGuides,
        CM.drawSelection(), CM.dropCursor(), CM.EditorState.allowMultipleSelections.of(true), CM.indentOnInput(),
        CM.syntaxHighlighting(tagsHL), CM.bracketMatching(), CM.closeBrackets(), CM.autocompletion({ override: [complete] }),
        CM.rectangularSelection(), CM.crosshairCursor(), CM.highlightActiveLine(), CM.highlightSelectionMatches(),
        CM.indentUnit.of("    "), CM.lintGutter(), CM.python(),
        CM.keymap.of([...CM.closeBracketsKeymap, ...CM.defaultKeymap, ...CM.searchKeymap, ...CM.historyKeymap, ...CM.foldKeymap, ...CM.completionKeymap, ...CM.lintKeymap, CM.indentWithTab]),
        CM.EditorView.updateListener.of((u) => {
          if (u.docChanged) { ST.files[file] = u.state.doc.toString(); saved(false); save(); refreshMarks(); }
          if (u.selectionSet || u.docChanged) caret(u.state);
        }),
      ],
    });
  }
  function openFile(file) {
    if (!(file in ST.files)) return;
    stash();
    if (!ST.open.includes(file)) ST.open.push(file);
    ST.active = file;
    if (!states.has(file)) states.set(file, editorState(file, ST.files[file]));
    if (!view) view = new CM.EditorView({ state: states.get(file), parent: $(".ed", root) });
    else view.setState(states.get(file));
    view.dispatch(CM.setDiagnostics(view.state, diags[file] || []));
    renderTabs(); renderTree(); caret(view.state); save();
    if (phone()) pane(1);
  }
  // keep each file's state (undo history, folds) when switching tabs
  function stash() { if (view && ST.active && ST.active in ST.files) states.set(ST.active, view.state); }
  function jumpTo(file, line) {
    stash();
    openFile(file);
    const ln = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines)));
    view.dispatch({ selection: { anchor: ln.from }, effects: CM.EditorView.scrollIntoView(ln.from, { y: "center" }) });
    view.focus();
  }
  function markError(where, message) {
    for (const f of Object.keys(diags)) diags[f] = [];
    if (where && where[0] in ST.files) {
      const st = states.get(where[0]) || editorState(where[0], ST.files[where[0]]);
      states.set(where[0], st);
      const ln = st.doc.line(Math.max(1, Math.min(where[1], st.doc.lines)));
      const from = ln.from + (ln.text.length - ln.text.trimStart().length);
      diags[where[0]] = [{ from, to: Math.max(from + 1, ln.to), severity: "error", message }];
    }
    if (view) view.dispatch(CM.setDiagnostics(view.state, diags[ST.active] || []));
    renderTabs(); renderTree();
  }

  // --------------------------------------------------------------- shell --
  root.removeAttribute("aria-busy");
  root.innerHTML = "";
  const bar = h("div", { class: "wbar" });
  const panes = h("nav", { class: "wpanes", "aria-label": "Panes" },
    h("button", { "data-p": 0, onclick: () => pane(0) }, "Ticket"),
    h("button", { "data-p": 1, onclick: () => pane(1) }, "Code"));
  const side = h("aside", { class: "wside", "aria-label": "Explorer" });
  const mid = h("section", { class: "wmid" },
    h("div", { class: "tabs", role: "tablist" }), h("div", { class: "crumbs" }), h("div", { class: "ed" }),
    h("div", { class: "grip", title: "Drag to resize", role: "separator" }),
    h("div", { class: "wpanel" }, h("div", { class: "ptabs" }), h("div", { class: "pbody" })));
  const tick = h("aside", { class: "wtick", "aria-label": "Ticket" });
  const body = h("div", { class: "wbody" }, side, mid, tick);
  const stat = h("footer", { class: "wstat" });
  root.append(bar, panes, body, stat);

  // the panel's height is yours to drag
  const grip = $(".grip", mid);
  grip.addEventListener("pointerdown", (e) => {
    grip.setPointerCapture(e.pointerId);
    const r = mid.getBoundingClientRect();
    const move = (ev) => {
      const px = Math.max(90, Math.min(r.height - 150, r.bottom - ev.clientY));
      mid.style.setProperty("--panel-h", px + "px");
    };
    const up = () => { grip.removeEventListener("pointermove", move); grip.removeEventListener("pointerup", up); };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
  });

  // on a phone: two panes, Ticket and Code; tap the word or swipe the ticket sideways
  const phone = () => matchMedia("(max-width:900px)").matches;
  let paneAt = 1;
  function pane(i) {
    paneAt = i;
    body.style.setProperty("--pane", i);
    panes.querySelectorAll("button").forEach((b) => b.classList.toggle("on", +b.dataset.p === i));
    if (i === 1 && view) requestAnimationFrame(() => view.requestMeasure());
  }
  let sx = null;
  body.addEventListener("pointerdown", (e) => { if (phone() && !e.target.closest(".ed,.pbody,input")) sx = [e.clientX, e.clientY]; });
  body.addEventListener("pointerup", (e) => {
    if (!sx) return;
    const dx = e.clientX - sx[0], dy = e.clientY - sx[1];
    sx = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) pane(dx < 0 ? 1 : 0);
  });

  // ------------------------------------------------------------- render --
  function renderBar() {
    const t = cur();
    bar.innerHTML = "";
    bar.append(
      h("a", { class: "wproj", href: "./", title: "All projects" },
        h("span", { class: "cube", html: cubeSVG() }), h("b", {}, P.title.toLowerCase()), h("small", {}, P.kind)),
      h("span", { class: "wbranch", html: ICON.branch + " main" }),
      h("span", { class: "wtrack", "aria-label": "Tickets" }, P.tickets.map((tk, i) =>
        h("a", { href: `#${P.num}/${tk.id}`, class: (i < ST.cur ? "done" : "") + (i === ST.cur ? " cur" : ""), title: `#${i + 1} ${tk.title}${i > ST.cur ? " (locked)" : ""}` }))),
      h("span", { class: "wtk" }, t ? `ticket ${ST.cur + 1} of ${P.tickets.length}` : `all ${P.tickets.length} tickets committed`),
      h("span", { class: "wgrow" }),
      h("span", { class: "wact" },
        h("button", { class: "run", onclick: doRun, title: `Start the program (${MOD}↵)`, html: ICON.run + `<span>Run</span><kbd>${MOD}↵</kbd>` }),
        h("button", { class: "test", onclick: doTest, title: `Run the checks (⇧${MOD}↵)`, html: ICON.test + `<span>Test</span><kbd>⇧${MOD}↵</kbd>` }),
        h("button", { class: "commit", onclick: openCommit, disabled: !canCommit(), title: canCommit() ? `Commit (${MOD}S)` : "Every check has to pass first", html: ICON.commit + `<span>Commit</span><kbd>${MOD}S</kbd>` })));
    const hr = $("#hdr-right");
    if (hr) hr.textContent = "";
  }
  const canCommit = () => !!cur() && !!lastPass && lastPass === filesKey();
  function cubeSVG(c = "var(--w-acc)") {
    return `<svg viewBox="0 0 20 20"><polygon points="10,1 19,5.5 10,10 1,5.5" fill="${c}"/><polygon points="1,5.5 10,10 10,19 1,14.5" fill="${c}" opacity=".75"/><polygon points="19,5.5 10,10 10,19 19,14.5" fill="${c}" opacity=".5"/></svg>`;
  }

  function renderTree() {
    side.innerHTML = "";
    const have = fileOrder(Object.keys(ST.files));
    const later = P.files.filter((f) => !(f in ST.files));
    const firstTicket = (f) => P.tickets.findIndex((t) => f in t.start || f in t.solution);
    side.append(
      h("div", { class: "wh" }, "Explorer", h("em", {}, `${have.length} file${have.length === 1 ? "" : "s"}`)),
      h("ul", { class: "tree" },
        h("li", {}, h("div", { class: "root" }, "▾ " + P.title.toLowerCase())),
        have.map((f) => h("li", {}, h("button", { class: "f" + (f === ST.active ? " on" : ""), onclick: () => { stash(); openFile(f); } },
          h("i"), f, (diags[f] || []).length ? h("span", { class: "dot", style: "background:var(--w-bad)", title: "An error points here" }) : changed(f) ? h("span", { class: "dot", title: "Changed since your last commit" }) : null))),
        later.map((f) => h("li", {}, h("div", { class: "f ghost", title: "This file arrives with a later ticket" }, h("i"), f, h("small", {}, `#${firstTicket(f) + 1}`))))),
      h("div", { class: "wh" }, "Disk", h("em", {}, disk.length ? `${disk.length} file${disk.length > 1 ? "s" : ""}` : "")),
      h("ul", { class: "tree" }, disk.length ? disk.map((d) => h("li", {}, h("button", { class: "f disk", onclick: () => showPanel("disk") }, h("i"), d.name, h("small", {}, bytes(d.size)))))
        : h("li", {}, h("div", { class: "empty" }, "nothing written yet"))),
      h("div", { class: "wh" }, "History", h("em", {}, ST.commits.length ? `${ST.commits.length} commits` : "")),
      h("ul", { class: "hist" }, ST.commits.length ? [...ST.commits].reverse().map((c, k) =>
        h("li", { class: k === 0 && justCommitted ? "drop" : "" }, h("button", { class: diffWhat === c.sha ? "on" : "", onclick: () => { diffWhat = c.sha; showPanel("diff"); renderTree(); } },
          h("span", { class: "node" }), h("span", { class: "msg" }, c.msg), h("span", { class: "sha" }, `${c.sha} · #${P.tickets.findIndex((t) => t.id === c.ticket) + 1}`))))
        : h("li", {}, h("div", { class: "none" }, "no commits yet"))));
  }
  let justCommitted = false;
  const bytes = (n) => (n < 1024 ? n + " B" : (n / 1024).toFixed(1) + " KB");

  function renderTabs() {
    const tabs = $(".tabs", mid);
    tabs.innerHTML = "";
    for (const f of fileOrder(ST.open.filter((f) => f in ST.files))) {
      tabs.append(h("button", { role: "tab", "aria-selected": f === ST.active ? "true" : "false", class: f === ST.active ? "on" : "", onclick: () => { stash(); openFile(f); } },
        h("i"), f, (diags[f] || []).length ? h("span", { class: "dot", style: "background:var(--w-bad)" }) : changed(f) ? h("span", { class: "dot", title: "Changed since your last commit" }) : null));
    }
    crumbs();
  }
  function crumbs(fn) {
    const c = $(".crumbs", mid);
    c.innerHTML = "";
    c.append(P.title.toLowerCase(), " › ", h("b", {}, ST.active || ""), ...(fn ? [" › ", h("b", {}, fn)] : []));
  }
  function caret(state) {
    const pos = state.selection.main.head, ln = state.doc.lineAt(pos);
    $(".caret", stat) && ($(".caret", stat).textContent = `Ln ${ln.number}, Col ${pos - ln.from + 1}`);
    // the function you're in, for the breadcrumb
    let fn = null;
    for (let n = ln.number; n >= 1 && !fn; n--) {
      const m = /^(\s*)(def|class)\s+(\w+)/.exec(state.doc.line(n).text);
      if (m && (n === ln.number || m[1].length < (/^\s*/.exec(ln.text)[0].length) || ln.text.trim() === "")) fn = m[3];
    }
    crumbs(fn);
  }
  function refreshMarks() {
    clearTimeout(refreshMarks.t);
    refreshMarks.t = setTimeout(() => { renderTabs(); renderTree(); renderBar(); renderStat(); }, 250);
  }

  function renderStat() {
    stat.innerHTML = "";
    const r = tested;
    stat.append(
      h("span", { class: "py " + pyClass() }, pyText()),
      h("span", { class: "hide-s" }, "Python 3 · UTF-8"),
      h("span", { class: "grow" }),
      h("span", { class: r ? (r.passed ? "ok" : "bad") : "" }, r ? (r.passed ? `✓ ${r.total} checks pass` : `${r.ok} of ${r.total} checks`) : ""),
      h("span", { class: "caret" }, ""),
      h("span", { class: "sv hide-s" }, "saved"));
    if (view) caret(view.state);
  }
  function saved(yes) { const s = $(".sv", stat); if (s) s.textContent = yes ? "saved" : "saving…"; }
  const pyClass = () => (Runner.busy ? "busy" : Runner.status === "ready" ? "ready" : Runner.status === "failed" ? "" : "busy");
  const pyText = () => (Runner.busy ? "running…" : Runner.status === "ready" ? (LOCAL ? "Python ready (local)" : "Python ready") : Runner.status === "failed" ? "Python couldn't download · press Run to retry" : Runner.status === "idle" ? "Python loads on first Run" : Runner.status);
  function pyStatus() { const el = $(".py", stat); if (el) { el.className = "py " + pyClass(); el.textContent = pyText(); } }

  // ------------------------------------------------------------- ticket --
  function renderTicket() {
    tick.innerHTML = "";
    const t = shown();
    if (!t) { renderFinish(); renderMap(); return; }
    const i = ticketIx;
    const past = i < ST.cur;
    const newFiles = Object.keys(t.starter);
    const box = h("div", { class: "tk" },
      h("div", { class: "tk-no" }, `TICKET #${i + 1}`, h("span", {}, past ? "committed ✓" : `${P.tickets.length - i - 1} after this`)),
      h("h1", {}, t.title),
      h("div", { class: "tk-files" }, (t.touches.length ? t.touches : Object.keys(t.solution)).map((f) =>
        h("button", { class: newFiles.includes(f) ? "new" : "", onclick: () => { stash(); openFile(f); } }, f))),
      h("div", { class: "prose", html: t.brief }),
      t.picture ? h("pre", { class: "pic", "aria-label": "Diagram" }, t.picture) : null,
      t.todo.length ? h("ul", { class: "todo" }, t.todo.map((item, k) => {
        const on = ((ST.todo[t.id] || [])[k]) || past;
        return h("li", {}, h("input", { type: "checkbox", checked: on, "aria-label": "Done", onchange: (e) => { (ST.todo[t.id] = ST.todo[t.id] || [])[k] = e.target.checked; save(); } }), h("span", { html: item }));
      })) : null,
      h("details", { class: "fold" }, h("summary", {}, "Why it's built this way"), h("div", { class: "prose", html: t.why })),
      renderHints(t));
    tick.append(box);
    renderMap();
  }
  function renderHints(t) {
    const n = ST.hints[t.id] || 0;
    const wrap = h("div", { class: "hints" });
    const left = t.hints.length - n;
    wrap.append(
      left ? h("button", { class: "more", onclick: () => { ST.hints[t.id] = n + 1; save(); renderTicket(); } }, n ? `Another hint (${left} left)` : `Stuck? Take a hint (${left})`) : h("span", {}, "No more hints."),
      " · ",
      h("button", { class: "peek", onclick: () => { diffWhat = "peek"; showPanel("diff"); } }, "compare with a reference"),
      t.hints.slice(0, n).map((x, k) => h("div", { class: "h" }, h("small", {}, `HINT ${k + 1}`), h("div", { class: "prose", html: x }))));
    return wrap;
  }
  function renderFinish() {
    const built = new Set(P.tickets.map((t) => t.id));
    const next = P.map.filter((m) => !built.has(m.ticket));
    tick.append(h("div", { class: "wfin" },
      h("div", { class: "tk-no" }, "ALL TICKETS COMMITTED"),
      h("h1", {}, `${P.title} works.`),
      h("div", { class: "prose", html: `<p>You wrote a database you can talk to, that keeps every write on disk and survives a power cut in the middle of one. Try it in the terminal: <code>SET</code> a few keys, pull the plug, and read them back.</p>` +
        (next.length ? `<p>Next on Ledger's board: ${next.map((m) => `<b>${m.name}</b>`).join(", ")}. They're being written now.</p>` : "") }),
      h("p", { class: "prose" }, h("a", { href: "./", style: "color:var(--w-pink)" }, "← All projects"))));
  }

  // the architecture map: one tower per file, one voxel per part, stacked in the order you build them
  const FILECOL = ["var(--w-pink)", "var(--w-amber)", "var(--w-teal)", "var(--w-blue)", "var(--w-violet)"];
  let snapPart = null;
  function renderMap() {
    const wrap = h("div", { class: "wmap" }, h("div", { class: "wh", style: "padding:0 0 8px" }, "What you're building", h("em", {}, `${ST.cur} of ${P.map.length} parts`)));
    const cols = P.files, W = 360, colW = W / cols.length;
    const maxH = Math.max(...cols.map((f) => P.map.filter((m) => m.file === f).length));
    const step = 21, base = 40 + maxH * step;
    const svg = h("svg:svg", { viewBox: `0 0 ${W} ${base + 48}`, role: "img", "aria-label": "The program's parts, by file" });
    const tIx = (id) => P.tickets.findIndex((t) => t.id === id);
    const cap = h("div", { class: "cap" });
    const say = (m) => { cap.innerHTML = `<b>${esc(m.name)}</b> <span style="font:11px var(--f-mono)">${esc(m.file)}</span> · ${m.what}`; };
    cols.forEach((f, ci) => {
      const cx = colW * ci + 26, col = FILECOL[ci % FILECOL.length];
      svg.append(h("svg:polygon", { points: `${cx},${base + 1} ${cx + 30},${base + 13} ${cx},${base + 25} ${cx - 30},${base + 13}`, fill: "none", stroke: "var(--w-line2)", "stroke-dasharray": "3 3" }));
      svg.append(h("svg:text", { x: cx, y: base + 40, "text-anchor": "middle", class: "f" }, f));
      P.map.filter((m) => m.file === f).forEach((m, lv) => {
        const k = tIx(m.ticket), yt = base - lv * step;
        const state = k < 0 ? "ghost" : k < ST.cur ? "built" : k === ST.cur ? "cur" : "ghost";
        const g = h("svg:g", { class: "vx " + state + (snapPart === m.name ? " snap" : ""), tabindex: 0, role: "button", "aria-label": `${m.name}: ${state === "built" ? "built" : state === "cur" ? "building now" : "later"}` });
        const top = `${cx},${yt - 9} ${cx + 18},${yt} ${cx},${yt + 9} ${cx - 18},${yt}`;
        const left = `${cx - 18},${yt} ${cx},${yt + 9} ${cx},${yt + 29 - 8} ${cx - 18},${yt + 20 - 8}`;
        const right = `${cx + 18},${yt} ${cx},${yt + 9} ${cx},${yt + 29 - 8} ${cx + 18},${yt + 20 - 8}`;
        if (state === "ghost") {
          for (const pts of [left, right, top]) g.append(h("svg:polygon", { points: pts, fill: "none", stroke: "var(--w-faint)", "stroke-dasharray": "2 2" }));
        } else {
          const c = state === "cur" ? "var(--w-pink)" : col;
          g.append(h("svg:polygon", { points: left, fill: c }), h("svg:polygon", { points: left, fill: "#000", opacity: .22 }),
            h("svg:polygon", { points: right, fill: c }), h("svg:polygon", { points: right, fill: "#000", opacity: .4 }),
            h("svg:polygon", { points: top, fill: c }));
        }
        g.append(h("svg:text", { x: cx + 24, y: yt + 5, class: state === "cur" ? "cur" : "" }, m.name));
        g.addEventListener("pointerenter", () => say(m));
        g.addEventListener("focus", () => say(m));
        g.addEventListener("click", () => say(m));
        svg.append(g);
      });
    });
    wrap.append(svg, cap);
    const now = P.map.find((m) => cur() && m.ticket === cur().id) || P.map[P.map.length - 1];
    say(now);
    tick.append(wrap);
    snapPart = null;
  }

  // -------------------------------------------------------------- panel --
  function renderPanelTabs() {
    const pt = $(".ptabs", mid);
    pt.innerHTML = "";
    const r = tested;
    const tab = (id, label, extra) => h("button", { class: panelTab === id ? "on" : "", onclick: () => showPanel(id) }, label, extra ? [" ", extra] : null);
    pt.append(
      tab("term", "Terminal"),
      tab("tests", "Tests", r ? h("b", { class: r.passed ? "" : "bad" }, `${r.ok}/${r.total}`) : null),
      tab("disk", "Disk"),
      ...(diffWhat ? [tab("diff", diffWhat === "peek" ? "Compare" : "Diff")] : []),
      h("span", { class: "grow" }));
    if (panelTab === "term") {
      pt.append(h("button", { class: "act", onclick: restart, title: "Stop the program and start it again. Memory is wiped; the disk is kept." }, "↻ restart"));
      if (disk.length) pt.append(h("button", { class: "act plug", onclick: plug, title: "Kill the program in the middle of its last write, like a power cut, then start it again" }, "⚡ pull the plug"));
      if (Runner.busy && !LOCAL) pt.append(h("button", { class: "act", onclick: () => { Runner.stop(); running = false; say("sys", "■ stopped"); } }, "■ stop"));
    }
    if (panelTab === "disk" && disk.length) pt.append(h("button", { class: "act", onclick: wipeDisk, title: "Delete every file the program wrote" }, "wipe disk"));
  }
  function showPanel(id) {
    panelTab = id;
    renderPanelTabs();
    const pb = $(".pbody", mid);
    pb.className = "pbody";
    pb.innerHTML = "";
    if (id === "term") renderTerm(pb);
    else if (id === "tests") renderTests(pb);
    else if (id === "disk") renderDisk(pb);
    else if (id === "diff") renderDiff(pb);
    if (phone()) pane(1);
  }

  // terminal
  function say(kind, text, extra) { termLog.push({ kind, text, ...extra }); if (termLog.length > 400) termLog.splice(0, termLog.length - 400); if (panelTab === "term") showPanel("term"); }
  function renderTerm(pb) {
    pb.classList.add("term");
    for (const l of termLog) {
      if (l.kind === "cmd") pb.append(h("div", { class: "ln cmd" }, h("span", { class: "pr" }, P.prompt), l.text));
      else if (l.kind === "err") {
        const line = h("div", { class: "ln err" }, l.text);
        if (l.where) line.append(" ", h("a", { onclick: () => jumpTo(l.where[0], l.where[1]) }, `→ ${l.where[0]}:${l.where[1]}`));
        pb.append(line);
      } else pb.append(h("div", { class: "ln " + l.kind, html: l.html || esc(l.text) }));
    }
    const input = h("input", { "aria-label": "Type a command for your program", autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "send" });
    const row = h("div", { class: "inp" + (running ? "" : " off") }, h("span", { class: "pr" }, P.prompt), input);
    pb.append(row);
    if (!termLog.length) pb.prepend(h("div", { class: "ln sys" }, running ? "" : `Press Run (${MOD}↵) to start ${P.title.toLowerCase()}, then type commands here.`));
    input.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        const line = input.value;
        input.value = "";
        if (line.trim()) { hist.push(line); histAt = hist.length; }
        await send(line);
      } else if (e.key === "ArrowUp" && hist.length) { histAt = Math.max(0, histAt - 1); input.value = hist[histAt]; e.preventDefault(); }
      else if (e.key === "ArrowDown" && hist.length) { histAt = Math.min(hist.length, histAt + 1); input.value = hist[histAt] || ""; e.preventDefault(); }
      else if (e.key === "l" && e.ctrlKey) { termLog = []; showPanel("term"); }
    });
    pb.onclick = (e) => { if (!e.target.closest("a") && !getSelection().toString()) input.focus({ preventScroll: true }); };
    requestAnimationFrame(() => { pb.scrollTop = pb.scrollHeight; if (focusTerm) { input.focus({ preventScroll: true }); focusTerm = false; } });
  }
  let focusTerm = false;
  async function send(line) {
    if (!running) { await doRun(); if (!running) return; }
    termLog.push({ kind: "cmd", text: line });
    focusTerm = true;
    const r = await Runner.run({ op: "project_call", pid: P.id, line });
    if (r.stdout) for (const l of r.stdout.replace(/\n$/, "").split("\n")) termLog.push({ kind: "out", text: l });
    if (r.error) { termLog.push({ kind: "err", text: r.error, where: r.where }); markError(r.where, r.error); }
    setDisk(r.disk);
    focusTerm = true;
    showPanel("term");
  }
  function setDisk(d) {
    if (!d) return;
    const before = JSON.stringify(disk.map((x) => [x.name, x.size]));
    disk = d;
    if (JSON.stringify(disk.map((x) => [x.name, x.size])) !== before) {
      renderTree();
      side.querySelectorAll(".f.disk").forEach((el) => el.classList.add("flash"));
    }
  }
  async function start(label, wipe) {
    stash();
    const r = await Runner.run({ op: "project_load", pid: P.id, files: ST.files, main: P.main, wipe: !!wipe });
    if (r.stdout) for (const l of r.stdout.replace(/\n$/, "").split("\n")) termLog.push({ kind: "out", text: l });
    if (r.error) {
      running = false;
      termLog.push({ kind: "err", text: r.error, where: r.where });
      markError(r.where, r.error);
      if (r.where) jumpTo(r.where[0], r.where[1]);
    } else {
      running = true;
      markError(null);
      termLog.push({ kind: "sys", html: label });
    }
    setDisk(r.disk);
    focusTerm = running;
    showPanel("term");
  }
  async function doRun() {
    const b = $(".wact .run", bar); b && b.classList.add("busy");
    const n = Object.keys(ST.files).length;
    await start(`<b>▶</b> ${esc(P.title.toLowerCase())} started · ${n} file${n > 1 ? "s" : ""}${disk.length ? " · disk kept" : ""}`);
    b && b.classList.remove("busy");
  }
  async function restart() {
    if (!running && !disk.length) return doRun();
    await start("<b>↻</b> restarted: memory is empty again, the disk is just as it was");
  }
  async function plug() {
    const target = [...disk].sort((a, b) => b.size - a.size)[0];
    termLog.push({ kind: "crash", text: `⚡ power cut while writing ${target.name}: its last record is only half on disk` });
    running = false;
    const r = await Runner.run({ op: "project_tear", pid: P.id, name: target.name, keep: 0.5 });
    setDisk(r.disk);
    tornAt = target.name;
    await start("<b>▶</b> power back on: started again from the disk");
  }
  let tornAt = null;
  async function wipeDisk() {
    await Runner.run({ op: "project_load", pid: P.id, files: ST.files, main: P.main, wipe: true }).then((r) => { running = !r.error; setDisk(r.disk); });
    tornAt = null;
    termLog.push({ kind: "sys", text: "disk wiped; the program restarted empty" });
    showPanel("disk");
  }

  // tests
  async function doTest() {
    const t = cur() || P.tickets[P.tickets.length - 1];
    const upto = P.tickets.slice(0, P.tickets.indexOf(t) + 1);
    const b = $(".wact .test", bar); b && b.classList.add("busy");
    stash();
    const key = filesKey();
    panelTab = "tests";
    const pb = $(".pbody", mid);
    renderPanelTabs();
    pb.className = "pbody"; pb.innerHTML = '<p class="hintline">Running the checks…</p>';
    const r = await Runner.run({ op: "project_check", pid: P.id, files: ST.files, main: P.main, tickets: upto.map((x) => [x.title, x.tests]) });
    b && b.classList.remove("busy");
    const total = upto.reduce((s, x) => s + (x.tests.match(/^assert\b/gm) || []).length, 0);
    const ok = (r.tickets || []).reduce((s, x) => s + x.ok, 0);
    tested = { ...r, total, ok, upto };
    lastPass = r.passed ? key : null;
    const fail = (r.tickets || []).find((x) => x.failed);
    markError(fail && fail.where, fail ? fail.message : "");
    renderBar(); renderStat(); showPanel("tests");
  }
  function renderTests(pb) {
    const r = tested;
    if (!r) { pb.append(h("p", { class: "hintline" }, `Press Test (⇧${MOD}↵) to run this ticket's checks, and every earlier ticket's, against your code.`)); return; }
    const box = h("div", { class: "lamps" });
    if (r.error) box.append(h("div", { class: "fail" }, h("p", {}, r.error)));
    r.upto.forEach((t, i) => {
      const res = (r.tickets || [])[i];
      const total = (t.tests.match(/^assert\b/gm) || []).length;
      const lamps = h("div", { class: "lrow" });
      for (let k = 0; k < total; k++) {
        const cls = !res ? "" : k < res.ok ? "ok" : k === res.ok && res.failed ? "bad" : "";
        lamps.append(h("span", { class: `lamp ${cls} pop`, style: `--i:${k}`, title: cls === "ok" ? "passed" : cls === "bad" ? "failed" : "not run yet" }));
      }
      const g = h("div", { class: "lgrp" },
        h("h5", {}, `#${i + 1} ${t.title}`, h("small", {}, !res ? "not run: an earlier ticket failed" : res.failed ? `${res.ok} of ${total}` : `${total} of ${total} ✓`)),
        h("span"), lamps);
      if (res && res.failed) {
        const f = h("div", { class: "fail" }, h("p", {}, res.message.split("\n")[0]),
          h("pre", {}, (res.message.includes("\n") ? res.message.split("\n").slice(1).join("\n") + "\n\n" : "") + "check: " + res.failed));
        if (res.where) f.append(h("a", { onclick: () => jumpTo(res.where[0], res.where[1]) }, `→ go to ${res.where[0]}, line ${res.where[1]}`));
        g.append(f);
      }
      box.append(g);
    });
    if (r.passed) box.append(h("p", { class: "pass" }, cur() ? `All ${r.total} checks pass, old tickets included. Commit when you're ready (${MOD}S).` : `All ${r.total} checks pass.`));
    pb.append(box);
  }

  // disk
  function renderDisk(pb) {
    pb.classList.add("disk-v");
    if (!disk.length) { pb.append(h("p", { class: "hintline" }, "Nothing on disk yet. Files your program writes show up here as it writes them.")); return; }
    for (const d of disk) {
      pb.append(h("h6", {}, `${d.name} · ${bytes(d.size)}`));
      const lines = d.text.split("\n");
      const endsClean = d.text.endsWith("\n");
      if (endsClean) lines.pop();
      lines.forEach((l, k) => {
        const torn = k === lines.length - 1 && !endsClean;
        const m = /^([0-9a-f]{8}) (.*)$/.exec(l);
        pb.append(h("div", { class: "dl" + (k === lines.length - 1 ? " last" : "") + (torn ? " torn" : ""), title: torn ? "A torn record: the write never finished" : "" },
          h("span", {}, k + 1), h("span", { html: m ? `<span class="crc">${m[1]}</span> ${esc(m[2])}` : esc(l) + (torn ? "  ← torn" : "") })));
      });
    }
  }

  // diff: a commit against the one before it, or your code against a reference ("compare")
  function diffLines(a, b) {
    const A = a.split("\n"), B = b.split("\n"), n = A.length, m = B.length;
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = [];
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && A[i] === B[j]) { out.push([" ", A[i]]); i++; j++; }
      else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) { out.push(["+", B[j]]); j++; }
      else { out.push(["-", A[i]]); i++; }
    }
    return out;
  }
  function renderDiff(pb) {
    pb.classList.add("diff");
    let pairs, note;
    if (diffWhat === "peek") {
      const t = shown() || cur();
      if (!t) return;
      note = "Your code (−) against one reference version (+). Yours can differ and still pass: the checks decide.";
      pairs = Object.keys(t.solution).map((f) => [f, ST.files[f] || "", t.solution[f]]);
    } else {
      const k = ST.commits.findIndex((c) => c.sha === diffWhat);
      const c = ST.commits[k];
      if (!c) return;
      const before = k ? ST.commits[k - 1].files : P.tickets[0].start;
      note = `${c.sha} · ${c.msg} · ${new Date(c.t).toLocaleString()}`;
      pairs = Object.keys(c.files).map((f) => [f, before[f] || "", c.files[f]]);
    }
    pb.append(h("p", { class: "hintline", style: "margin:0 0 10px" }, note));
    for (const [f, a, b] of pairs) {
      pb.append(h("h6", {}, f));
      if (a === b) { pb.append(h("div", { class: "same" }, "no changes")); continue; }
      const d = diffLines(a.replace(/\n$/, ""), b.replace(/\n$/, ""));
      // show changes with 2 lines of context, folding long unchanged runs
      const keep = d.map((x, i) => x[0] !== " " || d.slice(Math.max(0, i - 2), i + 3).some((y) => y[0] !== " "));
      let skipped = 0;
      d.forEach((x, i) => {
        if (!keep[i]) { skipped++; return; }
        if (skipped) { pb.append(h("div", { class: "same" }, `⋯ ${skipped} unchanged line${skipped > 1 ? "s" : ""}`)); skipped = 0; }
        pb.append(h("div", { class: "dl " + (x[0] === "+" ? "add" : x[0] === "-" ? "del" : "") }, h("span", {}, x[0] === " " ? "" : x[0]), h("span", {}, x[1] || " ")));
      });
      if (skipped) pb.append(h("div", { class: "same" }, `⋯ ${skipped} unchanged line${skipped > 1 ? "s" : ""}`));
    }
  }

  // commit
  function openCommit() {
    if (!cur()) return;
    if (!canCommit()) {
      toast(lastPass ? "You changed code since the last Test. Test again, then commit." : "Run the checks first: every one has to pass before you commit.");
      return;
    }
    $(".csheet", root)?.remove();
    const t = cur();
    const files = Object.keys(ST.files).filter(changed);
    const input = h("input", { value: t.title, "aria-label": "Commit message", maxlength: 72 });
    const go = () => commit(input.value.trim() || t.title);
    const sheet = h("div", { class: "csheet", role: "dialog", "aria-label": "Commit" },
      h("label", {}, "Commit message"), input,
      h("div", { class: "files" }, files.length ? ["changes: ", files.map((f, k) => [k ? ", " : "", h("b", {}, f)])] : "no file changes"),
      h("div", { class: "row" }, h("button", { onclick: () => sheet.remove() }, "Cancel"), h("button", { class: "go", onclick: go }, "Commit to main")));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); if (e.key === "Escape") sheet.remove(); });
    root.style.position = "relative";
    root.append(sheet);
    input.select();
  }
  function commit(msg) {
    $(".csheet", root)?.remove();
    const t = cur();
    stash();
    const c = { sha: sha(filesKey() + msg + Date.now()), msg, ticket: t.id, t: Date.now(), files: { ...ST.files } };
    ST.commits.push(c);
    const part = P.map.find((m) => m.ticket === t.id);
    snapPart = part && part.name;
    const id = `${P.id}-${t.id}`;
    if (!S.done[id]) {
      S.done[id] = 1;
      S.xp = (S.xp || 0) + 40;
      const today = new Date().toISOString().slice(0, 10);
      S.days = S.days || [];
      if (!S.days.includes(today)) S.days.push(today);
    }
    ST.cur++;
    lastPass = null;
    tested = null;
    const next = cur();
    if (next) {
      // a new ticket can bring new files: they appear with their scaffold, and open in a tab
      for (const [f, src] of Object.entries(next.starter)) if (!(f in ST.files)) { ST.files[f] = src; if (!ST.open.includes(f)) ST.open.push(f); }
      ST.todo[next.id] = ST.todo[next.id] || [];
    }
    save();
    justCommitted = true;
    ticketIx = ST.cur;
    history.replaceState(null, "", `#${P.num}${next ? "/" + next.id : ""}`);
    renderAll();
    justCommitted = false;
    const first = next && Object.keys(next.starter)[0];
    if (first) { stash(); openFile(first); }
    toast(next ? `Committed ${c.sha}. Ticket #${ST.cur + 1}, ${next.title}, is open.` : `Committed ${c.sha}. ${P.title} is done.`);
  }
  function toast(text) {
    $(".toastw")?.remove();
    const t = h("div", { class: "toastw", role: "status" }, text);
    document.body.append(t);
    setTimeout(() => t.remove(), 3200);
  }

  // --------------------------------------------------------------- boot --
  function renderAll() { renderBar(); renderTree(); renderTabs(); renderTicket(); renderStat(); showPanel(panelTab); }
  function open() {
    const r = route();
    if (P !== r.proj) {
      P = r.proj;
      ST = stateFor(P);
      // files a ticket introduces must exist once you reach it (also fixes state saved by an older version)
      for (const t of P.tickets.slice(0, ST.cur + 1)) for (const [f, src] of Object.entries(t.starter)) if (!(f in ST.files)) ST.files[f] = src;
      states.clear(); termLog = []; disk = []; running = false; tested = null; lastPass = null; diffWhat = null;
      document.title = `${P.title} · Workbench · Tulip Labs`;
      if (view) { view.destroy(); view = null; }
    }
    const want = r.tid ? P.tickets.findIndex((t) => t.id === r.tid) : ST.cur;
    if (want > ST.cur) { toast(`Ticket #${want + 1} opens when you commit #${ST.cur + 1}.`); history.replaceState(null, "", `#${P.num}/${(cur() || {}).id || ""}`); }
    ticketIx = want < 0 || want > ST.cur ? ST.cur : want;
    renderAll();
    if (!view) openFile(ST.active in ST.files ? ST.active : Object.keys(ST.files)[0]);
  }
  // for tools/e2e.js: replace a file's text the way typing would (through the editor, so undo and saving work)
  root.wbSet = (file, text) => {
    if (!(file in ST.files)) ST.files[file] = "";
    openFile(file);
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  };
  addEventListener("hashchange", open);
  pane(phone() ? 0 : 1);
  open();
  Runner.start();
  pyStatus();
})();
