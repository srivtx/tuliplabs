/* The Copies and lag unit's simulators. No DOM, so the page and tools/board-check.js run the same code.

   story(id, fix, tr)    three things that go wrong when reads go to followers that are a little behind:
                           mine   Ana posts a comment, reloads, and it's gone;
                           back   Ben sees a comment, reloads, and it's gone again;
                           order  Eve sees an answer before its question.
                         `fix` is "none" or one of FIXES; `tr` is one trial: each follower's lag, which follower
                         each read happens to go to, and which follower a sticky reader is stuck to.
   anomalies()           how often each story goes wrong under each fix, over 20,000 random trials.
   quorum(w, r)          a leaderless store with 5 copies: a write waits for w of them, a read asks all 5 and takes
                         the newest of the first r answers. 10,000 writes, each read straight back; how many reads
                         miss the write, how long each waits, and whether it still works with 2 copies down.
   failover(o)           a leader and two followers, one in the same building and one in another region, 2,000
                         writes a second. The leader's machine dies at 30 s, twice: once on a calm day, once while the
                         near follower's disk has stalled. `mode`: answer the writer at once (async), after one
                         follower has it (semi), or after both (sync); `promote`: which follower takes over. Counts the
                         writes the writer was told were saved that the new leader doesn't have.
   ryw(o)                a social site: 6,000 posts a second, 300,000 reads a second, one leader and n followers; one
                         follower runs a nightly report and falls up to 5 minutes behind. Each person who posts looks
                         again 1 s, 10 s, 30 s, 1, 2 and 5 minutes later. `route` decides where those reads go. */
