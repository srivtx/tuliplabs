/* Probability & Stats, chapter 2: rules of probability and conditional probability.
   400 people, each a voxel, coloured by two yes/no attributes A and B. "Given B" lifts the B people
   out of the crowd: conditional probability is just counting inside that smaller, lifted world.
   Second mode: the Monty Hall game, played once by hand or hundreds of times. */
VIZ.register("ps-venn", async (api) => {
  const W = await api.world3d();
  const N = 400, COLS = 20, SP = 1.15;

  // exact counts, so the fractions in the chapter come out clean
  const SCEN = {
    bread: { A: "buys bread", B: "buys butter", nB: 120, AB: 96, AnB: 84 },
    weekend: { A: "shops at the weekend", B: "buys butter", nB: 120, AB: 34, AnB: 80 },
    dog: { A: "owns a dog", B: "walks 1h+ a day", nB: 100, AB: 60, AnB: 60 },
  };
  function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const shuffled = (k, seed) => { const r = rng(seed), a = [...Array(k).keys()]; for (let i = k - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // a second copy of this sim in a chapter (viz id: monty) starts in Monty Hall mode with that goal
  let mode = String(api.key || "").endsWith("-monty") ? "monty" : "people";
  const goalKind = mode;
  let scen = "weekend", cond = "all", people = [], done = false;
  const f3 = (x) => x.toFixed(3);

  function makePeople() {
    const S = SCEN[scen], order = shuffled(N, 7);
    people = new Array(N);
    order.forEach((slot, r) => {
      // ranks 0..AB-1 are A&B, then B only, then A only, then neither
      const a = r < S.AB || (r >= S.nB && r < S.nB + S.AnB);
      const b = r < S.nB;
      people[slot] = { a, b };
    });
  }
  const inCond = (p) => cond === "all" || (cond === "B" && p.b) || (cond === "A" && p.a) || (cond === "notB" && !p.b);
  const colorOf = (p) => (p.a && p.b ? "c4" : p.a ? "c1" : p.b ? "c2" : "c5");

  function drawPeople() {
    const S = SCEN[scen];
    const cnt = { A: 0, B: 0, AB: 0, C: 0, AC: 0, BC: 0 };
    people.forEach((p, i) => {
      const x = (i % COLS - (COLS - 1) / 2) * SP, z = (Math.floor(i / COLS) - (COLS - 1) / 2) * SP;
      const lift = cond !== "all" && inCond(p);
      const what = p.a && p.b ? `both: ${S.A} <b>and</b> ${S.B}` : p.a ? `${S.A}, but not ${S.B}` : p.b ? `${S.B}, but not ${S.A}` : `neither`;
      W.box("p" + i, { x, y: lift ? 1.6 : 0, z, s: 0.85, sy: 1.1, color: colorOf(p), opacity: cond !== "all" && !lift ? 0.18 : 1,
        info: { title: `Person ${i + 1}`, html: `<p>This person is <b>${what}</b>.</p><p>${cond === "all" ? "Right now we count everyone: the world has 400 people." : lift ? "They match the condition, so they're lifted into the new, smaller world. Conditional probability only counts the lifted people." : "They don't match the condition, so they drop out of the count completely. That's what \"given\" means."}</p>` } });
      cnt.A += p.a; cnt.B += p.b; cnt.AB += p.a && p.b;
      if (inCond(p)) { cnt.C++; cnt.AC += p.a; cnt.BC += p.b; }
    });
    const pA = cnt.A / N, pB = cnt.B / N, pAB = cnt.AB / N;
    const label = { all: "everyone", B: `B (${S.B})`, A: `A (${S.A})`, notB: `not B` }[cond];
    let s = `A = ${S.A}    B = ${S.B}\n`;
    s += `P(A) = ${cnt.A}/400 = ${f3(pA)}    P(B) = ${cnt.B}/400 = ${f3(pB)}\n`;
    s += `P(A and B) = ${cnt.AB}/400 = ${f3(pAB)}    P(A)·P(B) = ${f3(pA * pB)}\n`;
    if (cond !== "all") {
      const tgt = cond === "A" ? "B" : "A", hits = cond === "A" ? cnt.BC : cnt.AC;
      s += `\nZoomed into ${label}: ${cnt.C} people\nP(${tgt} | ${cond === "notB" ? "not B" : cond}) = ${hits}/${cnt.C} = ${f3(hits / cnt.C)}   vs   P(${tgt}) = ${f3(tgt === "A" ? pA : pB)}`;
    }
    const indep = Math.abs(pAB - pA * pB) < 0.01;
    s += `\n\n${indep ? "≈ INDEPENDENT: knowing one tells you (almost) nothing about the other" : "NOT independent: P(A and B) ≠ P(A)·P(B)"}`;
    api.status(s);
    api.hud(`<b style="color:var(--c4)">■</b> A and B  <b style="color:var(--c1)">■</b> only A  <b style="color:var(--c2)">■</b> only B  <b style="color:var(--c5)">■</b> neither`);
    if (!done && goalKind === "people" && cond !== "all") {
      const tgtP = cond === "A" ? pB : pA, hitP = cond === "A" ? cnt.BC / cnt.C : cnt.AC / cnt.C;
      if (Math.abs(hitP - tgtP) > 0.1) {
        done = true;
        api.explain("Not independent!", `<p>Inside the lifted world the fraction is <b>${f3(hitP)}</b>, but in the whole crowd it's <b>${f3(tgtP)}</b>. Learning the condition changed the probability, so these two events are <b>dependent</b>.</p><p>Compare with "shops at the weekend": zooming in there barely changes anything. That's independence.</p>`);
        api.done("You found two events that are not independent");
      }
    }
  }

  // ---------------------------------------------------------------- Monty Hall
  let car = 0, pick = -1, opened = -1, phase = "pick";
  const tally = { stay: [0, 0], switch: [0, 0] }; // [wins, games]
  function drawMonty(reveal) {
    for (let d = 0; d < 3; d++) {
      const isOpen = d === opened || reveal;
      W.box("door" + d, { x: (d - 1) * 3.2, y: 1.6, z: isOpen ? -1.2 : 0, sx: 2.2, sy: 3.2, sz: 0.3, color: d === pick ? "c4" : "c2", opacity: isOpen ? 0.25 : 1,
        label: `door ${d + 1}`, labelSize: 0.45, info: { title: `Door ${d + 1}`, html: `<p>${d === pick ? "Your pick. When you picked it, you had a <b>1 in 3</b> chance. Nothing the host does can change the past: it still has 1/3." : "Not your pick. The two doors you didn't pick hold the car <b>2 times in 3</b> together."}</p><p>The host <b>always</b> opens a goat door you didn't pick. If the car is behind one of the other two, he's forced to leave it closed, so switching collects that whole 2/3.</p>` } });
      W.box("prize" + d, { x: (d - 1) * 3.2, y: 0.6, z: -0.6, s: 1, color: d === car ? "c3" : "c5", visible: isOpen, label: d === car ? "car" : "goat", labelSize: 0.4,
        info: { title: d === car ? "The car" : "A goat", html: "<p>The prize was placed at random before you chose: each door had 1/3.</p>" } });
    }
    const bar = (k, x, label) => {
      const [w, g] = tally[k], rate = g ? w / g : 0, nv = Math.round(rate * 20);
      for (let j = 0; j < 20; j++) {
        if (j < nv) W.box(`t${k}${j}`, { x, y: j * 0.32, z: -5, sx: 1.4, sy: 0.28, sz: 1, color: k === "switch" ? "c3" : "c1", fromY: 8, info: { title: `Always ${k}`, html: `<p>${w} wins in ${g} games = ${(100 * rate).toFixed(1)}%. Each block is 5%.</p><p>Theory: staying wins 1/3, switching wins 2/3.</p>` } });
        else W.remove(`t${k}${j}`);
      }
      W.box(`gh${k}`, { x, y: (k === "switch" ? 2 / 3 : 1 / 3) * 20 * 0.32 / 2 - 0.15, z: -5.8, sx: 1.6, sy: (k === "switch" ? 2 / 3 : 1 / 3) * 20 * 0.32, sz: 0.2, color: "c5", opacity: 0.3,
        info: { title: "Theory", html: `<p>The long-run win rate: ${k === "switch" ? "2/3" : "1/3"}.</p>` } });
      W.label("tl" + k, `${label}\n${g ? (100 * rate).toFixed(0) + "% of " + g : "no games"}`, [x, -0.9, -5], { size: 0.38 });
    };
    bar("stay", -2, "stay"); bar("switch", 2, "switch");
    const st = tally.stay, sw = tally.switch;
    api.status(`${phase === "pick" ? "Pick a door." : phase === "choose" ? `You picked door ${pick + 1}. The host opened door ${opened + 1}: a goat. Stay or switch?` : "Game over. Pick a door to play again."}\n\nalways stay:   ${st[0]}/${st[1]} wins${st[1] ? " = " + (st[0] / st[1]).toFixed(3) : ""}\nalways switch: ${sw[0]}/${sw[1]} wins${sw[1] ? " = " + (sw[0] / sw[1]).toFixed(3) : ""}`);
    if (!done && goalKind === "monty" && sw[1] >= 100 && sw[0] / sw[1] > 0.6) {
      done = true;
      api.explain("Switching wins about 2/3", `<p>Over ${sw[1]} games switching won ${(100 * sw[0] / sw[1]).toFixed(1)}%. Your first pick is right 1/3 of the time; the other 2/3 of the time the host's forced choice points straight at the car.</p>`);
      api.done("You beat Monty Hall by switching");
    }
  }
  function newGame() { car = Math.floor(Math.random() * 3); pick = -1; opened = -1; phase = "pick"; }
  function hostOpens() { const c = [0, 1, 2].filter((d) => d !== pick && d !== car); opened = c[Math.floor(Math.random() * c.length)]; }
  function choosePick(d) { if (phase !== "pick") newGame(); pick = d; hostOpens(); phase = "choose"; drawMonty(false); }
  function finish(sw) {
    if (phase !== "choose") return;
    if (sw) pick = [0, 1, 2].find((d) => d !== pick && d !== opened);
    const k = sw ? "switch" : "stay";
    tally[k][1]++; if (pick === car) tally[k][0]++;
    phase = "over"; drawMonty(true);
    api.explain(pick === car ? "You won the car" : "A goat", `<p>You ${sw ? "switched" : "stayed"} and ${pick === car ? "won" : "lost"}. One game proves nothing: play 100 and compare the rates.</p>`);
  }
  function many(k, sw) {
    for (let i = 0; i < k; i++) { newGame(); pick = Math.floor(Math.random() * 3); hostOpens(); phase = "choose"; const s = sw ? "switch" : "stay"; if (sw) pick = [0, 1, 2].find((d) => d !== pick && d !== opened); tally[s][1]++; if (pick === car) tally[s][0]++; }
    phase = "over"; drawMonty(true);
  }

  function show() {
    W.clear();
    pplCtl.forEach((e) => (e.style.display = mode === "people" ? "" : "none"));
    mhCtl.forEach((e) => (e.style.display = mode === "monty" ? "" : "none"));
    if (mode === "people") {
      makePeople(); drawPeople();
      W.camera({ target: [0, 0, 0], dist: 30, theta: 0.3, phi: 0.85 });
    } else {
      api.hud("<b>Monty Hall</b> · pick a door, the host opens a goat, then stay or switch");
      newGame(); drawMonty(false);
      W.camera({ target: [0, 1.5, -2], dist: 17, theta: 0.35, phi: 1.2 });
    }
  }

  api.seg([{ label: "400 people", value: "people" }, { label: "Monty Hall", value: "monty" }], mode, (v) => { mode = v; show(); });
  const pplCtl = [], mhCtl = [];
  const s1 = api.seg([{ label: "Weekend & butter", value: "weekend" }, { label: "Bread & butter", value: "bread" }, { label: "Dog & walking", value: "dog" }], scen, (v) => { scen = v; makePeople(); drawPeople(); });
  const s2 = api.seg([{ label: "Everyone", value: "all" }, { label: "Given B", value: "B" }, { label: "Given A", value: "A" }, { label: "Given not B", value: "notB" }], cond, (v) => { cond = v; drawPeople(); });
  pplCtl.push(s1.el.parentNode, s2.el.parentNode);
  const r = api.row();
  for (let d = 0; d < 3; d++) api.button(`Pick ${d + 1}`, () => choosePick(d), { row: r });
  api.button("Stay", () => finish(false), { row: r, primary: true });
  api.button("Switch", () => finish(true), { row: r, primary: true });
  const r2 = api.row();
  api.button("Play 100 (always stay)", () => many(100, false), { row: r2 });
  api.button("Play 100 (always switch)", () => many(100, true), { row: r2 });
  mhCtl.push(r, r2);
  api.explain("How to read this", "<p>Each block is one person. Colour shows two yes/no facts about them, A and B.</p><p>Press <b>Given B</b>: the B people lift up and everyone else fades out. Now <b>P(A | B)</b> is just: of the lifted people, what fraction are A?</p><p>Try each scenario. In which one does zooming in <i>change</i> the answer?</p>");
  show();
});
