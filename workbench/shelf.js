/* The shelf for both labs: Workbench projects and Wind Tunnel experiments, one card each.
   A Workbench card is a small editor showing the lines that make that program what it is.
   A Wind Tunnel card is the curve that experiment is about. Live ones open; the rest say what's coming.
   Progress comes from the shared store (vnl-code-v1): done ids wb01-t1… and wt01…. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  let S = {};
  try { S = JSON.parse(localStorage.getItem("vnl-code-v1") || "{}"); } catch (e) { S = {}; }
  const done = S.done || {};
  const lab = document.body.classList.contains("k-wt") ? "wt" : "wb";
  const main = $("#shelf");

  // A very small Python colourer for the card's few lines: keywords, names after def/class, strings, numbers, comments.
  const KW = /^(def|class|return|if|else|elif|for|while|in|not|and|or|import|from|with|as|try|except|raise|yield|lambda|None|True|False|self)$/;
  function py(line) {
    let out = "", m;
    const re = /(#.*$)|("[^"]*"|'[^']*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+)|(.)/g;
    let prev = "";
    while ((m = re.exec(line))) {
      const [t, com, str, num, word] = m;
      if (com) out += `<i class="c">${esc(t)}</i>`;
      else if (str) out += `<i class="s">${esc(t)}</i>`;
      else if (num) out += `<i class="n">${t}</i>`;
      else if (word) out += KW.test(word) ? `<i class="k">${t}</i>` : prev === "def" || prev === "class" ? `<i class="d">${t}</i>` : t;
      else out += esc(t);
      if (word) prev = word;
    }
    return out;
  }

  // ------------------------------------------------------------ Workbench --
  // Every planned program, in order. Live ones come from content/wb.json; these lines are what each card shows.
  const PROGRAMS = [
    { num: 1, title: "Ledger", kind: "a key-value database with its own shell", file: "store.py",
      lines: ["class Store:", "    def __init__(self, log):", "        self.data = {}", "        for rec in log.read():", "            self.apply(rec)", "", "db = Store(Log(\"ledger.log\"))"] },
    { num: 2, title: "Quill", kind: "a terminal text editor", file: "buffer.py",
      lines: ["class GapBuffer:", "    def insert(self, ch):", "        if self.gap == 0:", "            self.grow()", "        self.buf[self.left] = ch", "        self.left += 1"] },
    { num: 3, title: "Tally", kind: "a spreadsheet engine", file: "graph.py",
      lines: ["def recalc(sheet, cell):", "    for c in order(sheet, cell):", "        sheet[c] = evaluate(c)", "", "# A1 = B1 + 2", "# B1 = A1  ->  #CYCLE!"] },
    { num: 4, title: "Conch", kind: "a shell", file: "pipe.py",
      lines: ["def run(line):", "    stages = line.split(\"|\")", "    data = \"\"", "    for s in stages:", "        data = call(s, data)", "    return data"] },
    { num: 5, title: "Porch", kind: "an HTTP server and router", file: "router.py",
      lines: ["@route(\"GET\", \"/notes/<id>\")", "def show(req, id):", "    note = db.get(id)", "    if note is None:", "        return 404, \"no such note\"", "    return 200, note"] },
    { num: 6, title: "Twig", kind: "version control", file: "objects.py",
      lines: ["def put(data):", "    key = sha1(data)", "    write(\"objects/\" + key, data)", "    return key", "", "commit = put(tree + parent)"] },
    { num: 7, title: "Sprout", kind: "a Lisp interpreter", file: "eval.py",
      lines: ["def eval(x, env):", "    if isinstance(x, str):", "        return env.find(x)", "    op, *args = x", "    if op == \"lambda\":", "        return Closure(args, env)"] },
    { num: 8, title: "Pixelpond", kind: "a 2D game engine", file: "loop.py",
      lines: ["STEP = 1 / 60", "def frame(dt):", "    acc += dt", "    while acc >= STEP:", "        world.update(STEP)", "        acc -= STEP"] },
  ];

  function wbCard(p, live, data) {
    const tickets = live ? data.tickets : [];
    const got = tickets.filter((t) => done[`${data.id}-${t.id}`]).length;
    const art = `<span class="ed-art"><span class="ed-tab">${esc(p.file)}</span><span class="ed-code">${p.lines.map((l, i) =>
      `<span class="ed-ln"><b>${i + 1}</b><code>${py(l) || " "}</code></span>`).join("")}</span></span>`;
    const pips = live ? `<span class="pips" aria-label="${got} of ${tickets.length} tickets committed">${tickets.map((t) =>
      `<i class="${done[`${data.id}-${t.id}`] ? "on" : ""}" title="#${t.id.slice(1)} ${esc(t.title)}"></i>`).join("")}<em>${got ? `${got} of ${tickets.length} committed` : `${tickets.length} tickets`}</em></span>`
      : `<span class="pips soon"><em>being written</em></span>`;
    const tag = live ? "a" : "div";
    return `<${tag} class="sc${live ? "" : " later"}"${live ? ` href="bench.html#${p.num}"` : ""}>
      ${art}
      <span class="sc-meta">Project ${p.num}${live ? "" : " · soon"}</span>
      <span class="sc-t">${esc(p.title)}</span>
      <span class="sc-d">${esc(live ? data.kind : p.kind)}</span>
      ${pips}
    </${tag}>`;
  }

  async function workbench() {
    let data = { projects: [] };
    try { data = await (await fetch("../content/wb.json")).json(); } catch (e) { /* offline: everything shows as coming */ }
    const live = Object.fromEntries(data.projects.map((p) => [p.num, p]));
    const all = PROGRAMS.map((p) => wbCard(p, !!live[p.num], live[p.num]));
    const cur = data.projects.find((p) => p.tickets.some((t) => !done[`${p.id}-${t.id}`])) || data.projects[0];
    const next = cur && cur.tickets.find((t) => !done[`${cur.id}-${t.id}`]);
    const total = data.projects.reduce((n, p) => n + p.tickets.length, 0);
    const have = data.projects.reduce((n, p) => n + p.tickets.filter((t) => done[`${p.id}-${t.id}`]).length, 0);
    main.innerHTML = `
      <p class="eyebrow">workbench</p>
      <h1>Build <i>real software.</i></h1>
      <p class="lede">Each project is one whole program in a real editor: a database, an editor, a shell, a web server. You build it a ticket at a time, the way software is really made.</p>
      ${loop()}
      ${cur ? `<a class="resume" href="bench.html#${cur.num}"><span class="r-k">${have ? "Continue" : "Start"}</span><span class="r-t">${esc(cur.title)}</span><span class="r-c">${next ? `ticket ${cur.tickets.indexOf(next) + 1} · ${esc(next.title)}` : "all tickets committed"}</span><i class="r-a">→</i></a>` : ""}
      <div class="sh-head"><h2>Projects</h2><p class="sh-n"><b>${have}</b> of ${total} tickets committed<span>·</span>${data.projects.length} of ${PROGRAMS.length} projects open</p></div>
      <div class="sl">${all.join("")}</div>`;
  }

  // The four steps of every ticket, drawn as a strip: what you do, and what the bench does back.
  function loop() {
    const steps = [["Ticket", "what to build, and why real software does it"], ["Run", "type commands at your program"], ["Test", "this ticket's checks and every earlier one"], ["Commit", "it lands in history; the map grows"]];
    return `<ol class="loop" aria-label="How a ticket works">${steps.map(([b, s], i) => `<li><span class="lp-n">${i + 1}</span><b>${b}</b><small>${s}</small></li>`).join("")}</ol>`;
  }

  // ---------------------------------------------------------- Wind Tunnel --
  // A card's picture: the curve its experiment is about, drawn from the experiment's own shape name.
  const CURVES = {
    knee: (x) => 0.08 + 0.05 / Math.max(0.035, 1 - x * 0.98),
    little: (x) => 0.1 + 0.8 * x,
    split: (x) => 0.12 + 0.3 * x * x,
    cache: (x) => 0.9 - 0.75 * Math.log1p(9 * x) / Math.log(10),
    lag: (x) => 0.15 + 0.6 * x * x * x,
    burst: (x) => 0.3 + 0.25 * Math.sin(x * 18) * Math.exp(-x * 2.5),
    storm: (x) => (x < 0.5 ? 0.15 : 0.92),
    bucket: (x) => Math.min(0.62, 0.1 + 1.2 * x),
    hot: (x) => 0.12 + 0.75 * Math.pow(x, 5),
    far: (x) => 0.1 + 0.5 * Math.floor(x * 4) / 4,
    cap: (x) => (x < 0.55 ? 0.2 : 0.75),
    review: (x) => 0.2 + 0.5 * Math.abs(Math.sin(x * 4)) * (1 - x * 0.5),
  };
  function curve(name, live) {
    const f = CURVES[name] || CURVES.knee, W = 160, H = 100;
    const pts = Array.from({ length: 61 }, (_, i) => { const x = i / 60, y = Math.min(0.95, Math.max(0.04, f(x))); return `${(10 + x * (W - 20)).toFixed(1)},${(H - 10 - y * (H - 20)).toFixed(1)}`; });
    let grid = "";
    for (let i = 1; i < 6; i++) grid += `<line x1="${10 + i * (W - 20) / 6}" y1="8" x2="${10 + i * (W - 20) / 6}" y2="${H - 10}"/>`;
    for (let i = 1; i < 4; i++) grid += `<line x1="10" y1="${10 + i * (H - 20) / 4}" x2="${W - 10}" y2="${10 + i * (H - 20) / 4}"/>`;
    return `<svg class="cv${live ? "" : " ghost"}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><g class="g">${grid}</g><polyline class="ax" points="10,8 10,${H - 10} ${W - 10},${H - 10}"/><polyline class="ln" points="${pts.join(" ")}"/></svg>`;
  }
  function wtCard(x, i) {
    const live = !!x.live, ok = done[x.id];
    const tag = live ? "a" : "div";
    return `<${tag} class="sc wt${live ? "" : " later"}"${live ? ` href="lab.html#${i + 1}"` : ""}>
      <span class="tw-art">${curve(x.curve, live)}<span class="cv-law">${esc(x.law || "")}</span></span>
      <span class="sc-meta">Experiment ${i + 1}${live ? (ok ? " · <em>done</em>" : "") : " · soon"}</span>
      <span class="sc-t">${esc(x.title)}</span>
      <span class="sc-d">${esc(x.teaser)}</span>
    </${tag}>`;
  }
  function tunnel() {
    const X = (window.WT && window.WT.experiments) || [];
    const live = X.filter((x) => x.live);
    const have = live.filter((x) => done[x.id]).length;
    const next = live.find((x) => !done[x.id]) || live[0];
    main.innerHTML = `
      <p class="eyebrow">wind tunnel</p>
      <h1>Blow traffic <i>at a design.</i></h1>
      <p class="lede">Every experiment is a small live system. Guess what happens, push users at it, and watch requests queue, latency climb and parts fail. Then learn the law that did it.</p>
      ${next ? `<a class="resume" href="lab.html#${X.indexOf(next) + 1}"><span class="r-k">${have ? "Continue" : "Start"}</span><span class="r-t">${esc(next.title)}</span><span class="r-c">experiment ${X.indexOf(next) + 1}</span><i class="r-a">→</i></a>` : ""}
      <div class="sh-head"><h2>Experiments</h2><p class="sh-n"><b>${have}</b> of ${live.length} done<span>·</span>${live.length} of ${X.length} open</p></div>
      <div class="sl">${X.map(wtCard).join("")}</div>`;
  }

  lab === "wt" ? tunnel() : workbench();
})();
