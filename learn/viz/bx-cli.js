/* Build your own X, chapter 30: a command-line tool kit.
   One command line, typed into a terminal: todo add "buy milk" --due=fri -vq --tag home -- --draft
   The "why": splitting on spaces and treating anything with a dash as a flag gets nearly every part
   wrong. The quotes split "buy milk" in two, --due=fri never gets its value, -vq is read as one flag
   called "vq", "home" ends up as a positional argument, and after -- the program still sees a flag.
   A real parser does two passes: first the shell's rules turn the line into tokens (quotes group,
   spaces separate), then the program's parser reads the tokens left to right with a spec of which
   names are flags and which take a value. */
VIZ.register("bx-cli", async (api) => {
  const W = await api.world3d();
  const LINE = `todo add "buy milk" --due=fri -vq --tag home -- --draft`;
  const FLAGS = new Set(["v", "q"]), OPTS = new Set(["due", "tag"]);
  let mode = "naive", gen = null, toks = [], placed = [], cur = -1, out = { cmd: [], args: [], opts: [] }, running = false, ran = {}, reached = false, line = "", wrong = 0;
  function shellSplit(s) {
    const r = []; let t = "", q = null, has = false;
    for (const ch of s) {
      if (q) { if (ch === q) q = null; else t += ch; }
      else if (ch === '"' || ch === "'") { q = ch; has = true; }
      else if (ch === " ") { if (t || has) r.push(t); t = ""; has = false; }
      else t += ch;
    }
    if (t || has) r.push(t);
    return r;
  }
  const put = (i, col, text, bad) => { placed[i] = { col, text, bad }; out[col].push(i); if (bad) wrong++; };
  function* naive() {
    toks = LINE.split(" ");
    yield `split on spaces: ${toks.length} tokens. The quotes are just characters now`;
    for (let i = 0; i < toks.length; i++) {
      cur = i; const t = toks[i];
      if (i < 2) { put(i, "cmd", t, false); yield `"${t}": the program and its subcommand`; continue; }
      if (t.startsWith("-")) { const name = t.replace(/^-+/, ""); put(i, "opts", `${name} = true`, true); yield `"${t}": starts with a dash, so it's a flag called "${name}". ${name.includes("=") ? "Its value is stuck inside the name" : name.length > 1 && !t.startsWith("--") ? "It should be two flags, -v and -q" : name === "" ? "But -- was meant to end the options" : name === "draft" ? "But it came after --, so it should be plain text" : name === "tag" ? "Its value, home, is the next token" : ""}`; continue; }
      const bad = t.includes('"') || t === "home";
      put(i, "args", t, bad);
      yield `"${t}": no dash, so a plain argument${t.startsWith('"') ? ". Half a title" : t.endsWith('"') ? ". The other half" : t === "home" ? ", but it belongs to --tag" : ""}`;
    }
    cur = -1;
    yield `${wrong} of ${toks.length} tokens misread. The title is in two pieces and no option has its value`;
  }
  function* proper() {
    toks = shellSplit(LINE);
    yield `the shell splits first: quotes group "buy milk" into one token and disappear. ${toks.length} tokens`;
    let i = 0, ended = false;
    while (i < toks.length) {
      cur = i; const t = toks[i];
      if (i < 2) { put(i, "cmd", t, false); yield `"${t}": the program and its subcommand`; i++; continue; }
      if (!ended && t === "--") { placed[i] = { col: "none", text: "", bad: false }; ended = true; yield `"--": end of options. Everything after it is plain text, even if it starts with a dash`; i++; continue; }
      if (!ended && t.startsWith("--")) {
        const body = t.slice(2), eq = body.indexOf("=");
        if (eq >= 0) { put(i, "opts", `${body.slice(0, eq)} = ${body.slice(eq + 1)}`, false); yield `"${t}": a long option with its value after "="`; i++; continue; }
        if (OPTS.has(body)) { put(i, "opts", `${body} = ${toks[i + 1]}`, false); placed[i + 1] = { col: "none", text: "", bad: false }; yield `"${t}": the spec says --${body} takes a value, so it eats the next token, "${toks[i + 1]}"`; i += 2; continue; }
      }
      if (!ended && t.startsWith("-") && t.length > 1) {
        const fl = [...t.slice(1)];
        put(i, "opts", fl.map((f) => `${f} = true`).join(", "), !fl.every((f) => FLAGS.has(f)));
        yield `"${t}": short flags can be bunched together, so this is ${fl.map((f) => "-" + f).join(" and ")}`; i++; continue;
      }
      put(i, "args", t, false);
      yield `"${t}": a plain argument${ended ? " (after --, so the dash is just text)" : ""}`; i++;
    }
    cur = -1;
    yield `every token placed: 1 title, 2 options with values, 2 flags, and the text "--draft". Exit code 0`;
  }
  const COLX = { cmd: -3.3, args: -1.0, opts: 1.9 };
  function draw() {
    for (let i = 0; i < 12; i++) {
      const t = toks[i], p = placed[i];
      if (t === undefined) { W.box("k" + i, { visible: false }); continue; }
      let x = -3.9 + i * 0.72, y = 2.0, sx = 0.66, label = t, color = i === cur ? "c4" : "c5";
      if (p && p.col !== "none") { const k = out[p.col].indexOf(i); x = COLX[p.col]; y = 0.7 - k * 0.55; sx = p.col === "opts" ? 2.4 : 2.0; label = p.text; color = p.bad ? "c1" : p.col === "cmd" ? "c2" : "c3"; }
      if (p && p.col === "none") { W.box("k" + i, { x: -3.9 + i * 0.72, y: 2.0, z: 0, sx: 0.66, sy: 0.42, sz: 0.3, color: "line", opacity: 0.35, label: t, labelSize: 0.13, labelUp: 0, visible: true }); continue; }
      W.box("k" + i, { x, y, z: 0, sx, sy: 0.42, sz: 0.3, color, glow: i === cur ? 0.4 : 0, opacity: 0.92, label, labelSize: p ? 0.17 : 0.13, labelUp: 0, visible: true,
        info: { title: `Token ${i + 1}`, html: `<p>Typed as <code>${t}</code>.${p ? ` Read as ${p.col === "cmd" ? "the command" : p.col === "args" ? "an argument" : "an option"}: <b>${p.text}</b>${p.bad ? ", which is wrong" : ""}.` : ""}</p>` } });
    }
    W.label("h1", "command", [COLX.cmd, 1.25, 0.2], { color: "muted", size: 0.17 });
    W.label("h2", "arguments", [COLX.args, 1.25, 0.2], { color: "muted", size: 0.17 });
    W.label("h3", "options", [COLX.opts, 1.25, 0.2], { color: "muted", size: 0.17 });
  }
  function show() { api.status(`${mode === "naive" ? "split on spaces" : "shell split + parser"} · ${wrong} misread\n${line}`); }
  function reset() { toks = []; placed = []; cur = -1; out = { cmd: [], args: [], opts: [] }; wrong = 0; line = ""; gen = mode === "naive" ? naive() : proper(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = true;
    if (mode === "naive") api.explain(`${wrong} tokens misread`, `<p>Spaces aren't the only rule: quotes group words, "=" attaches values, short flags bunch up, and -- ends the options.</p><p>Switch to <b>shell split + parser</b> and run it.</p>`);
    else if (ran.naive && !reached) { reached = true; api.explain("Two passes", `<p>The shell turns the line into tokens; the program reads them with a spec of which names take values. That's what argparse, click and every Unix tool do.</p>`); api.done("You parsed a command line"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(900); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "split on spaces", value: "naive" }, { label: "shell split + parser", value: "proper" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [-0.6, 0.6, 0], dist: 10.5, theta: 0, phi: 1.5, instant: true });
  api.hud(`${LINE} · top: tokens in order · they drop into command, arguments or options · red = read wrong`);
  reset();
  api.explain("How to read this", `<p>Turn one typed line into what the program should see. <b>Run all</b> with <b>split on spaces</b>, then with <b>shell split + parser</b>.</p>`);
});
