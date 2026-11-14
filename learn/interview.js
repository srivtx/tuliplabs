/* Tulip Labs: interview mode (#interview), on the DSA track.
   One problem you haven't seen, 45 minutes, in the order a real interview runs:
     clarify  the questions worth asking; each good one is tied to a hidden test
     plan     name the pattern and its cost, and say the approach, before any code
     code     the editor; Run checks only the examples from the problem, as in an interview
     test     write a test of your own, then the hidden tests run: the edge cases and one big input
     twist    a follow-up that changes the problem
   Then a scorecard: every line says why, and every missed hidden test points back to the question
   you didn't ask. A problem you didn't pass comes back two interviews later.

   Problems are content/ds-interview.json (tools/interview.py, which proves each one in real Python).
   The engine calls INTERVIEW.page(api) for #interview, with the same api as the mock test. */
(function () {
  "use strict";
  const STAGES = ["clarify", "plan", "code", "test", "twist"];
  const MINUTES = 45;
  const RUN_LIMIT = 15000;   // a run longer than this is stopped: a slow solution must not freeze the page
  const COME_BACK = 2;       // a problem you didn't pass returns after this many other interviews
  let A, DATA = null, tick = 0;
  const S = () => A.S;
  const st = () => (S().iv = S().iv || { hist: [], due: {} });
  const now = () => st().now;
  const prob = (id) => DATA.problems.find((p) => p.id === id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const save = () => A.save();

  async function load() {
    if (DATA) return DATA;
    const r = await fetch("../content/ds-interview.json", { cache: "no-cache" });
    DATA = await r.json();
    return DATA;
  }
  const chName = (num) => {
    const c = A.data().chapters.find((x) => x.num === num);
    return c ? c.title.replace(/\s*\(.*\)\s*$/, "") : "Chapter " + num;
  };
  // what a hidden test group is about, in words: the question it hangs on, or the big input
  const groupName = (p, tag) => (tag === "big" ? "A big input, against the clock" : (p.clarify.find((c) => c.tag === tag) || {}).q || tag);

  // ------------------------------------------------------------ choose --
  // a problem you haven't sat comes first; then one that's due back; then the one you sat longest ago
  function pickProblem() {
    const s = st(), done = s.hist.length;
    const sat = new Set(s.hist.map((h) => h.id));
    const fresh = DATA.problems.filter((p) => !sat.has(p.id));
    if (fresh.length) return fresh[Math.floor(Math.random() * fresh.length)].id;
    const due = Object.entries(s.due).filter(([, at]) => at <= done).map(([id]) => id);
    if (due.length) return due[0];
    const last = {};
    s.hist.forEach((h, i) => (last[h.id] = i));
    return DATA.problems.map((p) => p.id).sort((a, b) => (last[a] ?? -1) - (last[b] ?? -1))[0];
  }
  function begin() {
    const id = pickProblem(), p = prob(id);
    const order = A.shuffle(p.clarify.map((_, i) => i));
    const pats = A.shuffle([p.ch, ...p.decoys]);
    const costs = A.shuffle(p.bigos.slice());
    st().now = { id, stage: "clarify", reached: 0, start: Date.now(), ends: Date.now() + MINUTES * 60000, order, pats, costs,
      asked: [], patTries: [], costTries: [], approach: "", hints: 0, code: p.starter, mine: "", tests: null, first: null, twist: null, twistRes: null };
    save();
    draw();
    window.scrollTo(0, 0);
  }

  // -------------------------------------------------------------- page --
  function draw() {
    const { h } = A;
    clearInterval(tick);
    const m = A.main();
    m.textContent = "";
    const r = now();
    if (!r) return drawStart();
    if (r.stage === "card") return drawCard();
    const p = prob(r.id);
    if (!p) { delete st().now; save(); return drawStart(); }
    const clock = h("span", { class: "iv-clock" });
    const paint = () => {
      const left = Math.max(0, r.ends - Date.now());
      clock.textContent = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, "0")}`;
      clock.classList.toggle("low", left < 5 * 60000);
      if (!left) { clearInterval(tick); timeUp(); }
    };
    paint();
    tick = setInterval(paint, 1000);
    const stages = h("nav", { class: "iv-stages", "aria-label": "Stages" }, STAGES.map((s, i) => {
      const reached = i <= r.reached;
      return h(reached ? "button" : "span", { class: "iv-stage" + (s === r.stage ? " cur" : "") + (reached ? " on" : ""), type: reached ? "button" : null,
        onclick: reached ? () => { r.stage = s; save(); draw(); } : null, "aria-current": s === r.stage ? "step" : null }, s);
    }));
    const body = h("div", { class: "iv-body" });
    m.append(h("div", { class: "col iv" },
      h("div", { class: "iv-head" }, h("div", { class: "iv-top" }, h("div", { class: "eyebrow" }, "Interview · DSA"), h("span", { class: "grow" }), clock,
        h("button", { class: "iv-quit", type: "button", onclick: () => { if (confirmQuit()) { finish(); } } }, "end it here")),
        stages), body));
    ({ clarify: stClarify, plan: stPlan, code: stCode, test: stTest, twist: stTwist })[r.stage](p, r, body);
    document.title = "Interview · " + A.cfg.pageTitle;
  }
  let quitArmed = 0;
  function confirmQuit() {
    // no browser dialogs: the first click arms it, a second click within 4 s ends the interview
    if (Date.now() - quitArmed < 4000) return true;
    quitArmed = Date.now();
    A.toast("Click “end it here” again to stop and see your scorecard.");
    return false;
  }
  const say = (html) => A.h("div", { class: "iv-say" }, A.h("span", { class: "iv-who" }, "Interviewer"), A.h("div", { html }));
  const advance = (r, stage) => { r.stage = stage; r.reached = Math.max(r.reached, STAGES.indexOf(stage)); save(); draw(); window.scrollTo(0, 0); };
  const problemCard = (p, open) => {
    const d = A.h("details", { class: "iv-prob", open: open ? "" : null }, A.h("summary", {}, p.title), A.h("div", { class: "prompt", html: p.prompt }));
    return d;
  };

  // ----------------------------------------------------------- clarify --
  function stClarify(p, r, body) {
    const { h } = A;
    const list = h("div", { class: "iv-qs" });
    const paint = () => {
      list.textContent = "";
      for (const i of r.order) {
        const c = p.clarify[i], asked = r.asked.includes(i);
        list.append(h("div", { class: "iv-q" + (asked ? " asked" : "") },
          h("button", { class: "opt", type: "button", disabled: asked, onclick: () => { r.asked.push(i); save(); paint(); } }, h("span", { class: "iv-you" }, "You"), c.q),
          asked ? h("p", { class: "iv-a" }, c.a) : null));
      }
    };
    paint();
    body.append(
      say("<p>Here's the problem. Take a minute with it. <b>Before you write anything, what would you ask me?</b> Ask as many as you like; you'll get a straight answer to each.</p>"),
      problemCard(p, true), list,
      h("div", { class: "btns" }, h("button", { class: "key primary", onclick: () => advance(r, "plan") }, "I know enough: plan it →")));
  }

  // -------------------------------------------------------------- plan --
  function stPlan(p, r, body) {
    const { h } = A;
    const patOk = r.patTries.includes(p.ch), costOk = r.costTries.includes(p.bigo);
    const pats = h("div", { class: "opts iv-opts" }, r.pats.map((n) => {
      const tried = r.patTries.includes(n);
      return h("button", { class: "opt" + (tried ? (n === p.ch ? " right" : " wrong") : ""), type: "button", disabled: patOk || tried,
        onclick: () => { r.patTries.push(n); save(); draw(); } }, chName(n));
    }));
    const patSay = !r.patTries.length ? null : patOk
      ? say(`<p>Good choice: <b>${esc(chName(p.ch))}</b>. What will it cost?</p>`)
      : say(`<p>Hmm. Would that stay fast at the sizes we talked about? ${p.hints[0]}</p>`);
    const costs = patOk ? h("div", { class: "opts iv-opts" }, r.costs.map((c) => {
      const tried = r.costTries.includes(c);
      return h("button", { class: "opt" + (tried ? (c === p.bigo ? " right" : " wrong") : ""), type: "button", disabled: costOk || tried,
        onclick: () => { r.costTries.push(c); save(); draw(); } }, c);
    })) : null;
    const costSay = !patOk || !r.costTries.length ? null : costOk
      ? say("<p>Right. Walk me through it in a sentence or two, then go ahead and code it.</p>")
      : say("<p>Are you sure? Count how many times each item gets touched.</p>");
    const ta = h("textarea", { class: "guess iv-approach", rows: 3, placeholder: "My approach: …", "aria-label": "Your approach, in a sentence or two" });
    ta.value = r.approach;
    const words = () => r.approach.trim().split(/\s+/).filter(Boolean).length;
    const go = h("button", { class: "key primary", disabled: words() < 6 }, "Start coding →");
    ta.oninput = () => { r.approach = ta.value; save(); go.disabled = words() < 6; };
    go.onclick = () => advance(r, "code");
    body.append(problemCard(p, false),
      say("<p>Before any code: <b>which technique</b> do you want to use?</p>"), pats, patSay,
      costs ? h("p", { class: "iv-ask" }, "And its running time:") : null, costs, costSay,
      costOk ? h("div", {}, ta, h("p", { class: "mk-muted iv-small" }, "Say it the way you'd say it out loud. At least a sentence.")) : null,
      costOk ? h("div", { class: "btns" }, go) : null);
  }

  // -------------------------------------------------------------- code --
  function runReq(code, tests) {
    // stop a run that goes on too long, the way a judge would, so a slow answer can't freeze the page
    let timer;
    const limit = new Promise((res) => { timer = setTimeout(() => { A.Runner.stop(); res({ passed: false, timeout: true }); }, RUN_LIMIT); });
    const go = A.Runner.run({ op: "check", prelude: DATA.prelude, lang: "py", setup: "", code, tests }).then((x) => x || { passed: false, error: "No answer from Python." });
    return Promise.race([go, limit]).finally(() => clearTimeout(timer));
  }
  function result(res) {
    const { h } = A;
    if (res.timeout) return h("div", { class: "result fail" }, `Still running after ${RUN_LIMIT / 1000} s, so it was stopped. It's too slow for the big input.`);
    if (res.passed) return h("div", { class: "result pass" }, `All ${res.total} check${res.total === 1 ? "" : "s"} pass.`);
    if (res.error) return h("div", { class: "result fail" }, h("p", {}, "It stops with an error:"), h("pre", { class: "mk-code small" }, res.error));
    return h("div", { class: "result fail" }, h("p", {}, `${res.ok || 0} of ${res.total || "?"} pass. This one doesn't:`), h("pre", { class: "mk-code small" }, res.failed || ""), res.message ? h("p", {}, res.message) : "");
  }
  function editorBox(r, key, label, onRun) {
    const ed = (A.Editor)(r[key], { lang: "py", label, onRun, onChange: (v) => { r[key] = v; save(); } });
    return ed;
  }
  function stCode(p, r, body) {
    const { h } = A;
    const out = h("div", { class: "mk-checks" });
    const run = h("button", { class: "btn" }, "Run the examples");
    const runIt = async () => {
      if (run.disabled) return;
      run.disabled = true; run.textContent = "Running…";
      out.replaceChildren(result(await runReq(r.code, p.examples)));
      run.disabled = false; run.textContent = "Run the examples";
    };
    run.onclick = runIt;
    const ed = editorBox(r, "code", "Your solution", runIt);
    const hintBox = h("div", {});
    const paintHints = () => {
      hintBox.textContent = "";
      for (let i = 0; i < r.hints; i++) hintBox.append(say(p.hints[i]));
      if (r.hints < p.hints.length) hintBox.append(h("button", { class: "iv-hint", type: "button", onclick: () => { r.hints++; save(); paintHints(); } },
        r.hints ? "I'm still stuck" : "I'm stuck: give me a nudge"));
    };
    paintHints();
    body.append(problemCard(p, true),
      say(`<p>Go ahead. <b>Run</b> checks the examples from the problem; I'll test it properly when you say it's done.</p>`),
      ed.el, h("div", { class: "btns mk-run" }, run, h("span", { class: "kbd" }, "Ctrl/⌘ + Enter runs them too."), h("span", { class: "grow" }),
        h("button", { class: "key primary", onclick: () => advance(r, "test") }, "It's done: test it →")), out, hintBox);
  }

  // -------------------------------------------------------------- test --
  async function runHidden(p, r) {
    const groups = [{ tag: "examples", code: p.examples }, ...p.tests];
    const res = [];
    for (const g of groups) {
      const x = await runReq(r.code, g.code);
      res.push({ tag: g.tag, passed: !!x.passed, timeout: !!x.timeout, failed: x.failed || "", message: x.message || x.error || "" });
    }
    return res;
  }
  function stTest(p, r, body) {
    const { h } = A;
    if (!r.mine) r.mine = `assert ${p.fn}(…) == …`;
    const ta = h("textarea", { class: "guess mk-type iv-mine", rows: 3, spellcheck: "false", "aria-label": "Your own test" });
    ta.value = r.mine;
    ta.oninput = () => { r.mine = ta.value; save(); };
    const out = h("div", { class: "iv-lamps" });
    const go = h("button", { class: "key primary" }, r.tests ? "Run them again" : "Run my test and yours");
    const paint = () => {
      out.textContent = "";
      if (!r.tests) return;
      const mine = r.tests.mine;
      out.append(h("div", { class: "iv-lamp " + (mine.valid ? "ok" : "bad") }, h("i"),
        h("div", {}, h("b", {}, "Your test"), h("span", {}, mine.valid ? (mine.yours ? "A fair test, and your code passes it." : "A fair test, and it catches your code out. Good test.") : "This test isn't right: the reference solution fails it too, or it doesn't run."))));
      for (const g of r.tests.groups) out.append(h("div", { class: "iv-lamp " + (g.passed ? "ok" : "bad") }, h("i"),
        h("div", {}, h("b", {}, g.tag === "examples" ? "The examples" : groupName(p, g.tag)),
          g.passed ? null : h("span", {}, g.timeout ? "Too slow: stopped." : g.failed ? h("code", {}, g.failed) : g.message))));
      const all = r.tests.groups.every((g) => g.passed);
      out.append(say(all ? "<p>Everything passes. One more thing…</p>" : "<p>Some of mine fail. You can go back and fix it, or move on to the follow-up.</p>"),
        h("div", { class: "btns" }, all ? null : h("button", { class: "btn", onclick: () => advance(r, "code") }, "← Fix it"),
          h("button", { class: "key primary", onclick: () => { if (!r.twist) r.twist = r.code; advance(r, "twist"); } }, "On to the follow-up →")));
    };
    go.onclick = async () => {
      go.disabled = true; go.textContent = "Running the hidden tests…";
      const own = r.mine.trim() && !/…/.test(r.mine) ? r.mine : "";
      const ref = own ? await runReq(p.solution, own) : { passed: false };
      const yours = own ? await runReq(r.code, own) : { passed: false };
      const groups = await runHidden(p, r);
      r.tests = { mine: { valid: !!(own && ref.passed && ref.total), yours: !!yours.passed }, groups };
      if (!r.first) r.first = { groups: groups.map((g) => ({ tag: g.tag, passed: g.passed })), at: Date.now() };
      save();
      go.disabled = false; go.textContent = "Run them again";
      paint();
    };
    paint();
    body.append(say(`<p>Before I run mine: <b>write one test you'd check</b>, as an <code>assert</code>. Pick the case you think is most likely to break it.</p>`),
      ta, h("div", { class: "btns" }, go), out);
  }

  // ------------------------------------------------------------- twist --
  function stTwist(p, r, body) {
    const { h } = A;
    if (r.twist == null) r.twist = r.code;
    const out = h("div", { class: "mk-checks" });
    if (r.twistRes) out.append(result(r.twistRes));
    const run = h("button", { class: "btn" }, "Run my checks");
    const runIt = async () => {
      if (run.disabled) return;
      run.disabled = true; run.textContent = "Running…";
      r.twistRes = await runReq(r.twist, p.twisttests);
      save();
      out.replaceChildren(result(r.twistRes));
      run.disabled = false; run.textContent = "Run my checks";
    };
    run.onclick = runIt;
    const ed = editorBox(r, "twist", "Your follow-up", runIt);
    body.append(say(p.twist), ed.el,
      h("div", { class: "btns mk-run" }, run, h("span", { class: "grow" }), h("button", { class: "key primary", onclick: () => finish() }, "Finish →")), out);
  }

  // ------------------------------------------------------------ finish --
  async function timeUp() {
    const r = now();
    if (!r || r.stage === "card") return;
    A.toast("Time's up.");
    await finish();
  }
  async function finish() {
    const r = now(), p = prob(r.id);
    clearInterval(tick);
    A.main().textContent = "";
    A.main().append(A.h("div", { class: "col iv" }, A.h("p", { class: "mk-muted" }, "Marking it…")));
    if (!r.tests && r.code !== p.starter) {   // ended before testing: the hidden tests still run on what you wrote
      const groups = await runHidden(p, r);
      r.tests = { mine: { valid: false, yours: false }, groups };
      r.first = r.first || { groups: groups.map((g) => ({ tag: g.tag, passed: g.passed })) };
    }
    if (r.twist && r.twist !== r.code && !r.twistRes) r.twistRes = await runReq(r.twist, p.twisttests);
    r.card = score(p, r);
    r.secs = Math.round((Math.min(Date.now(), r.ends) - r.start) / 1000);
    r.stage = "card";
    const s = st();
    s.hist.push({ id: r.id, at: Date.now(), secs: r.secs, verdict: r.card.verdict, dots: r.card.rows.map((x) => x.dots) });
    if (r.card.verdict === "Ready") delete s.due[r.id];
    else s.due[r.id] = s.hist.length + COME_BACK;
    save();
    draw();
  }

  // the scorecard: five or six lines of four dots, each with the reason in words
  function score(p, r) {
    const rows = [];
    const clamp = (x) => Math.max(0, Math.min(4, Math.round(x)));
    const patMiss = r.patTries.filter((n) => n !== p.ch).length, costMiss = r.costTries.filter((c) => c !== p.bigo).length;
    const solved = r.patTries.includes(p.ch);
    rows.push({ name: "Problem solving", dots: clamp(4 - Math.min(2, patMiss) - (costMiss ? 1 : 0) - r.hints * 0.5 - (solved ? 0 : 4)),
      why: [solved ? (patMiss ? `${chName(p.ch)}, after ${patMiss} wrong guess${patMiss === 1 ? "" : "es"}` : `${chName(p.ch)}, first time`) : "no technique named",
        costMiss ? "cost needed a second look" : r.costTries.length ? "the cost right" : "", r.hints ? `${r.hints} nudge${r.hints === 1 ? "" : "s"} while coding` : "no nudges"].filter(Boolean).join(", ") });
    const good = p.clarify.map((c, i) => [c, i]).filter(([c]) => c.tag);
    const askedGood = good.filter(([, i]) => r.asked.includes(i));
    const words = r.approach.trim().split(/\s+/).filter(Boolean).length;
    const unasked = good.filter(([, i]) => !r.asked.includes(i)).map(([c]) => `“${c.q}”`);
    rows.push({ name: "Communication", dots: clamp((askedGood.length / good.length) * 3 + (words >= 12 ? 1 : 0)),
      why: `asked ${askedGood.length} of the ${good.length} questions that mattered${unasked.length ? `; not asked: ${unasked.join(" ")}` : ""}${words >= 12 ? "" : "; the approach was short"}` });
    const groups = r.tests ? r.tests.groups : [];
    const passed = groups.filter((g) => g.passed).length;
    const firstAll = r.first && r.first.groups.every((g) => g.passed);
    rows.push({ name: "Code", dots: groups.length ? clamp((passed / groups.length) * 3 + (firstAll ? 1 : 0)) : 0,
      why: groups.length ? `${passed} of ${groups.length} test groups pass${firstAll ? ", all on the first run" : r.first ? `; ${r.first.groups.filter((g) => g.passed).length} did on the first run` : ""}` : "never tested" });
    const edges = (r.first ? r.first.groups : []).filter((g) => g.tag !== "big" && g.tag !== "examples");
    const edgeOk = edges.filter((g) => g.passed).length;
    const missed = edges.filter((g) => !g.passed).map((g) => {
      const c = p.clarify.findIndex((x) => x.tag === g.tag);
      return `${groupName(p, g.tag)}${c >= 0 && !r.asked.includes(c) ? " (you didn't ask)" : ""}`;
    });
    const mine = r.tests && r.tests.mine;
    rows.push({ name: "Testing", dots: clamp((mine && mine.valid ? 2 : 0) + (edges.length ? (edgeOk / edges.length) * 2 : 0)),
      why: `${mine && mine.valid ? "your own test was fair" : "no fair test of your own"}${missed.length ? `; missed on the first run: ${missed.join("; ")}` : edges.length ? "; every edge case held first time" : ""}` });
    const big = groups.find((g) => g.tag === "big");
    const mins = (Math.min(Date.now(), r.ends) - r.start) / 60000;
    rows.push({ name: "Speed", dots: clamp((big && big.passed ? 2 : 0) + (mins <= 30 ? 2 : mins <= 40 ? 1 : 0)),
      why: `${big && big.passed ? "fast enough for the big input" : "too slow for the big input, or not tested"}, in ${Math.round(mins)} of ${MINUTES} minutes` });
    const tw = r.twistRes;
    rows.push({ name: "Follow-up", dots: tw ? clamp(tw.passed ? 4 : ((tw.ok || 0) / (tw.total || 1)) * 3) : 0,
      why: tw ? (tw.passed ? "the follow-up works" : `${tw.ok || 0} of ${tw.total || "?"} follow-up checks pass`) : "not attempted" });
    const avg = rows.reduce((t, x) => t + x.dots, 0) / rows.length;
    const verdict = avg >= 3.2 ? "Ready" : avg >= 2.3 ? "Almost ready" : "Not yet";
    return { rows, verdict, avg };
  }

  function drawCard() {
    const { h } = A;
    const r = now(), p = prob(r.id), c = r.card;
    const dots = (n) => h("span", { class: "iv-dots", "aria-label": `${n} of 4` }, [0, 1, 2, 3].map((i) => h("i", { class: i < n ? "on" : "" })));
    const sol = A.Editor(p.solution, { readonly: true, lang: "py", label: "A reference solution" });
    const tw = A.Editor(p.twistsolution, { readonly: true, lang: "py", label: "A reference follow-up" });
    A.main().append(h("div", { class: "col iv" },
      h("header", { class: "ch-head" }, h("div", { class: "eyebrow" }, "Interview · DSA · scorecard"), h("h1", {}, p.title),
        h("p", { class: "iv-verdict v-" + c.verdict.split(" ")[0].toLowerCase() }, c.verdict)),
      h("div", { class: "iv-card" }, c.rows.map((x) => h("div", { class: "iv-row" }, h("b", {}, x.name), dots(x.dots), h("span", {}, x.why)))),
      c.verdict === "Ready" ? null : h("p", { class: "mk-muted" }, `This problem will come back in ${COME_BACK} interviews' time.`),
      h("h3", { class: "mk-h" }, "How I'd do it"), h("div", { class: "prompt", html: p.approach }), sol.el,
      h("h3", { class: "mk-h" }, "The follow-up"), h("div", { class: "prompt", html: p.twist }), tw.el,
      h("div", { class: "btns iv-end" }, h("button", { class: "key primary", onclick: () => { delete st().now; save(); begin(); } }, "Another interview →"),
        h("a", { class: "btn", href: "#mock" }, "Back to the mock test"))));
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------- start --
  function drawStart() {
    const { h } = A;
    const s = st();
    const sat = new Set(s.hist.map((x) => x.id)).size;
    const hist = s.hist.slice(-6).reverse();
    A.main().append(h("div", { class: "col iv" },
      h("header", { class: "ch-head" }, h("div", { class: "eyebrow" }, "Interview · DSA"), h("h1", {}, "One problem. Forty-five minutes."),
        h("p", { class: "tag" }, "A problem you haven't seen, with the chapter hidden, so working out the technique is part of the job. It runs the way a real interview does, and ends with a scorecard that says why.")),
      h("ol", { class: "iv-how" },
        [["clarify", "Ask what you need to know. Each question that matters hides a test."], ["plan", "Name the technique and its cost, and say your approach, before any code."],
          ["code", "Write it. Run checks only the examples from the problem."], ["test", "Write a test of your own; then the hidden tests run, edge cases and a big input."],
          ["twist", "A follow-up changes the problem. Adapt your code."]].map(([w, t]) => h("li", {}, h("b", {}, w), h("span", {}, t)))),
      h("div", { class: "btns" }, h("button", { class: "key primary", onclick: begin }, "Start the interview →"),
        h("span", { class: "mk-muted" }, `${DATA.problems.length} problems · ${sat} sat so far`)),
      hist.length ? h("div", { class: "mk-hist" }, h("h3", {}, "Your last interviews"), h("table", {}, hist.map((x) => h("tr", {},
        h("td", {}, new Date(x.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })), h("td", {}, (prob(x.id) || {}).title || x.id),
        h("td", {}, h("b", {}, x.verdict)), h("td", { class: "mk-muted" }, `${Math.round(x.secs / 60)} min`))))) : null));
    document.title = "Interview · " + A.cfg.pageTitle;
  }

  window.INTERVIEW = {
    async page(api) {
      A = api;
      A.sidebar("interview");
      const m = A.main();
      m.textContent = "";
      m.append(A.h("div", { class: "col iv" }, A.h("p", { class: "mk-muted" }, "Loading…")));
      try { await load(); } catch (e) { m.textContent = ""; m.append(A.h("div", { class: "empty" }, A.h("p", {}, "Could not load the interview problems."), A.h("button", { class: "btn primary", onclick: () => location.reload() }, "Try again"))); return; }
      draw();
    },
  };
})();
