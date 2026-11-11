/* Tulip Labs: the mock test (#mock), on every course track: DSA, Build your own X, Stats, ModSim, Complexity.
   A timed test drawn from the chapters you pick: multiple choice, "what does it print?", find the bug line,
   which pattern fits (DSA), put the lines in order, explain it in your own words, and fresh "trace it"
   questions from learn/mock-gen.js (DSA) and learn/mock-gen-x.js (the other tracks).
   Nothing is marked until the end (or after each question, if you ask for that). Then a results page
   with your weakest chapters first, every answer explained, and the misses added to spaced review.
   Misses also come back in later mocks (the next one, then 2 and 4 mocks on) until they're right 3 times.

   The question banks are content/<track>-mock.json (tools/mock.py); generated questions are checked against
   real Python, Node, Express and SQLite by tools/mock-check.js. The engine calls MOCK.page(api) for #mock.
   The first word of the setup sentence is the subject: clicking it opens the next track's mock. */
(function () {
  "use strict";
  const MIX = [["mc", 0.25], ["trace", 0.3], ["pattern", 0.1], ["out", 0.1], ["line", 0.08], ["order", 0.09], ["explain", 0.08]];
  const KIND_NAME = { mc: "Multiple choice", trace: "Trace it", pattern: "Which pattern fits?", out: "What does it print?", line: "Find the bug", order: "Put it in order", explain: "Explain it" };
  const KIND_TEXT = {
    mc: "Four answers, one right. From every chapter's quick-fire quizzes.", trace: "A short program with fresh numbers: say what it prints. Made up for each test.",
    pattern: "A real interview problem, with its hints cut off. Which chapter's technique solves it?", out: "A snippet from a chapter: type exactly what it prints.",
    line: "A program with a wrong line. Click it.", order: "Scrambled lines and a couple of decoys. Build the working program.",
    explain: "A why-question. Say the answer in your own words, then hold it up against the model answer and mark yourself honestly.",
  };
  // the subjects with a mock test: the sentence's first word cycles through them
  const SUBJECTS = [["ds", "DSA", "../dsa/"], ["bx", "Build your own X", "../build/"], ["ps", "Probability & Stats", "../stats/"], ["ms", "ModSim", "../modsim/"], ["tc", "Complexity in code", "../code/"]];
  // topics that cut across a track's parts, offered as scopes alongside them
  const TOPICS = {
    bx: [["Node and Express backends", [50, 51, 52, 53]], ["databases and storage", [6, 7, 8, 25, 38]], ["system design", [19, 20, 25, 34, 35, 36, 37, 38, 39, 40, 41]],
      ["object modelling", [1]], ["languages and parsers", [2, 3, 4, 5]], ["dev tools", [8, 9, 26, 27, 28, 29, 30, 31]]],
    ds: [["the interview core", [3, 4, 6, 7, 8, 9, 11, 13, 15, 17, 19, 20, 28]], ["graphs", [19, 20, 21, 22, 23, 24, 25, 51, 52, 53, 54, 55, 56]], ["dynamic programming", [28, 29, 30, 31, 32, 33, 34, 35, 36]]],
  };
  let TRACK = "ds";
  const K = (name) => (TRACK === "ds" ? name : name + "_" + TRACK);
  const gensHere = () => window.MOCKGEN.of(TRACK);
  const chLang = (q) => (BANK.ch[q.ch] && BANK.ch[q.ch].lang) || "py";
  const COUNTS = [10, 20, 40];
  const PACES = [["90 s a question", 90], ["untimed", 0], ["45 s a question", 45]];
  const MARKS = [["at the end", "end"], ["after each one", "each"]];
  // chapters close enough that one could solve the other's problem: never offered against each other in "which pattern?"
  const FAMILIES = [[4, 43, 44, 45, 46, 59], [5, 27, 33], [6, 14, 15, 16], [7, 8], [9, 10], [11, 12], [17, 18, 34, 47], [19, 20, 21, 22, 23, 24, 25],
    [20, 51, 52, 56], [53, 54], [26, 48, 49, 50], [28, 29, 30, 31, 32, 33, 34, 35, 36, 40], [37, 38, 39, 40, 41, 42], [3, 49], [27, 59]];

  let A, BANK = null, run = null, view = null, tick = 0;
  const S = () => A.S;

  async function loadBank() {
    if (BANK) return BANK;
    const r = await fetch(`../content/${TRACK}-mock.json`, { cache: "no-cache" });
    BANK = await r.json();
    BANK.byId = Object.fromEntries(BANK.questions.map((q) => [q.id, q]));
    BANK.ch = Object.fromEntries(BANK.chapters.map((c) => [c.num, c]));
    GEN_CH = Object.fromEntries(gensHere().map((g) => [g, window.MOCKGEN.make(g, 1).ch]));
    return BANK;
  }

  // ------------------------------------------------------------ setup --
  function setupState() {
    const st = S()[K("mockSetup")] || {};
    return { count: COUNTS.includes(st.count) ? st.count : 20, scope: st.scope || "started", pace: PACES.some((p) => p[1] === st.pace) ? st.pace : 90, marks: st.marks || "end" };
  }
  function scopes() {
    const chs = A.data().chapters;
    const started = chs.filter((c) => A.chProgress(c).d > 0).map((c) => c.num);
    const out = [];
    if (started.length) out.push({ key: "started", label: started.length === 1 ? "the chapter I've started" : `the ${started.length} chapters I've started`, nums: started });
    const weak = weakest();
    if (weak.length) out.push({ key: "weak", label: "my weakest chapters", nums: weak });
    out.push({ key: "all", label: "the whole track", nums: chs.map((c) => c.num) });
    const have = new Set(chs.map((c) => c.num));
    for (const [label, nums] of TOPICS[TRACK] || []) if (nums.some((n) => have.has(n))) out.push({ key: "topic:" + label, label, nums: nums.filter((n) => have.has(n)) });
    for (const part of [...new Set(chs.map((c) => c.part).filter(Boolean))]) out.push({ key: "part:" + part, label: part.replace(/^Part (\w+) · /, "Part $1, "), nums: chs.filter((c) => c.part === part).map((c) => c.num) });
    return out;
  }
  function weakest() {
    const st = S()[K("mockStats")] || {};
    return Object.entries(st).filter(([, s]) => s.n >= 2 && s.right / s.n < 0.8).sort((a, b) => a[1].right / a[1].n - b[1].right / b[1].n).slice(0, 6).map(([n]) => +n);
  }

  function pageSetup() {
    const { h } = A;
    const m = A.main();
    m.textContent = "";
    const st = setupState();
    const sc = scopes();
    if (!sc.some((s) => s.key === st.scope)) st.scope = sc.some((s) => s.key === "started") ? "started" : "all";
    const save = () => { S()[K("mockSetup")] = st; A.save(); draw(); };
    const cycle = (list, cur) => list[(list.indexOf(cur) + 1) % list.length];
    // a clickable word: click to move to the next choice, shift-click for the previous one
    const word = (text, onPick, title) => h("button", { class: "mk-word", type: "button", title, onclick: onPick }, text);
    const sentence = h("p", { class: "mk-sentence" });
    const mix = h("p", { class: "mk-mix" });
    const draw = () => {
      const scope = sc.find((s) => s.key === st.scope);
      sentence.textContent = "";
      const subj = SUBJECTS.findIndex((x) => x[0] === TRACK), nextSubj = SUBJECTS[(subj + 1) % SUBJECTS.length];
      sentence.append("Give me ",
        word(String(st.count), () => { st.count = cycle(COUNTS, st.count); save(); }, "How many questions: click to change"),
        " ",
        word(SUBJECTS[subj][1], () => { location.href = nextSubj[2] + "#mock"; }, `The subject: click for ${nextSubj[1]}`),
        " questions from ",
        word(scope.label, () => { st.scope = cycle(sc.map((s) => s.key), st.scope); save(); }, "Which chapters: click to change"),
        ", ",
        word(PACES.find((p) => p[1] === st.pace)[0], () => { st.pace = cycle(PACES.map((p) => p[1]), st.pace); save(); }, "How long: click to change"),
        ", marked ",
        h("span", { class: "mk-nowrap" }, word(MARKS.find((p) => p[1] === st.marks)[0], () => { st.marks = cycle(MARKS.map((p) => p[1]), st.marks); save(); }, "When you see the answers: click to change"), "."));
      const total = st.pace ? Math.round((st.count * st.pace) / 60) : 0;
      const have = available(scope);
      const due = Math.min(dueBack(new Set(scope.nums)).length, Math.round(st.count * 0.3));
      mix.innerHTML = (have < st.count ? `<b>These chapters hold ${have} questions, so the mock will be ${have} long.</b> ` : "") + `${scope.nums.length} chapter${scope.nums.length === 1 ? "" : "s"} · ${st.pace ? `${total} minutes on the clock` : "no clock"} · ${st.marks === "end" ? "nothing is marked until you finish, like a real test" : "each answer is marked as you go"}.${due ? ` ${due} question${due === 1 ? " you missed before is" : "s you missed before are"} due back.` : ""} Click any underlined word to change it, the subject too.`;
    };
    draw();
    const resume = S()[K("mockNow")] && S()[K("mockNow")].qs ? h("div", { class: "mk-resume" },
      h("p", {}, `You have a mock in progress: ${S()[K("mockNow")].qs.filter((q) => q.a != null).length} of ${S()[K("mockNow")].qs.length} answered.`),
      h("div", { class: "btns" }, h("button", { class: "btn primary", onclick: () => { run = S()[K("mockNow")]; startRun(); } }, "Carry on"),
        h("button", { class: "btn", onclick: () => { delete S()[K("mockNow")]; A.save(); pageSetup(); } }, "Throw it away"))) : null;
    const hist = (S()[K("mockHist")] || []).slice(-6).reverse();
    const present = new Set(BANK.questions.map((q) => q.kind));
    if (gensHere().length) present.add("trace");
    m.append(h("div", { class: "col mk" },
      h("header", { class: "ch-head" }, h("div", { class: "eyebrow" }, "Mock test · " + A.cfg.short), h("h1", {}, "Test yourself like it's the real thing"),
        h("p", { class: "tag" }, `Questions from every corner of the chapters you pick: multiple choice, what a program prints, the line with the bug,${present.has("pattern") ? " which technique a problem needs," : ""} scrambled code to put in order, why-questions to answer in your own words, and fresh trace questions made up on the spot for ${new Set(Object.values(GEN_CH)).size === A.data().chapters.length ? `every one of the ${A.data().chapters.length} chapters` : `${new Set(Object.values(GEN_CH)).size} of the chapters`}, so no two mocks are the same. Anything you miss comes back in later mocks until it sticks.`)),
      resume,
      h("div", { class: "mk-setup" }, sentence, mix,
        h("div", { class: "btns" }, h("button", { class: "key primary", onclick: () => begin(st) }, "Start the mock →"))),
      h("div", { class: "mk-kinds" }, Object.entries(KIND_NAME).filter(([k]) => present.has(k)).map(([k, name]) => h("div", {}, h("b", {}, name), h("span", {}, KIND_TEXT[k])))),
      hist.length ? h("div", { class: "mk-hist" }, h("h3", {}, "Your last mocks"), h("table", {}, hist.map((r) => h("tr", {},
        h("td", {}, new Date(r.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })), h("td", {}, h("b", {}, `${r.right} / ${r.n}`)),
        h("td", {}, fmtTime(r.secs)), h("td", { class: "mk-muted" }, r.scope))))) : null));
    document.title = "Mock test · " + A.cfg.pageTitle;
    window.scrollTo(0, 0);
  }

  // how many questions a scope can give: its bank questions plus six fresh ones per generator that covers it
  function available(scope) {
    const nums = new Set(scope.nums);
    const gens = gensHere().filter((g) => nums.has(GEN_CH[g])).length;
    return BANK.questions.filter((q) => nums.has(q.ch)).length + 6 * gens;
  }

  // ------------------------------------------------------------- pick --
  // ------------------------------------------------- what comes back --
  // A missed question comes back in the next mock. Right then, it returns 2 mocks later, then 4; right a third
  // time and it's retired. Misses on a generator bring back the same kind of trace with fresh numbers.
  const BACK_AFTER = [1, 2, 4];
  const againKey = (q) => (q.kind === "trace" ? "g:" + q.gen : "q:" + q.id);
  const mockNo = () => (S()[K("mockHist")] || []).length;
  function dueBack(inScope) {
    const all = S()[K("mockAgain")] || {};
    return Object.entries(all).filter(([, e]) => e.due <= mockNo() && inScope.has(e.ch) && (e.gen ? GEN_CH[e.gen] != null : BANK.byId[e.id]))
      .sort((a, b) => a[1].due - b[1].due || a[1].box - b[1].box).map(([k, e]) => e);
  }
  function rememberResults(qs) {
    const all = (S()[K("mockAgain")] = S()[K("mockAgain")] || {}), now = mockNo();
    let missed = 0, retired = 0, kept = 0;
    for (const q of qs) {
      const key = againKey(q), e = all[key];
      if (!q.ok) { all[key] = { kind: q.kind, ch: q.ch, ...(q.kind === "trace" ? { gen: q.gen } : { id: q.id }), box: 0, due: now + BACK_AFTER[0] }; missed++; }
      else if (e && e.due <= now) {
        e.box++;
        if (e.box >= BACK_AFTER.length) { delete all[key]; retired++; } else { e.due = now + BACK_AFTER[e.box]; kept++; }
      }
    }
    return { missed, retired, kept, waiting: Object.keys(all).length };
  }

  let GEN_CH = null;
  function pick(st) {
    const scope = scopes().find((s) => s.key === st.scope) || scopes()[0];
    const inScope = new Set(scope.nums);
    // first, what's due back from earlier mocks: up to 3 in 10
    const back = dueBack(inScope).slice(0, Math.round(st.count * 0.3)).map((e) => (e.gen
      ? { kind: "trace", gen: e.gen, seed: (Math.random() * 1e9) | 0, ch: e.ch, again: true }
      : { kind: e.kind, id: e.id, ch: e.ch, again: true }));
    const taken = new Set(back.map(againKey));
    const pools = { mc: [], pattern: [], out: [], line: [], order: [], explain: [], trace: [] };
    for (const q of BANK.questions) if (inScope.has(q.ch) && pools[q.kind] && !taken.has("q:" + q.id)) pools[q.kind].push({ kind: q.kind, id: q.id, ch: q.ch });
    const gens = gensHere().filter((g) => inScope.has(GEN_CH[g]) && !taken.has("g:" + g));
    for (const g of gens) for (let k = 0; k < 6; k++) pools.trace.push({ kind: "trace", gen: g, seed: (Math.random() * 1e9) | 0, ch: GEN_CH[g] });
    // spread each pool over chapters: shuffle, then take round-robin by chapter
    const spread = (list) => {
      const by = {};
      for (const q of A.shuffle(list)) (by[q.ch] = by[q.ch] || []).push(q);
      const rows = A.shuffle(Object.values(by)), out = [];
      while (rows.some((r) => r.length)) for (const r of rows) if (r.length) out.push(r.shift());
      return out;
    };
    for (const k in pools) pools[k] = spread(pools[k]);
    // trace questions: every generator once, in a random order, before any of them comes round again
    const rounds = {};
    for (const q of pools.trace) (rounds[q.gen] = rounds[q.gen] || []).push(q);
    pools.trace = [];
    for (let k = 0; k < 6; k++) pools.trace.push(...A.shuffle(Object.values(rounds).filter((r) => r[k]).map((r) => r[k])));
    const want = {};
    const fresh = st.count - back.length;
    let left = fresh;
    for (const [k, w] of MIX) { want[k] = Math.min(pools[k].length, Math.round(fresh * w)); left -= want[k]; }
    // whatever a small scope can't fill comes from the biggest pools
    while (left > 0) {
      const k = MIX.map((x) => x[0]).sort((a, b) => (pools[b].length - want[b]) - (pools[a].length - want[a]))[0];
      if (pools[k].length - want[k] <= 0) break;
      want[k]++; left--;
    }
    while (left < 0) { const k = MIX.map((x) => x[0]).sort((a, b) => want[b] - want[a])[0]; want[k]--; left++; }
    let qs = back.slice();
    for (const k in want) qs.push(...pools[k].slice(0, want[k]));
    qs = A.shuffle(qs);
    // fix each question's option order now, so it's the same if you come back to it
    for (const q of qs) {
      const full = resolve(q);
      if (full.opts) q.order = A.shuffle(full.opts.map((_, i) => i));
      if (q.kind === "pattern") q.choices = patternChoices(full, inScope);
      if (q.kind === "order") q.pool = A.shuffle(full.lines.concat(full.distractors).map((_, i) => i));
    }
    return { qs, scope: scope.label, pace: st.pace, marks: st.marks, count: qs.length, at: Date.now(), used: 0, cur: 0 };
  }
  function resolve(q) {
    if (q.kind === "trace") return window.MOCKGEN.make(q.gen, q.seed);
    return BANK.byId[q.id];
  }
  function wireDist(a) {
    const adj = {};
    for (const [x, y] of A.cfg.wires || []) { (adj[x] = adj[x] || []).push(y); (adj[y] = adj[y] || []).push(x); }
    const d = { [a]: 0 }, q = [a];
    while (q.length) { const u = q.shift(); for (const v of adj[u] || []) if (d[v] == null) { d[v] = d[u] + 1; q.push(v); } }
    return d;
  }
  function patternChoices(q, inScope) {
    const text = q.prompt.replace(/<[^>]+>/g, "").toLowerCase();
    const d = wireDist(q.ch);
    const close = new Set(FAMILIES.filter((f) => f.includes(q.ch)).flat());
    const ok = BANK.chapters.filter((c) => c.pattern && c.num !== q.ch && !close.has(c.num) && !(d[c.num] <= 2) && !c.words.some((w) => text.includes(w)));
    const near = ok.filter((c) => inScope.has(c.num));
    const from = near.length >= 3 ? near : ok;
    return A.shuffle([q.ch, ...A.shuffle(from).slice(0, 3).map((c) => c.num)]);
  }

  // -------------------------------------------------------------- run --
  async function begin(st) {
    run = pick(st);
    if (!run.qs.length) { A.toast("No questions in those chapters yet"); return; }
    S()[K("mockNow")] = run;
    A.save();
    startRun();
  }
  function startRun() {
    for (const lang of new Set(run.qs.filter((q) => q.kind === "order").map(chLang))) A.Runner.start("", lang); // the runner warms up in the background, for marking orderings
    view = "test";
    drawTest();
    clearInterval(tick);
    let last = Date.now();
    tick = setInterval(() => {
      if (view !== "test" || location.hash !== "#mock") { clearInterval(tick); return; }
      const now = Date.now();
      run.used += (now - last) / 1000; last = now;
      drawClock();
      if (run.pace && run.used >= run.pace * run.count) finish(true);
    }, 500);
  }
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  let clockEl = null, mapEl = null;
  function drawClock() {
    if (!clockEl) return;
    if (!run.pace) { clockEl.textContent = fmtTime(run.used); return; }
    const left = Math.max(0, run.pace * run.count - run.used);
    clockEl.textContent = fmtTime(left) + " left";
    clockEl.classList.toggle("low", left < 60);
  }

  function drawTest() {
    const { h } = A;
    const m = A.main();
    m.textContent = "";
    const i = run.cur, q = run.qs[i], full = resolve(q);
    const each = run.marks === "each";
    clockEl = h("span", { class: "mk-clock" });
    mapEl = h("div", { class: "mk-map", role: "navigation", "aria-label": "Questions" }, run.qs.map((x, k) => h("button", {
      class: "mk-dot" + (k === i ? " cur" : "") + (x.a != null ? " done" : "") + (x.flag ? " flag" : "") + (each && x.ok != null ? (x.ok ? " ok" : " bad") : ""),
      title: `Question ${k + 1}${x.flag ? " (flagged)" : ""}`, onclick: () => go(k),
    }, k + 1)));
    const body = h("div", { class: "mk-body" });
    const locked = each && q.ok != null;
    renderQuestion(body, q, full, locked);
    const feedback = h("div", { class: "mk-feedback" });
    if (locked) feedback.append(explain(q, full));
    const last = i === run.qs.length - 1;
    const nextBtn = h("button", { class: "btn primary" }, last ? "Finish the mock" : "Next →");
    nextBtn.onclick = async () => {
      if (each && q.ok == null && q.a != null) { await mark(q); drawTest(); return; }
      if (last) finish(false); else go(i + 1);
    };
    if (each && q.ok == null && q.a != null) nextBtn.textContent = "Check";
    m.append(h("div", { class: "col mk mk-test" },
      h("div", { class: "mk-bar" }, h("b", {}, `Question ${i + 1} of ${run.qs.length}`), h("span", { class: "grow" }), clockEl),
      mapEl,
      h("article", { class: "mk-card" + (locked ? (q.ok ? " ok" : " bad") : "") },
        h("div", { class: "mk-kind" }, KIND_NAME[q.kind], q.kind !== "pattern" && full.title ? h("span", { class: "mk-muted" }, " · " + full.title) : null,
          q.again ? h("span", { class: "mk-again", title: "You missed this one in an earlier mock" + (q.kind === "trace" ? ", so it comes back with fresh numbers" : "") }, "back again") : null),
        body, feedback),
      h("div", { class: "btns mk-nav" },
        h("button", { class: "btn", disabled: i === 0, onclick: () => go(i - 1) }, "← Back"),
        h("button", { class: "btn" + (q.flag ? " on" : ""), onclick: () => { q.flag = !q.flag; A.save(); drawTest(); } }, q.flag ? "⚑ Flagged" : "⚐ Flag for later"),
        h("span", { class: "grow" }),
        h("span", { class: "kbd" }, keysHint(q)),
        nextBtn)));
    drawClock();
    document.title = `Question ${i + 1} · Mock test`;
  }
  function keysHint(q) {
    if (q.kind === "mc" || q.kind === "pattern" || (q.kind === "trace" && resolve(q).match === "choice")) return "1–4 to pick · Enter for next";
    if (q.kind === "explain") return "Write it, then show the model answer";
    if (q.kind === "out" || q.kind === "trace") return "Ctrl/⌘ + Enter for next";
    return "Enter for next";
  }
  function go(k) { run.cur = Math.max(0, Math.min(run.qs.length - 1, k)); A.save(); drawTest(); window.scrollTo(0, 0); }
  function answer(q, a) { q.a = a; A.save(); mapEl && mapEl.children[run.cur].classList.toggle("done", a != null); }

  // one renderer per kind; each shows the question and records the answer in q.a
  function renderQuestion(body, q, full, locked) {
    const { h } = A;
    const lang = q.kind === "trace" ? full.lang : chLang(q);
    const hl = (src) => (lang === "sql" ? esc(src) : A.highlight(src, lang));
    const bad = new Set(full.lines || [full.line]);
    const code = (src, lines) => {
      const pre = h("pre", { class: "mk-code" + (lines ? " lines" : "") });
      if (lines) src.split("\n").forEach((l, n) => pre.append(h("button", { class: "mk-line" + (q.a === n ? " sel" : "") + (locked && bad.has(n) ? " right" : "") + (locked && q.a === n && !bad.has(n) ? " wrong" : ""), disabled: locked, onclick: () => { answer(q, n); [...pre.children].forEach((c, k) => c.classList.toggle("sel", k === n)); }, html: `<i>${n + 1}</i>` + (hl(l) || " ") })));
      else pre.innerHTML = hl(src);
      return pre;
    };
    const choices = (items, isRight) => h("div", { class: "opts" }, items.map((html, k) => {
      const b = h("button", { class: "opt" + (q.a === k ? " sel" : "") + (locked && isRight(k) ? " right" : "") + (locked && q.a === k && !isRight(k) ? " wrong" : ""), disabled: locked, html: `<kbd>${k + 1}</kbd> ${html}` });
      b.onclick = () => { answer(q, k); [...b.parentNode.children].forEach((c, j) => c.classList.toggle("sel", j === k)); };
      return b;
    }));
    if (q.kind === "mc") {
      body.append(h("div", { class: "prompt", html: full.q }), choices(q.order.map((k) => full.opts[k].t), (k) => full.opts[q.order[k]].ok));
    } else if (q.kind === "trace" && full.match === "choice") {
      body.append(h("div", { class: "prompt", html: full.prompt }), full.hide ? "" : code(full.code), choices(q.order.map((k) => full.opts[k].t), (k) => full.opts[q.order[k]].ok));
    } else if (q.kind === "trace" || q.kind === "out") {
      const ta = h("textarea", { class: "guess mk-type", rows: 2, placeholder: "Type exactly what it prints…", spellcheck: "false", "aria-label": "What it prints", disabled: locked });
      ta.value = q.a || "";
      ta.oninput = () => answer(q, ta.value.trim() ? ta.value : null);
      body.append(h("div", { class: "prompt", html: q.kind === "out" ? "<p>What does it print?</p>" : full.prompt }), code(full.code), ta,
        q.kind === "trace" ? h("p", { class: "kbd" }, "Lists can be typed with or without brackets and commas: [1, 2] and 1 2 both count.") : "");
      setTimeout(() => !locked && ta.focus(), 30);
    } else if (q.kind === "line") {
      body.append(h("p", {}, "It should pass these checks, and it doesn't:"), h("pre", { class: "mk-code small", html: hl(full.checks.join("\n")) }),
        h("p", { class: "mk-ask" }, bad.size > 1 ? "Two lines side by side are wrong. Click either one." : "One line is wrong. Click it."), code(full.code, true));
    } else if (q.kind === "pattern") {
      body.append(h("div", { class: "prompt", html: full.prompt }), h("p", { class: "mk-ask" }, "Which technique solves it best?"),
        choices(q.choices.map((n) => BANK.ch[n].name), (k) => q.choices[k] === full.ch));
    } else if (q.kind === "order") {
      const all = full.lines.concat(full.distractors);
      const built = h("div", { class: "mk-built" }), pool = h("div", { class: "mk-pool" });
      const chosen = () => q.a || [];
      const draw = () => {
        built.textContent = ""; pool.textContent = "";
        if (!chosen().length) built.append(h("p", { class: "mk-muted" }, "Click lines below to build the program, top to bottom."));
        chosen().forEach((k, n) => built.append(h("button", { class: "mk-ln", disabled: locked, onclick: () => { const a = chosen().slice(); a.splice(n, 1); answer(q, a.length ? a : null); draw(); }, html: hl(all[k]) })));
        q.pool.filter((k) => !chosen().includes(k)).forEach((k) => pool.append(h("button", { class: "mk-ln", disabled: locked, onclick: () => { answer(q, chosen().concat(k)); draw(); }, html: hl(all[k]) })));
      };
      draw();
      body.append(h("div", { class: "prompt", html: (full.prompt || "") + `<p>Build <b>${esc(full.title || "the program")}</b>. ${full.distractors.length ? `${full.distractors.length} line${full.distractors.length === 1 ? " doesn't" : "s don't"} belong.` : ""} Click a placed line to take it back.</p>` }), built, pool);
    } else if (q.kind === "explain") {
      // said in your own words, then held up against the model answer: you mark it yourself
      const ta = h("textarea", { class: "guess mk-type mk-explain", rows: 4, placeholder: "Your answer, in a sentence or three…", "aria-label": "Your answer", disabled: locked });
      ta.value = q.text || "";
      ta.oninput = () => { q.text = ta.value; A.save(); };
      const shown = h("div", { class: "mk-model" });
      const draw = () => {
        shown.textContent = "";
        if (!q.seen && !locked) { shown.append(h("button", { class: "btn", onclick: () => { q.seen = true; A.save(); draw(); } }, "Show the model answer")); return; }
        shown.append(h("p", { class: "mk-muted" }, "The model answer:"), h("div", { class: "mk-modelans", html: full.a }));
        if (locked) return;
        shown.append(h("p", { class: "mk-ask" }, "Did yours say the same thing?"), h("div", { class: "opts two" },
          h("button", { class: "opt" + (q.a === 1 ? " sel" : ""), onclick: () => { answer(q, 1); draw(); } }, "I had it"),
          h("button", { class: "opt" + (q.a === 0 ? " sel" : ""), onclick: () => { answer(q, 0); draw(); } }, "I didn't")));
      };
      draw();
      body.append(h("div", { class: "prompt", html: full.q }), ta, shown);
    }
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ------------------------------------------------------------- mark --
  const tidy = (s) => String(s).split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").replace(/^\n+|\n+$/g, "");
  async function mark(q) {
    const full = resolve(q);
    if (q.a == null) return (q.ok = false);
    if (q.kind === "explain") q.ok = q.a === 1;
    else if (q.kind === "mc") q.ok = !!full.opts[q.order[q.a]].ok;
    else if (q.kind === "trace") q.ok = full.match === "choice" ? !!full.opts[q.order[q.a]].ok : window.MOCKGEN.correct(full, q.a);
    else if (q.kind === "out") q.ok = tidy(q.a) === tidy(full.out) || tidy(q.a).replace(/\s+/g, " ") === tidy(full.out).replace(/\s+/g, " ");
    else if (q.kind === "line") q.ok = (full.lines || [full.line]).includes(q.a);
    else if (q.kind === "pattern") q.ok = q.choices[q.a] === full.ch;
    else if (q.kind === "order") {
      const all = full.lines.concat(full.distractors);
      const mine = q.a.map((k) => all[k]);
      if (mine.join("\n") === full.lines.join("\n")) q.ok = true;
      else if (q.a.some((k) => k >= full.lines.length) || q.a.length !== full.lines.length) q.ok = false; // a decoy, or a line missing
      else {
        // the same lines in another order can still be right: run the block's own tests with Python
        try {
          const r = await A.Runner.run({ op: "check", prelude: BANK.ch[q.ch].prelude, lang: chLang(q), setup: full.setup, code: mine.join("\n"), tests: full.tests || "" });
          q.ok = !!(r && r.passed);
        } catch (e) { q.ok = false; }
      }
    }
    A.save();
    return q.ok;
  }

  async function finish(timeUp) {
    if (view !== "test") return;
    const open = run.qs.filter((q) => q.a == null).length;
    if (!timeUp && open && !confirm(`${open} question${open === 1 ? " is" : "s are"} still unanswered. Finish anyway?`)) return;
    view = "marking";
    clearInterval(tick);
    const { h } = A;
    const m = A.main();
    m.textContent = "";
    m.append(h("div", { class: "col mk" }, h("p", { class: "mk-ask" }, timeUp ? "Time's up. Marking…" : "Marking…"),
      run.qs.some((q) => q.kind === "order" && q.a) ? h("p", { class: "kbd" }, "Orderings that differ from the reference run their tests, which may take a moment the first time.") : null));
    for (const q of run.qs) if (q.ok == null) await mark(q);
    const right = run.qs.filter((q) => q.ok).length;
    // the record: per-chapter stats for "my weakest chapters", the history, the review deck and some XP
    const st = (S()[K("mockStats")] = S()[K("mockStats")] || {});
    for (const q of run.qs) { const s = (st[q.ch] = st[q.ch] || { n: 0, right: 0 }); s.n++; if (q.ok) s.right++; }
    run.back = rememberResults(run.qs);
    (S()[K("mockHist")] = S()[K("mockHist")] || []).push({ at: Date.now(), n: run.qs.length, right, secs: Math.round(run.used), scope: run.scope });
    S()[K("mockHist")] = S()[K("mockHist")].slice(-30);
    for (const q of run.qs) if (q.id && A.findBlock(q.id)) { if (q.ok) A.enroll(q.id, true); else A.schedule(q.id, false); }
    const done = run;
    delete S()[K("mockNow")];
    A.save();
    if (right) A.award(right * 2, `mock test, ${right} right`);
    view = "results";
    drawResults(done, timeUp);
  }

  // ---------------------------------------------------------- results --
  function explain(q, full) {
    const { h } = A;
    const ch = BANK.ch[q.ch];
    const verdict = h("p", { class: "mk-verdict" }, h("b", {}, q.ok ? "Right." : q.a == null ? "Not answered." : "Not this time."));
    const box = h("div", { class: "why" }, verdict);
    const pre = (s) => h("pre", { class: "mk-code small", html: A.highlight(s, chLang(q)) });
    if (q.kind === "mc") { box.append(h("p", { html: "The answer: " + full.opts.find((o) => o.ok).t })); box.insertAdjacentHTML("beforeend", full.why || ""); }
    else if (q.kind === "trace") {
      if (full.match !== "choice" && q.a != null && !q.ok) box.append(h("p", {}, "You wrote:"), h("pre", { class: "mk-code small" }, q.a));
      box.append(h("p", {}, "It prints:"), h("pre", { class: "mk-code small" }, full.answer));
      box.insertAdjacentHTML("beforeend", full.why || "");
    } else if (q.kind === "out") {
      if (q.a != null && !q.ok) box.append(h("p", {}, "You wrote:"), h("pre", { class: "mk-code small" }, q.a));
      box.append(h("p", {}, "It prints:"), h("pre", { class: "mk-code small" }, full.out));
    } else if (q.kind === "line") {
      const ls = full.lines || [full.line];
      box.append(h("p", { html: `${ls.length > 1 ? `Lines ${ls[0] + 1} and ${ls[1] + 1} are` : `Line ${full.line + 1} is`} the bug${q.a != null && !q.ok ? ` (you picked line ${q.a + 1})` : ""}. The fix:` }), pre(full.fix), h("div", { html: full.prompt }));
    } else if (q.kind === "explain") {
      if (q.text && q.text.trim()) box.append(h("p", {}, "You wrote:"), h("blockquote", { class: "mk-yours" }, q.text));
      box.append(h("p", {}, "The model answer:"), h("div", { class: "mk-modelans", html: full.a }));
    } else if (q.kind === "pattern") {
      box.append(h("p", { html: `This is a <b>${esc(ch.name)}</b> problem${q.a != null && !q.ok ? `, not ${esc(BANK.ch[q.choices[q.a]].name)}` : ""}. It's the exercise <code>${esc(full.title)}</code> in chapter ${ch.num}.` }));
    } else if (q.kind === "order") {
      box.append(h("p", {}, "One working order:"), pre(full.lines.join("\n")));
    }
    box.append(h("p", {}, h("a", { href: "#" + ch.num }, `Chapter ${ch.num}: ${ch.title} →`)));
    return box;
  }

  // what this mock changed in the questions that come back
  function backNote(done) {
    const { h } = A, b = done.back;
    if (!b) return null;
    const again = done.qs.filter((q) => q.again), againRight = again.filter((q) => q.ok).length;
    const parts = [];
    if (again.length) parts.push(`${again.length === 1 ? `The question back from an earlier mock was ${againRight ? "right" : "missed again"}` : `${againRight} of the ${again.length} questions back from earlier mocks were right`} this time${b.retired ? `, and ${b.retired} ${b.retired === 1 ? "is" : "are"} now learned for good` : ""}.`);
    if (b.missed) parts.push(`The ${b.missed} you missed will come back in your next mock${done.qs.some((q) => !q.ok && q.kind === "trace") ? " (trace questions with fresh numbers)" : ""}, then 2 and 4 mocks later, until you've got each one right three times.`);
    else parts.push("Nothing missed, so nothing new to bring back.");
    return h("div", { class: "mk-backnote" }, h("b", {}, "What comes back. "), parts.join(" "), b.missed ? " Misses from the chapters are in your spaced review deck too." : "");
  }

  function drawResults(done, timeUp) {
    const { h } = A;
    const m = A.main();
    m.textContent = "";
    const n = done.qs.length, right = done.qs.filter((q) => q.ok).length;
    const pct = Math.round((100 * right) / n);
    // per chapter, weakest first
    const by = {};
    for (const q of done.qs) { const s = (by[q.ch] = by[q.ch] || { n: 0, right: 0 }); s.n++; if (q.ok) s.right++; }
    const rows = Object.entries(by).sort((a, b) => a[1].right / a[1].n - b[1].right / b[1].n || b[1].n - a[1].n);
    const kinds = {};
    for (const q of done.qs) { const s = (kinds[q.kind] = kinds[q.kind] || { n: 0, right: 0 }); s.n++; if (q.ok) s.right++; }
    const verdict = pct >= 90 ? "Ready for the real thing." : pct >= 70 ? "Solid. The chapters at the top of the list are where the next points are." : pct >= 50 ? "Halfway there. Revisit the first few chapters below, then try again." : "A good baseline. Every miss is now in your spaced review deck.";
    const list = h("div", { class: "mk-review" });
    done.qs.forEach((q, k) => {
      const full = resolve(q);
      const d = h("details", { class: "mk-item " + (q.ok ? "ok" : "bad") },
        h("summary", {}, h("span", { class: "mk-n" }, k + 1), h("span", { class: "mk-k" }, KIND_NAME[q.kind]), h("span", { class: "mk-t" }, (full.title || BANK.ch[q.ch].name) + (q.again ? " · back again" : "")), h("span", { class: "mk-mark" }, q.ok ? "✓" : "✗")));
      d.addEventListener("toggle", () => { if (d.open && d.children.length === 1) { const b = h("div", { class: "mk-body" }); renderQuestion(b, q, full, true); d.append(b, explain(q, full)); } }, { once: false });
      list.append(d);
    });
    m.append(h("div", { class: "col mk" },
      h("header", { class: "ch-head" }, h("div", { class: "eyebrow" }, "Mock test · results"), h("h1", {}, timeUp ? "Time's up" : "Done")),
      h("div", { class: "mk-score" },
        h("div", { class: "mk-big" }, h("b", {}, right), h("span", {}, ` / ${n}`)),
        h("div", {}, h("p", { class: "mk-pct" }, `${pct}% in ${fmtTime(done.used)}${done.pace ? ` of ${fmtTime(done.pace * n)}` : ""}`), h("p", {}, verdict))),
      h("div", { class: "mk-strip" }, done.qs.map((q, k) => h("i", { class: q.ok ? "ok" : "bad", title: `Question ${k + 1}: ${q.ok ? "right" : "missed"}` }))),
      backNote(done),
      h("h3", { class: "mk-h" }, "By chapter, weakest first"),
      h("div", { class: "mk-chs" }, rows.map(([num, s]) => {
        const ch = BANK.ch[num];
        return h("a", { class: "mk-ch", href: "#" + num }, h("span", { class: "mk-n" }, num), h("span", { class: "mk-t" }, ch.name),
          h("span", { class: "mk-bar2" }, h("i", { style: `width:${(100 * s.right) / s.n}%` })), h("b", {}, `${s.right}/${s.n}`));
      })),
      h("h3", { class: "mk-h" }, "By kind of question"),
      h("p", { class: "mk-kindline" }, Object.entries(kinds).map(([k, s]) => `${KIND_NAME[k]} ${s.right}/${s.n}`).join(" · ")),
      h("h3", { class: "mk-h" }, "Every question"),
      h("p", { class: "mk-muted" }, "Open one to see your answer and why."),
      list,
      h("div", { class: "btns" }, h("button", { class: "key primary", onclick: () => begin(setupState()) }, "Another mock like this →"), h("button", { class: "key", onclick: () => { view = null; pageSetup(); } }, "Change the settings"))));
    document.title = `${right} / ${n} · Mock test`;
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------- keys --
  addEventListener("keydown", (e) => {
    if (view !== "test" || location.hash !== "#mock") return;
    const q = run.qs[run.cur];
    const typing = e.target.tagName === "TEXTAREA";
    if (typing && e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); document.querySelector(".mk-nav .btn.primary")?.click(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[1-4]$/.test(e.key)) { const b = document.querySelectorAll(".mk-card .opt")[+e.key - 1]; if (b && !b.disabled) { b.click(); e.preventDefault(); } }
    else if (e.key === "Enter" && e.target.tagName !== "BUTTON") { document.querySelector(".mk-nav .btn.primary")?.click(); e.preventDefault(); }
    else if (e.key === "ArrowRight" && run.cur < run.qs.length - 1) go(run.cur + 1);
    else if (e.key === "ArrowLeft" && run.cur > 0) go(run.cur - 1);
    else if (e.key === "f" || e.key === "F") { q.flag = !q.flag; A.save(); drawTest(); }
  });

  window.MOCK = {
    async page(api) {
      A = api;
      if (TRACK !== (A.cfg.id || "ds")) { TRACK = A.cfg.id || "ds"; BANK = null; }
      A.sidebar("mock");
      const m = A.main();
      if (view === "test" && run) { startRun(); return; }
      m.textContent = "";
      m.append(A.h("div", { class: "col mk" }, A.h("p", { class: "mk-muted" }, "Loading the questions…")));
      try { await loadBank(); } catch (e) { m.textContent = ""; m.append(A.h("div", { class: "empty" }, A.h("p", {}, "Could not load the mock questions."), A.h("button", { class: "btn primary", onclick: () => location.reload() }, "Try again"))); return; }
      view = null;
      pageSetup();
    },
  };
})();