(function (root) {
  "use strict";
  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const expo = (r, m) => -Math.log(1 - r()) * m;
  const quant = (xs, q) => { const s = Float64Array.from(xs).sort(); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

  // ------------------------------------------------------------------------------------------ what goes wrong --
  const STORIES = ["mine", "back", "order"], FIXES = ["leader", "sticky", "thread"];
  const MATCH = { mine: "leader", back: "sticky", order: "thread" };
  // when things happen, in seconds: a write lands on its leader, then on each follower `lag` seconds later
  const ST = { mine: { w: 0, r: 0.5 }, back: { w: 0, r: [0.6, 0.9] }, order: { q: 0, a: 0.3, r: 0.8 } };
  const LAG = { min: 0.05, mean: 0.5 };
  // the worked examples the page draws, one per story
  const EX = {
    mine: { f: [0.9, 0.7], g: [0, 0], pick: [0, 1], stick: 0 },
    back: { f: [0.3, 1.2], g: [0, 0], pick: [0, 1], stick: 0 },
    order: { f: [1.0, 0.6], g: [0.2, 0.4], pick: [0, 0], stick: 0 },
  };
  // a read: which copy (lane 0 is the leader, 1 and 2 the followers; in "order", lanes 0–1 are the questions' leader and
  // follower, 2–3 the answers'), and what it saw. Followers have everything written at least `lag` seconds ago.
  function story(id, fix, tr) {
    const has = (lag, at, w) => at - w >= lag, out = { writes: [], reads: [], bad: false };
    if (id === "mine") {
      const w = ST.mine.w, r = ST.mine.r, f = fix === "leader" ? -1 : fix === "sticky" ? tr.stick : tr.pick[0];
      out.writes.push({ who: "Ana", t: w, lane: 0 });
      const sees = f < 0 || has(tr.f[f], r, w);
      out.reads.push({ who: "Ana", t: r, lane: f + 1, sees });
      out.bad = !sees;
    } else if (id === "back") {
      const w = ST.back.w, [r1, r2] = ST.back.r, f1 = fix === "sticky" ? tr.stick : tr.pick[0], f2 = fix === "sticky" ? tr.stick : tr.pick[1];
      out.writes.push({ who: "Ana", t: w, lane: 0 });
      const s1 = has(tr.f[f1], r1, w), s2 = has(tr.f[f2], r2, w);
      out.reads.push({ who: "Ben", t: r1, lane: f1 + 1, sees: s1 }, { who: "Ben", t: r2, lane: f2 + 1, sees: s2 });
      out.bad = s1 && !s2;
    } else {
      // the question is in partition Q; the answer in partition A, or in Q too when a thread is kept together
      const { q, a, r } = ST.order, together = fix === "thread", fq = fix === "sticky" ? tr.stick : tr.pick[0], fa = together ? fq : fix === "sticky" ? tr.stick : tr.pick[1];
      out.writes.push({ who: "Cleo", t: q, lane: 0 }, { who: "Dev", t: a, lane: together ? 0 : 2 });
      const lq = tr.f[fq], la = together ? lq : tr.g[fa], sq = has(lq, r, q), sa = has(la, r, a);
      out.reads.push({ who: "Eve", t: r, lane: 1, sees: sq, what: "question" }, { who: "Eve", t: r, lane: together ? 1 : 3, sees: sa, what: "answer" });
      out.lags = { q: lq, a: la };
      out.bad = sa && !sq;
    }
    return out;
  }
  function trial(r) {
    const L = () => LAG.min + expo(r, LAG.mean - LAG.min);
    return { f: [L(), L()], g: [L(), L()], pick: [r() < 0.5 ? 0 : 1, r() < 0.5 ? 0 : 1], stick: r() < 0.5 ? 0 : 1 };
  }
  let AN = null;
  function anomalies(n = 20000, seed = 1) {
    if (AN && AN.n === n && AN.seed === seed) return AN;
    const r = rng(seed), out = { n, seed };
    for (const s of STORIES) { out[s] = { none: 0 }; for (const f of FIXES) out[s][f] = 0; }
    for (let i = 0; i < n; i++) {
      const tr = trial(r);
      for (const s of STORIES) for (const f of ["none", ...FIXES]) if (story(s, f, tr).bad) out[s][f]++;
    }
    for (const s of STORIES) for (const f of ["none", ...FIXES]) out[s][f] /= n;
    return (AN = out);
  }

  // --------------------------------------------------------------------------------------------- the quorum --
  // Five copies. Each message takes 0.5 ms plus a random wait (1 ms on average), and 3 in 100 hit a hiccup of 20 ms more.
  const QN = 5, QD = { base: 0.5, jit: 1, slow: 0.03, extra: 20 }, QT = 10000;
  const qmsg = (r) => QD.base + expo(r, QD.jit) + (r() < QD.slow ? QD.extra : 0);
  // one write then a read straight after it: when each copy got the write, when the read reached it, when it answered
  function qtrial(r) {
    const wIn = [], wBack = [], rIn = [], rBack = [];
    for (let i = 0; i < QN; i++) { wIn.push(qmsg(r)); wBack.push(qmsg(r)); rIn.push(qmsg(r)); rBack.push(qmsg(r)); }
    return { wIn, wBack, rIn, rBack };
  }
  // the k-th smallest, and which copies those were
  const firstK = (xs, k, ok = () => true) => xs.map((x, i) => [x, i]).filter(([, i]) => ok(i)).sort((a, b) => a[0] - b[0]).slice(0, k);
  function qplay(T, w, r, down = []) {
    const up = (i) => !down.includes(i);
    const acks = firstK(T.wIn.map((x, i) => x + T.wBack[i]), w, up);
    if (acks.length < w) return { wOk: false };
    const done = acks[w - 1][0];
    const reached = T.rIn.map((x) => done + x), back = reached.map((x, i) => x + T.rBack[i]);
    const ans = firstK(back, r, up);
    if (ans.length < r) return { wOk: true, rOk: false, done, acks: acks.map((a) => a[1]) };
    // a copy has the write if it arrived before the read did; dead copies never get it
    const has = T.wIn.map((x, i) => up(i) && x <= reached[i]);
    const fresh = ans.some(([, i]) => has[i]);
    return { wOk: true, rOk: true, done, rdone: ans[r - 1][0] - done, acks: acks.map((a) => a[1]), ans: ans.map((a) => a[1]), has, fresh, reached, back };
  }
  const QM = {};
  function quorum(w, r, seed = 1) {
    const id = `${w}:${r}:${seed}`;
    if (QM[id]) return QM[id];
    const R = rng(seed), wl = [], rl = [];
    let stale = 0, ex = -1, T0 = null;
    const trials = [];
    for (let k = 0; k < QT; k++) {
      const T = qtrial(R), p = qplay(T, w, r);
      trials.push(T);
      wl.push(p.done); rl.push(p.rdone);
      if (!p.fresh) { stale++; if (ex < 0) ex = k; }
    }
    if (ex < 0) ex = 0;
    T0 = trials[ex];
    // two copies down: the two that answer fastest, so it's the worst two to lose
    const down = [0, 1], d = qplay(trials[0], w, r, down);
    const out = { w, r, stale, wP50: quant(wl, 0.5), wP99: quant(wl, 0.99), rP50: quant(rl, 0.5), rP99: quant(rl, 0.99), wDown: d.wOk, rDown: d.wOk && d.rOk, ex: T0, exPlay: qplay(T0, w, r), down };
    return (QM[id] = out);
  }

  // ------------------------------------------------------------------------------------------- the leader dies --
  const FO = { rate: 2000, die: 30, stall: 28, commit: 0.5, near: 0.3, nearJ: 0.1, far: 35, farJ: 2 };
  const MODES = ["async", "semi", "sync"], PROMOTE = ["near", "ahead", "far"];
  function foRun(o, stalled, seed) {
    const r = rng(seed), n = FO.rate * FO.die, ms = (x) => x / 1000;
    const t = new Float64Array(n), ack = new Float64Array(n), aN = new Float64Array(n), aF = new Float64Array(n);
    let lastN = 0, lastF = 0;
    for (let k = 0; k < n; k++) {
      const t0 = k / FO.rate, c = t0 + ms(FO.commit + expo(r, 0.1));
      // each follower applies the log in order: a write can't land before the one before it
      let inN = c + ms(FO.near + expo(r, FO.nearJ)), inF = c + ms(FO.far + expo(r, FO.farJ));
      if (stalled && inN >= FO.stall) inN = Infinity;
      lastN = Math.max(lastN, inN); lastF = Math.max(lastF, inF);
      aN[k] = lastN; aF[k] = lastF;
      const bN = aN[k] + ms(FO.near + expo(r, FO.nearJ)), bF = aF[k] + ms(FO.far + expo(r, FO.farJ));
      t[k] = t0;
      ack[k] = o.mode === "async" ? c : o.mode === "semi" ? Math.min(bN, bF) : Math.max(bN, bF);
    }
    // at the moment it dies: what each follower has, and who takes over
    let hasN = 0, hasF = 0;
    while (hasN < n && aN[hasN] <= FO.die) hasN++;
    while (hasF < n && aF[hasF] <= FO.die) hasF++;
    const who = o.promote === "near" ? "near" : o.promote === "far" ? "far" : hasN >= hasF ? "near" : "far", has = who === "near" ? hasN : hasF;
    let acked = 0, lost = 0, hung = 0;
    const lat = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      if (ack[k] <= FO.die) { acked++; lat[k] = (ack[k] - t[k]) * 1000; if (k >= has) lost++; }
      else { hung++; lat[k] = (FO.die - t[k]) * 1000; }
    }
    return { t, ack, aN, aF, hasN, hasF, who, has, acked, lost, hung, lat, n };
  }
  const FM = {};
  function failover(o, seed = 1) {
    const id = `${o.mode}:${o.promote}:${seed}`;
    if (FM[id]) return FM[id];
    const calm = foRun(o, false, seed), stall = foRun(o, true, seed + 1), all = new Float64Array(calm.n + stall.n);
    all.set(calm.lat); all.set(stall.lat, calm.n);
    return (FM[id] = { calm, stall, lost: calm.lost + stall.lost, hung: calm.hung + stall.hung, p50: quant(all, 0.5), p99: quant(all, 0.99) });
  }

  // ------------------------------------------------------------------------------------- read your own writes --
  const RW = { T: 1800, bin: 5, posts: 6000, reads: 300000, fcap: 60000, lcap: 20000, looks: [1, 10, 30, 60, 120, 300], base: 0.2,
    rep: { from: 300, to: 1200, peak: 300, back: 1650 } };
  const ROUTES = ["any", "leader60", "caught"], NS = [4, 6, 8];
  // how far behind follower 1 is at time t: it falls behind while the report runs, then catches up
  function repLag(t) {
    const { from, to, peak, back } = RW.rep;
    const L = t <= from ? 0 : t <= to ? (peak * (t - from)) / (to - from) : t <= back ? (peak * (back - t)) / (back - to) : 0;
    return RW.base + L;
  }
  const lagOf = (f, t) => (f === 0 ? repLag(t) : RW.base);
  const RM = {};
  function ryw(o) {
    const id = `${o.route}:${o.n}`;
    if (RM[id]) return RM[id];
    const n = o.n, bins = [];
    let vanished = 0, leaderPeak = 0, followerPeak = 0;
    for (let t0 = 0; t0 < RW.T; t0 += RW.bin) {
      // the people who post in this stretch: the chance at least one of their looks is missing the post
      let ok = 1, toLeader = 0;
      const toF = new Array(n).fill(0);
      for (const a of RW.looks) {
        const at = t0 + a, missing = []; // the followers that don't have it yet when they look
        for (let f = 0; f < n; f++) if (lagOf(f, at) > a) missing.push(f);
        if (o.route === "leader60" && a < 60) { toLeader += 1; continue; }
        if (o.route === "caught") {
          const good = n - missing.length;
          if (!good) toLeader += 1;
          else for (let f = 0; f < n; f++) if (!missing.includes(f)) toF[f] += 1 / good;
          continue;
        }
        ok *= 1 - missing.length / n;
        for (let f = 0; f < n; f++) toF[f] += 1 / n;
      }
      const lost = RW.posts * RW.bin * (1 - ok);
      vanished += lost;
      // reads a second on each machine: everyone else's reads spread evenly, plus the people who just posted
      const own = RW.posts * RW.looks.length, rest = RW.reads - own;
      const lead = RW.posts * toLeader, fol = toF.map((x) => rest / n + RW.posts * x);
      leaderPeak = Math.max(leaderPeak, lead); followerPeak = Math.max(followerPeak, ...fol);
      bins.push({ t: t0, lost, lead, fol, lag: repLag(t0) });
    }
    return (RM[id] = { route: o.route, n, vanished: Math.round(vanished), leader: leaderPeak / RW.lcap, follower: followerPeak / RW.fcap, leaderReads: leaderPeak, followerReads: followerPeak, bins });
  }

  const API = { rng, STORIES, FIXES, MATCH, ST, LAG, EX, story, anomalies, QN, QD, QT, quorum, qplay, FO, MODES, PROMOTE, failover, RW, ROUTES, NS, repLag, lagOf, ryw };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.COPY = API;
})(typeof self !== "undefined" ? self : this);
