/* Build your own X, chapter 28: a package manager.
   Your app needs `web ^2.0` and `db ^1.2`. Both of those need the logging package `log`, but
   different versions of it. Each column is a package; each block is one published version (newest
   on top), labelled with the version of `log` it needs.
   The "why": the obvious install, "take the newest version of everything", gives you web 2.3 (needs
   log 2.x) and db 1.4 (needs log 1.x): no single log fits both, so the install is broken. A real
   resolver searches: pick a version, add its requirements, and when something can't be satisfied,
   go back and try an older version of an earlier choice (backtracking). */
VIZ.register("bx-resolve", async (api) => {
  const W = await api.world3d();
  const REG = {
    web: { "2.3.0": { log: "^2.0" }, "2.2.0": { log: "^2.0" }, "2.1.0": { log: "^1.3" }, "2.0.0": { log: "^1.0" }, "1.9.0": { log: "^1.0" } },
    db: { "1.4.0": { log: "^1.4" }, "1.3.0": { log: "^1.2" }, "1.2.0": { log: "^1.0" }, "1.1.0": {} },
    log: { "2.1.0": {}, "2.0.0": {}, "1.5.0": {}, "1.4.0": {}, "1.3.0": {} },
  };
  const ROOT = { web: "^2.0", db: "^1.2" }, ORDER = ["web", "db", "log"], X = { web: -4, db: 0, log: 4 };
  const parse = (v) => v.split(".").map(Number).concat([0, 0]).slice(0, 3);
  const cmp = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
  const sat = (v, c) => { const lo = parse(c.slice(1)), hi = lo[0] > 0 ? [lo[0] + 1, 0, 0] : [0, lo[1] + 1, 0], x = parse(v); return cmp(x, lo) >= 0 && cmp(x, hi) < 0; };
  const versions = (p) => Object.keys(REG[p]).sort((a, b) => cmp(parse(b), parse(a)));
  let mode = "latest", state = {}, chosen = {}, log = [], gen = null, steps = 0, sawBroken = false, reached = false, running = false;
  // Requirements on package p from the app and from every package chosen so far.
  const reqs = (p, ch) => [["app", ROOT[p]], ...Object.entries(ch).filter(([q]) => REG[q][ch[q]][p]).map(([q, v]) => [`${q} ${v}`, REG[q][v][p]])].filter((r) => r[1]);
  function* solve(i, ch) {
    if (i === ORDER.length) return true;
    const p = ORDER[i];
    for (const v of versions(p)) {
      const bad = reqs(p, ch).find(([, c]) => !sat(v, c));
      if (bad) { yield { p, v, kind: "reject", why: `${p} ${v} doesn't fit ${bad[1]} (needed by ${bad[0]})` }; continue; }
      // Also refuse a version whose own needs clash with a package already chosen.
      const clash = Object.entries(REG[p][v]).find(([q, c]) => ch[q] && !sat(ch[q], c));
      if (clash) { yield { p, v, kind: "reject", why: `${p} ${v} needs ${clash[0]} ${clash[1]}, but ${clash[0]} ${ch[clash[0]]} is already chosen` }; continue; }
      // Look ahead: a package not chosen yet must still have some version that fits everyone.
      const dead = Object.entries(REG[p][v]).find(([q]) => !ch[q] && !versions(q).some((w) => [...reqs(q, ch), [p, REG[p][v][q]]].every(([, c]) => sat(w, c))));
      if (dead) { yield { p, v, kind: "reject", why: `${p} ${v} needs ${dead[0]} ${dead[1]}, but no ${dead[0]} also fits ${reqs(dead[0], ch).map((r) => r[1]).join(", ")}` }; continue; }
      yield { p, v, kind: "pick", why: `pick ${p} ${v}${Object.keys(REG[p][v]).length ? ` (it needs ${Object.entries(REG[p][v]).map(([q, c]) => `${q} ${c}`).join(", ")})` : ""}` };
      if (yield* solve(i + 1, { ...ch, [p]: v })) return true;
      yield { p, v, kind: "back", why: `nothing works below ${p} ${v}: go back and try an older ${p}` };
    }
    return false;
  }
  function draw() {
    ORDER.forEach((p) => {
      versions(p).forEach((v, k) => {
        const s = state[`${p}@${v}`], dep = REG[p][v].log;
        W.box(`${p}@${v}`, { x: X[p], y: 2.6 - k * 1.05, z: 0, sx: 2.9, sy: 0.8, sz: 0.5,
          color: chosen[p] === v ? (s === "broken" ? "bad" : "c3") : s === "reject" ? "c1" : s === "back" ? "c4" : "c5", glow: chosen[p] === v ? 0.35 : 0, opacity: chosen[p] === v || s ? 0.95 : 0.55,
          label: `${p} ${v}${dep ? `\nneeds log ${dep}` : ""}`, labelSize: 0.27, labelUp: -0.78,
          info: { title: `${p} ${v}`, html: `<p>${dep ? `Needs <b>log ${dep}</b>: ${dep.startsWith("^1") ? "any 1.x from " + dep.slice(1) + " up" : "any 2.x"}.` : "Needs nothing else."}</p><p>${p === "log" ? "Every version of log is published; the question is which one fits <b>all</b> the packages that need it." : `The app asks for <b>${p} ${ROOT[p]}</b>: any ${ROOT[p].slice(1, 2)}.x, newest preferred.`}</p>` } });
      });
      W.label("h" + p, p === "log" ? "log\nshared by both" : `${p}\napp needs ${ROOT[p]}`, [X[p], 3.8, 0], { color: "ink", size: 0.3 });
    });
    ["web", "db"].forEach((p) => { W.unline(`${p}>log`); if (chosen[p] && chosen.log) W.line(`${p}>log`, `${p}@${chosen[p]}`, `log@${chosen.log}`, { color: state[`log@${chosen.log}`] === "broken" ? "bad" : "c3", opacity: 0.7 }); });
  }
  const show = () => api.status(`${mode === "latest" ? "newest of everything" : "backtracking resolver"} · ${steps} step${steps === 1 ? "" : "s"}\n` + log.slice(-7).join("\n"));
  function reset() { state = {}; chosen = {}; log = []; steps = 0; gen = mode === "resolve" ? solve(0, {}) : null; draw(); show(); }
  function latest() {
    ORDER.forEach((p) => (chosen[p] = versions(p)[0]));
    log = ORDER.map((p) => `take ${p} ${chosen[p]}`); steps = 3;
    const broken = ["web", "db"].filter((p) => !sat(chosen.log, REG[p][chosen[p]].log));
    broken.forEach((p) => { state[`${p}@${chosen[p]}`] = "broken"; log.push(`✗ ${p} ${chosen[p]} needs log ${REG[p][chosen[p]].log}, got ${chosen.log}`); });
    if (broken.length) { state[`log@${chosen.log}`] = "broken"; sawBroken = true; }
    draw(); show();
    api.explain("A broken install", `<p>The newest web needs <b>log 2.x</b> and the newest db needs <b>log 1.x</b>. Only one copy of log can be installed, so one of them gets a version it was never tested with. In Python that's an <code>ImportError</code> or a subtle bug at runtime.</p><p>Switch to the <b>backtracking resolver</b>.</p>`);
  }
  function step() {
    if (mode === "latest") { if (!steps) latest(); return true; }
    const r = gen.next();
    if (r.done) {
      if (r.value) {
        log.push(`✓ solved: ${ORDER.map((p) => `${p} ${chosen[p]}`).join(", ")}`); show();
        if (sawBroken && !reached) { reached = true; api.explain("Every requirement is satisfied", `<p>The resolver took the newest web first, found no db and log to go with it, and <b>backtracked</b> to web 2.1.0, which still accepts log 1.x. Then the newest db and log 1.5.0 fit everything. pip, Cargo, Bundler and Poetry all search like this (with cleverer rules for which choice to undo).</p>`); api.done("You resolved the versions by backtracking"); }
      }
      return false;
    }
    const e = r.value; steps++;
    if (e.kind === "pick") { chosen[e.p] = e.v; state[`${e.p}@${e.v}`] = "pick"; }
    else if (e.kind === "reject") state[`${e.p}@${e.v}`] = "reject";
    else { delete chosen[e.p]; state[`${e.p}@${e.v}`] = "back"; ORDER.slice(ORDER.indexOf(e.p) + 1).forEach((q) => versions(q).forEach((v) => delete state[`${q}@${v}`])); }
    log.push((e.kind === "pick" ? "→ " : e.kind === "reject" ? "✗ " : "↩ ") + e.why);
    draw(); W.flash(`${e.p}@${e.v}`); show();
    return true;
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(380); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "newest of everything", value: "latest" }, { label: "backtracking resolver", value: "resolve" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.6, 0], dist: 17.5, theta: 0, phi: 1.4, instant: true });
  api.hud("green = chosen · red = rejected · yellow = backed out of · click a version for its needs");
  reset();
  api.explain("How to read this", "<p>Each column lists the published versions of one package, newest on top. Your app needs <b>web ^2.0</b> (any 2.x) and <b>db ^1.2</b> (any 1.x from 1.2).</p><p>Press <b>Step</b> to install the newest of everything. Does it work?</p>");
});
