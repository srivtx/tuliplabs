// Proves the whiteboard's questions with the same simulator the page runs (tunnel/net.js).
//   node tools/board-check.js
// For every question:
//   follow      each round's path is the path the simulator's routing takes
//   napkin      each note's answer is its calculation, and the "why" quotes it (rounded)
//   bottleneck  at the stated load, the answer part is the busiest by a wide margin and near full, and on the
//               ramp it's the first to pass 85%; the capacities the "why" quotes are workers ÷ service time
//   draw        the start compiles but misses a goal, the reference meets every goal, and every trap misses one,
//               on several seeds; every number the "why" claims comes out of the reference run
// And for the simulator: queue waits agree with M/M/c theory (Erlang C), and the same seed gives the same run.
const path = require("path");
const N = require(path.join(__dirname, "..", "tunnel", "net.js"));
const SD = require(path.join(__dirname, "..", "tunnel", "boards.js"));
const KV = require(path.join(__dirname, "..", "tunnel", "kv.js"));
const CH = require(path.join(__dirname, "..", "tunnel", "chat.js"));
const GEO = require(path.join(__dirname, "..", "tunnel", "geo.js"));
const FD = require(path.join(__dirname, "..", "tunnel", "feed.js"));
const VD = require(path.join(__dirname, "..", "tunnel", "video.js"));
const TX = require(path.join(__dirname, "..", "tunnel", "tix.js"));
const LT = require(path.join(__dirname, "..", "tunnel", "lat.js"));
const CA = require(path.join(__dirname, "..", "tunnel", "cache.js"));
const { BOARDS } = SD;

const bad = [];
let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) bad.push(msg); };
const meets = (g, s) => { const [k, op, v] = g, x = s[k]; return op === "<" ? x < v : op === "<=" ? x <= v : op === ">" ? x > v : x >= v; };
const SEEDS = [1, 2, 3, 4, 5];
const num = (x) => Math.round(x).toLocaleString("en-US");
const quotes = (text, x) => text.replace(/,/g, "").includes(String(Math.round(x)));

for (const b of BOARDS) {
  const q = { ...b.q };
  const runs = b.design && b.kind !== "sketch" && b.design.nodes.every((n) => N.KINDS[n.kind]);
  if (runs) {
    const c0 = N.compile(b.design, q);
    ok(!c0.problems.length, `${b.id}: the starting design doesn't compile: ${c0.problems.map((p) => p.text).join(" / ")}`);
  }
  for (const nd of (b.design || { nodes: [] }).nodes) ok(SD.PARTS[nd.kind], `${b.id}: part ${nd.id} is a ${nd.kind}, which the parts catalog doesn't know`);
  if (b.kind === "follow" && !runs) {
    const wired = (a, z) => b.design.wires.some(([x, y]) => (x === a && y === z) || (x === z && y === a));
    for (const r of b.rounds) ok(r.path.every((id, i) => b.design.nodes.some((n) => n.id === id) && (!i || wired(r.path[i - 1], id))), `${b.id}: "${r.say}" isn't a walk along the drawing's wires`);
  }
  if (b.kind === "follow" && runs) {
    for (const r of b.rounds) {
      const got = N.path(b.design, { hit: r.hit, count: !!q.count });
      ok(got.join() === r.path.join(), `${b.id}: "${r.say}" takes ${got.join(" → ")}, not ${r.path.join(" → ")}`);
    }
  }
  if (b.kind === "napkin") {
    for (const n of b.notes) {
      const v = Function(`return (${n.calc});`)();
      ok(isFinite(v) && v > 0, `${b.id}: note ${n.id} doesn't calculate`);
      const near = [v, Math.round(v / 10) * 10, Math.round(v / 100) * 100, Math.round(v * 10) / 10];
      ok(near.some((x) => b.why.replace(/,/g, "").includes(String(x)) || quotes(b.why, x)) || b.why.includes(String(Math.round(v))), `${b.id}: the why doesn't quote ${n.label} (${v.toFixed(2)})`);
    }
  }
  if (b.kind === "bottleneck") {
    const s = N.run(b.design, q, { rate: b.at, settle: 5, win: 20 });
    const ranked = Object.entries(s.util).sort((x, y) => y[1] - x[1]);
    ok(ranked[0][0] === b.answer, `${b.id}: at ${b.at}/s the busiest part is ${ranked[0][0]}, not ${b.answer}`);
    ok(ranked[0][1] > 0.85 && ranked[0][1] - ranked[1][1] > 0.3, `${b.id}: at ${b.at}/s ${ranked[0][0]} is ${ranked[0][1].toFixed(2)} busy, next ${ranked[1][1].toFixed(2)}: not a clear answer`);
    const first = b.ramp.map((rate) => N.run(b.design, q, { rate, settle: 5, win: 10 })).map((r) => Object.entries(r.util).find(([, u]) => u > 0.85)).find(Boolean);
    ok(first && first[0] === b.answer, `${b.id}: on the ramp the first part past 85% is ${first && first[0]}`);
    // the capacities the why quotes
    for (const nd of b.design.nodes.filter((n) => n.kind !== "users" && n.kind !== "lb")) {
      const cap = N.workersOf(nd) / N.serviceOf(nd, q);
      if (b.why.includes(nd.kind === "app" ? "app servers have" : "database has") || b.why.includes(num(cap))) ok(quotes(b.why, cap) || b.why.includes(num(cap)), `${b.id}: the why doesn't quote ${nd.kind}'s capacity, ${num(cap)}/s`);
    }
  }
  if (b.kind === "draw") {
    const rate = b.rate;
    for (const [label, d, want] of [["start", b.design, false], ["reference", b.reference, true], ...(b.traps || []).map((t) => [`trap (${t.why})`, t.design, false])]) {
      const c = N.compile(d, q);
      ok(!c.problems.length, `${b.id} ${label}: doesn't compile: ${c.problems.map((p) => p.text).join(" / ")}`);
      const wins = SEEDS.filter((seed) => { const s = N.run(d, q, { rate, seed }); return b.goals.every((g) => meets(g, s)); }).length;
      ok(want ? wins === SEEDS.length : wins === 0, `${b.id} ${label} meets every goal on ${wins} of ${SEEDS.length} seeds`);
    }
    const s = N.run(b.reference, q, { rate, seed: 1 });
    for (const [what, part, v, tol] of b.says || []) {
      const got = what === "hit" ? N.hitRate(b.reference.nodes.find((n) => n.id === part), q) : part ? s[what][part] : s[what];
      ok(Math.abs(got - v) <= tol * (what === "dbLoad" ? v : 1), `${b.id}: says ${what}${part ? " " + part : ""} ≈ ${v}, the sim gives ${got.toFixed(3)}`);
      const shown = what === "dbLoad" ? String(v) : Math.round(v * 100) + "%";
      ok(b.why.replace(/,/g, "").includes(shown), `${b.id}: the why doesn't say ${shown}`);
    }
    ok(N.costOf(b.reference) <= b.goals.find((g) => g[0] === "cost")[2], `${b.id}: the reference is over budget`);
  }
}

// ------------------------------------------------------------------------------------------- new kinds --
const pc = (x) => Math.round(x * 100);
const hasPct = (text, n) => text.includes(`${n}%`);
for (const b of BOARDS) {
  if (b.kind === "scope") {
    // every card has a column, every column has cards, and each card says why
    ok(b.cards.every((k) => ["does", "how", "not"].includes(k.bin) && k.why), `${b.id}: a card without a column or a why`);
    for (const bin of ["does", "how", "not"]) ok(b.cards.filter((k) => k.bin === bin).length >= 2, `${b.id}: the ${bin} column has fewer than 2 cards`);
  }
  if (b.kind === "sketch") {
    // the start fails, the reference passes, and the reference with any wrong part added fails
    for (const k of [...b.tray, ...b.rubric.flatMap((r) => r.link.flat())]) ok(SD.PARTS[k], `${b.id}: ${k} isn't in the parts catalog`);
    for (const r of b.rubric) ok(r.link.flat().every((k) => b.tray.includes(k) || b.design.nodes.some((n) => n.kind === k)), `${b.id}: "${r.say}" needs a part that isn't in the tray`);
    ok(!SD.grade(b.design, b.rubric, b.wrong).pass, `${b.id}: the empty start already passes`);
    const g = SD.grade(b.reference, b.rubric, b.wrong);
    ok(g.pass, `${b.id}: the reference fails: ${g.items.filter((i) => !i.ok).map((i) => i.say).join(" / ")}`);
    for (const k of Object.keys(b.wrong)) {
      const d = { nodes: [...b.reference.nodes, { id: "x", kind: k, x: 0, y: 0 }], wires: [...b.reference.wires, [b.reference.nodes[1].id, "x"]] };
      ok(!SD.grade(d, b.rubric, b.wrong).pass, `${b.id}: adding a ${k} still passes`);
      ok(b.tray.includes(k), `${b.id}: the wrong part ${k} isn't offered in the tray`);
    }
    // each rubric item matters: drop its links and the grade fails
    for (const r of b.rubric) {
      const kind = (id) => b.reference.nodes.find((n) => n.id === id).kind;
      const d = { nodes: b.reference.nodes, wires: b.reference.wires.filter(([x, y]) => !r.link.some(([p, q2]) => (kind(x) === p && kind(y) === q2) || (kind(x) === q2 && kind(y) === p))) };
      ok(!SD.grade(d, b.rubric, b.wrong).pass, `${b.id}: "${r.say}" can be missing and it still passes`);
    }
  }
  if (b.kind === "evict") {
    // each round's answer keeps the most hits after the halfway mark, by 3 points or more, on several seeds
    b.rounds.forEach((r, ri) => {
      for (const seed of [1, 2, 3]) {
        const res = Object.fromEntries(KV.POLICIES.map((p) => [p, KV.evict({ ...b.sim, seed, policy: p, shift: r.shift })]));
        const rank = KV.POLICIES.slice().sort((x, y) => res[y].late - res[x].late);
        ok(rank[0] === r.answer && res[rank[0]].late - res[rank[1]].late >= 0.03, `${b.id} round ${ri + 1} seed ${seed}: ${rank.map((p) => p + " " + pc(res[p].late)).join(", ")}`);
        if (seed === b.sim.seed) {
          for (const [rr, p, v] of b.says.filter((x) => x[0] === ri)) ok(pc(res[p].late) === v && hasPct(b.why, v), `${b.id}: says ${p} ${v}% in round ${rr + 1}, the sim gives ${pc(res[p].late)}%`);
          if (!r.shift) { const e = pc(res.noeviction.errors / b.sim.n); ok(hasPct(b.why, e), `${b.id}: the why doesn't say noeviction refused ${e}%`); }
        }
      }
    });
  }
  if (b.kind === "persist") {
    // only the answer meets both goals; the why quotes the p99s; a crash never loses more than the worst case
    const meets = (x) => x.p99 < b.goals.p99 && x.worst <= b.goals.lose;
    for (const aof of KV.MODES) for (const rdb of [true, false]) {
      const x = KV.persist({ ...b.sim, aof, rdb, seed: 1 });
      ok(meets(x) === (aof === b.answer), `${b.id}: aof ${aof}, snapshot ${rdb}: p99 ${(x.p99 * 1000).toFixed(2)} ms, worst ${x.worst} s, ${meets(x) ? "meets" : "misses"} the goals`);
      for (const seed of [1, 2, 3, 4, 5]) { const y = KV.persist({ ...b.sim, aof, rdb, seed, plug: 20 + 10 * KV.rng(seed * 7919)() }); ok(y.lostFor <= y.worst + 1e-9, `${b.id}: aof ${aof} lost ${y.lostFor.toFixed(2)} s, more than its worst case ${y.worst}`); }
    }
    const al = KV.persist({ ...b.sim, aof: "always", seed: 1 }), ev = KV.persist({ ...b.sim, aof: "everysec", seed: 1 });
    ok(b.why.includes(`${(al.p99 * 1000).toFixed(1)} ms`), `${b.id}: the why doesn't say always's p99, ${(al.p99 * 1000).toFixed(1)} ms`);
    ok(b.why.includes(`${(ev.p99 * 1000).toFixed(2)} ms`), `${b.id}: the why doesn't say everysec's p99, ${(ev.p99 * 1000).toFixed(2)} ms`);
  }
  if (b.kind === "shard") {
    // the page's path: 4 machines, then one at a time. The fewest that keep every one under 80% is b.best
    const o = b.sim, keys = [];
    for (let i = 0; i < o.keys; i++) { const name = "user:" + i; keys.push({ slot: KV.slot(name), h: KV.crc16(name), ops: o.ops, bytes: o.bytes }); }
    const cl = new KV.Cluster(4);
    const fits = () => { const L = cl.load(keys); return Math.max(...L.ops) / o.capOps <= o.under && Math.max(...L.bytes) / o.capBytes <= o.under; };
    let moved = 0;
    while (!fits()) { const m = new Set(cl.add()); moved = keys.filter((k) => m.has(k.slot)).length / keys.length; }
    ok(cl.n === b.best, `${b.id}: the fewest machines under 80% is ${cl.n}, not ${b.best}`);
    const L = cl.load(keys), busy = pc(Math.max(...L.ops) / o.capOps), full = pc(Math.max(...L.bytes) / o.capBytes), mod = pc(KV.modMoved(keys, cl.n - 1));
    for (const [what, v] of [["busiest", busy], ["fullest", full], ["moved", pc(moved)], ["hash % N", mod]]) ok(hasPct(b.why, v), `${b.id}: the why doesn't say ${what} ${v}%`);
    ok(b.why.includes(String(Math.ceil(1e6 / o.capOps))) && b.why.includes(String(b.best)), `${b.id}: the why doesn't give the machine counts`);
    // the hot key: only the answer brings the busiest machine under 100%
    const hot = (c, ops) => Math.max(...c.load([...keys, { slot: KV.slot(b.hot.key), ops, bytes: 1e6 }]).ops) / o.capOps;
    const more = new KV.Cluster(4); while (more.n < cl.n + 6) more.add();
    const after = { more: hot(more, b.hot.ops), big: hot(cl, b.hot.ops), local: hot(cl, b.hot.apps) };
    for (const f of b.fixes) ok((after[f.id] <= 1) === (f.id === b.answer), `${b.id}: "${f.say}" leaves the busiest machine ${pc(after[f.id])}% busy`);
  }
}
// ----------------------------------------------------------------------------------------- WhatsApp labs --
const nums = (text) => text.replace(/,/g, "");
for (const b of BOARDS) {
  if (b.kind === "conns") {
    // only the answer's model and heartbeat fit the goals with some fleet size, and the why quotes the fleet sizes
    const g = b.goals, fits = (m, hb) => { const n = CH.fewest(m, hb, b.sim.phones, g.under); const G = CH.gateways({ model: m, hb, boxes: n, phones: b.sim.phones }); return n <= g.boxes && G.detect <= g.detect && G.ram <= g.under && G.cpu <= g.under; };
    for (const m of CH.MODELS) for (const hb of CH.HEARTBEATS) ok(fits(m, hb) === (m === b.answer.model && hb === b.answer.hb), `${b.id}: ${m} with a heartbeat every ${hb} s ${fits(m, hb) ? "fits" : "doesn't fit"}`);
    for (const [m, hb] of [["threads", 30], ["loop", 30], ["loop", 10]]) { const n = CH.fewest(m, hb, b.sim.phones, g.under); ok(nums(b.why).includes(String(n)), `${b.id}: the why doesn't say ${m}/${hb} s needs ${n} machines`); }
    const per = (m) => Math.floor((CH.GW.ram * g.under) / CH.GW.per[m]), best = CH.gateways({ model: "loop", hb: 30, boxes: CH.fewest("loop", 30), phones: b.sim.phones });
    ok(nums(b.why).includes(String(per("threads"))) && nums(b.why).includes(String(Math.floor(best.perBox))), `${b.id}: the why doesn't quote phones per machine`);
  }
  if (b.kind === "offline") {
    // every switch setting runs the same day; only all three switches lose nothing and show nothing twice, on every seed
    for (const seed of [1, 2, 3, 4, 5]) for (const inbox of [false, true]) for (const acks of [false, true]) for (const ids of [false, true]) {
      const d = CH.day({ inbox, acks, ids, seed }), good = !d.lost && !d.twice;
      ok(good === (inbox && acks && ids), `${b.id} seed ${seed}: inbox ${inbox}, acks ${acks}, ids ${ids}: ${d.lost} lost, ${d.twice} twice`);
      ok(d.sent === CH.day({ seed }).sent, `${b.id} seed ${seed}: the switches changed the day itself`);
    }
    const f = CH.day({ seed: b.sim.seed }), i = CH.day({ inbox: true, seed: b.sim.seed }), a = CH.day({ inbox: true, acks: true, seed: b.sim.seed });
    ok(b.why.includes(`${Math.round((100 * f.lost) / f.sent)}%`), `${b.id}: the why doesn't say forgetting loses ${Math.round((100 * f.lost) / f.sent)}%`);
    ok(b.why.includes(`${i.lost} lost`) && b.why.includes(`${a.twice} shown twice`), `${b.id}: the why doesn't say ${i.lost} lost / ${a.twice} shown twice`);
  }
  if (b.kind === "order") {
    // on every seed: arrival order splits the phones, the sender's clock puts a reply above its question, the server sequence does neither
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const g = CH.group({ seed }).rules;
      ok(!g.arrival.agree, `${b.id} seed ${seed}: arrival order agrees on every phone`);
      ok(g.clock.agree && g.clock.flips > 0, `${b.id} seed ${seed}: the sender's clock never misplaces a reply`);
      ok(g.seq.agree && !g.seq.flips, `${b.id} seed ${seed}: the server sequence goes wrong`);
    }
  }
}
// a whiteboard part with a name on it (Alice, Bob) still has a kind the catalog knows
for (const b of BOARDS) for (const nd of (b.design || { nodes: [] }).nodes) if (nd.label) ok(SD.PARTS[nd.kind], `${b.id}: ${nd.label} has no part kind`);

// --------------------------------------------------------------------------------------------- Uber labs --
const says = (text, x) => text.replace(/,/g, "").includes(String(x));
// the matcher's assignment solver finds the cheapest pairing: against every permutation, on small random grids
{
  const R = GEO.rng(42);
  for (let t = 0; t < 60; t++) {
    const n = 1 + Math.floor(R() * 4), m = n + Math.floor(R() * 3), cost = Array.from({ length: n }, () => Array.from({ length: m }, () => Math.round(R() * 100)));
    let best = Infinity;
    const walk = (i, used, sum) => { if (i === n) { best = Math.min(best, sum); return; } for (let j = 0; j < m; j++) if (!used.has(j)) { used.add(j); walk(i + 1, used, sum + cost[i][j]); used.delete(j); } };
    walk(0, new Set(), 0);
    const a = GEO.assign(cost), got = a.reduce((x, j, i) => x + cost[i][j], 0);
    ok(new Set(a).size === n && a.every((j) => j >= 0) && got === best, `assign(): grid ${t} costs ${got}, the best is ${best}`);
  }
}
for (const b of BOARDS) {
  if (b.kind === "nearby") {
    // only the answer's cell size and search meet both goals; widening is right at every size; her own cell never is
    const g = b.goals, C = GEO.city({ seed: b.sim.seed }), at = {};
    for (const cell of GEO.CELLS) for (const search of cell ? GEO.SEARCH : ["scan"]) {
      const r = (at[cell + search] = GEO.nearby({ cell, search, C })), pass = r.right === r.n && r.work <= g.work;
      ok(pass === (cell === b.answer.cell && search === b.answer.search), `${b.id}: ${cell} km cells, ${search}: ${r.right}/${r.n} right, ${Math.round(r.work)} work, ${pass ? "passes" : "fails"}`);
      if (search === "widen" || search === "scan") ok(r.right === r.n, `${b.id}: ${search} with ${cell} km cells got ${r.right}/${r.n}`);
      if (search === "cell") ok(r.right < r.n, `${b.id}: her own ${cell} km cell found everyone's true 5`);
    }
    for (const seed of [2, 3, 4]) for (const cell of [1, 0.25]) ok(GEO.nearby({ cell, search: "widen", seed }).right === 40, `${b.id} seed ${seed}: widening ${cell} km cells missed someone`);
    for (const [k, w] of [["0scan", 3000], ["4ring", Math.round(at["4ring"].work / 100) * 100], ["0.25widen", Math.round(at["0.25widen"].work)], ["0.1widen", Math.round(at["0.1widen"].work)]]) ok(says(b.why, w), `${b.id}: the why doesn't say ${k} costs ${w}`);
  }
  if (b.kind === "batch") {
    // only the answer's window meets the goal; batching beats matching at once on every seed
    const runs = Object.fromEntries(GEO.WINDOWS.map((w) => [w, GEO.match({ window: w, seed: b.sim.seed })])), m1 = (x) => (x / 60).toFixed(1);
    for (const w of GEO.WINDOWS) ok((runs[w].wait / 60 <= b.goals.wait) === (w === b.answer), `${b.id}: a ${w} s window takes ${m1(runs[w].wait)} min`);
    for (const w of GEO.WINDOWS) ok(runs[w].n === runs[w].asked, `${b.id}: a ${w} s window left riders unmatched`);
    for (const seed of [2, 3, 4]) ok(GEO.match({ window: b.answer, seed }).wait < GEO.match({ window: 0, seed }).wait, `${b.id} seed ${seed}: batching didn't beat matching at once`);
    const A = runs[b.answer], L = runs[120];
    for (const x of [m1(runs[0].wait), m1(A.pick), Math.round(A.toMatch), m1(A.wait), m1(runs[30].wait), m1(L.pick), Math.round(L.toMatch), m1(L.wait)]) ok(says(b.why, x), `${b.id}: the why doesn't say ${x}`);
  }
  if (b.kind === "dispatch") {
    // on every seed only the answer meets all four goals, and the choices never change the evening itself
    for (const seed of [1, 2, 3, 4, 5]) {
      const base = GEO.evening({ seed }).rides.map((o) => o.t.toFixed(3)).join();
      for (const claim of GEO.CLAIMS) for (const expiry of GEO.EXPIRY) {
        const v = GEO.evening({ claim, expiry, seed }), pass = !v.doubled && !v.stuck && !v.late && v.worst <= b.goals.worst;
        ok(pass === (claim === b.answer.claim && expiry === b.answer.expiry), `${b.id} seed ${seed}: ${claim}, ${expiry} s: ${v.doubled} doubled, ${v.stuck} stuck, ${v.late} late, worst ${Math.round(v.worst)} s`);
        ok(v.rides.map((o) => o.t.toFixed(3)).join() === base, `${b.id} seed ${seed}: ${claim}/${expiry} changed the requests`);
      }
    }
    const chk = GEO.evening({ claim: "check", expiry: 15, seed: b.sim.seed }), good = GEO.evening({ ...b.answer, seed: b.sim.seed });
    ok(says(b.why, `${chk.doubled} drivers got two riders`), `${b.id}: the why doesn't say ${chk.doubled} drivers got two riders`);
    ok(says(b.why, `worst wait is ${Math.round(good.worst)} s`), `${b.id}: the why doesn't say the worst wait is ${Math.round(good.worst)} s`);
  }
}

// ------------------------------------------------------------------------------------------ Twitter labs --
for (const b of BOARDS) {
  if (b.kind === "fanout") {
    // on the page's seed only the answer's lines pass; on every seed, all-on-write and all-on-read fail and a million passes
    const g = b.goals, pass = (r) => r.lagP99 <= g.lag && r.readP99 <= g.read, at = {};
    for (const T of FD.THRESHOLDS) { const r = (at[T] = FD.fanout({ T, seed: b.sim.seed })); ok(pass(r) === b.answer.includes(T), `${b.id}: the line at ${T}: ${r.lagP99.toFixed(1)} s, ${Math.round(r.readP99)} ms`); }
    for (const seed of [2, 3, 4, 5]) {
      ok(!pass(FD.fanout({ T: Infinity, seed })) && !pass(FD.fanout({ T: 0, seed })), `${b.id} seed ${seed}: all on write or all on read passed`);
      ok(pass(FD.fanout({ T: 1e6, seed })), `${b.id} seed ${seed}: the line at a million failed`);
    }
    const m = at[1e6];
    for (const x of [Math.round(at[Infinity].lagP99) + " s", Math.round(at[0].readP99) + " ms", `only ${m.onRead} of`, `${Math.round(FD.share(1e6) * 100)}% of all follows`, `merges ${FD.pct(m.merged, 0.5)} of them`, `${Math.round(m.readP99)} ms`, `${Math.round(at[1e5].readP99)} ms`])
      ok(says(b.why, x), `${b.id}: the why doesn't say "${x}"`);
  }
  if (b.kind === "likes") {
    const g = b.goals, pass = (r) => r.likeMs <= g.like && r.readMs <= g.read && !r.lostOnCrash, at = {};
    for (const batch of FD.BATCH) for (const shards of FD.SHARDS) { const r = (at[batch + ":" + shards] = FD.likes({ shards, batch })); ok(pass(r) === (shards === b.answer.shards && batch === b.answer.batch), `${b.id}: ${shards} rows, batch ${batch}: ${r.likeMs.toFixed(1)} ms, read ${r.readMs} ms, ${r.lostOnCrash} lost`); }
    const one = at["0:1"], ans = at["0:64"];
    for (const x of [`grows to ${Math.round(one.backlog / 1e6)} million`, `saved in ${ans.likeMs.toFixed(1)} ms`, `${ans.readMs} ms`, `${at["0:256"].readMs} ms`, `about ${at["1:1"].lostOnCrash} for every second`]) ok(says(b.why, x), `${b.id}: the why doesn't say "${x}"`);
  }
  if (b.kind === "tlcache") {
    const g = b.goals, C = (who, keep) => FD.cache({ who, keep });
    for (const who of FD.WHO) for (const keep of FD.KEEP) { const r = C(who, keep), pass = r.tb <= g.tb && r.slow <= g.slow; ok(pass === (who === b.answer.who && keep === b.answer.keep), `${b.id}: ${who}, ${keep} ids: ${r.tb.toFixed(1)} TB, ${(r.slow * 100).toFixed(1)}% slow`); }
    ok(Math.abs(FD.GROUPS.reduce((a, x) => a + x.users, 0) - 500e6) < 1 && Math.abs(FD.GROUPS.reduce((a, x) => a + x.opens, 0) - 1) < 1e-9, `${b.id}: the groups don't add up to 500M accounts and every open`);
    const tb = (who, keep) => C(who, keep).tb.toFixed(1), pc = (x) => +(x * 100).toFixed(1) + "%";
    for (const x of [`${tb("dormant", 800)} TB`, `${tb("day", 800)} TB`, `${pc(C("day", 800).slow)} are slow`, `${tb("week", 800)} TB`, `${pc(C("week", 800).slow)} of opens are slow`, `${FD.DEEP[400] * 100}% of opens scroll past 400`, `${Math.round(C("week", 3200).tb)} TB`])
      ok(says(b.why, x), `${b.id}: the why doesn't say "${x}"`);
  }
}

// ------------------------------------------------------------------------------------------ YouTube labs --
for (const b of BOARDS) {
  if (b.kind === "transcode") {
    // on the page's seed only the answer passes; on four more seeds the answer still passes and its rivals still fail
    const g = b.goals, pass = (r) => r.watchable <= g.watch && r.overhead <= g.waste, at = {};
    for (const order of VD.ORDERS) for (const seg of VD.SEGS) { const r = (at[order + seg] = VD.transcode({ seg, order, seed: b.sim.seed })); ok(pass(r) === (seg === b.answer.seg && order === b.answer.order), `${b.id}: ${seg} s pieces, ${order}: watchable ${r.watchable.toFixed(1)} s, ${(r.overhead * 100).toFixed(1)}% start-up`); }
    for (const seed of [2, 3, 4, 5]) {
      ok(pass(VD.transcode({ seg: 10, order: "low", seed })), `${b.id} seed ${seed}: the answer failed`);
      ok(!pass(VD.transcode({ seg: 60, order: "low", seed })) && !pass(VD.transcode({ seg: 10, order: "piece", seed })) && !pass(VD.transcode({ seg: 2, order: "low", seed })), `${b.id} seed ${seed}: a rival passed`);
    }
    // the work adds up: every task's encode plus its start-up
    const a = at.low10;
    ok(Math.abs(VD.RENDS.reduce((x, r) => x + r.cost, 0) * 3600 - a.ideal) < 1e-6 && a.tasks.length === 360 * 4, `${b.id}: the 10-second pieces don't make 1,440 tasks`);
    ok(a.tasks.every((t) => t.end - t.start > 0) && new Set(a.tasks.map((t) => t.w)).size === 200, `${b.id}: the 200 workers weren't all used`);
    const m = (o, sg) => at[o + sg];
    for (const x of [`${Math.round(m("piece", 3600).watchable / 60)} min`, `${Math.round(m("piece", 600).watchable / 60)} min`, `${c(a.tasks.length)} tasks`, `${Math.round(m("piece", 10).watchable)} s`, `after ${Math.round(a.watchable)} s`,
      `${(a.overhead * 100).toFixed(1)}%`, `after ${(a.all / 60).toFixed(1)} min`, `${Math.round(m("low", 60).watchable)} s`, `${(m("low", 2).overhead * 100).toFixed(1)}%`, `${Math.round(m("piece", 3600).ready[3] / 3600)} hours`])
      ok(says(b.why, x), `${b.id}: the why doesn't say "${x}"`);
  }
  if (b.kind === "abr") {
    const g = b.goals, pass = (r) => r.stallShare <= g.stall && r.avg >= g.avg && r.wasted <= g.waste, isAns = (rule, ahead) => b.answer.some((x) => x.rule === rule && x.ahead === ahead), at = {};
    for (const rule of VD.RULES) for (const ahead of VD.AHEAD) { const r = (at[rule + ahead] = VD.abr({ rule, ahead, seed: b.sim.seed })); ok(pass(r) === isAns(rule, ahead), `${b.id}: ${rule}, ${ahead} s ahead: stalled ${(r.stallShare * 100).toFixed(2)}%, ${r.avg.toFixed(2)} Mb/s, ${r.wasted.toFixed(1)} MB`); }
    for (const seed of [2, 3, 4, 5]) for (const rule of VD.RULES) for (const ahead of VD.AHEAD) ok(pass(VD.abr({ rule, ahead, seed })) === isAns(rule, ahead), `${b.id} seed ${seed}: ${rule}, ${ahead} s ahead came out differently`);
    // the player never plays what it hasn't fetched, and every second watched is accounted for
    for (const k in at) { const r = at[k]; ok(r.trace.every((p) => p[1] >= -1e-9) && Math.abs(r.trace[r.trace.length - 1][2] - 480) < 1e-6, `${b.id}: ${k}'s buffer went negative or the playhead missed 8 minutes`); }
    for (const x of [`${Math.round(at.top30.stallShare * 100)}% of the time`, `${at.low30.avg.toFixed(1)} on average`, `${(at.rate10.stallShare * 100).toFixed(1)}% of the time`, `averages ${at.rate30.avg.toFixed(2)}`, `averages ${at.buffer30.avg.toFixed(2)}`,
      `${Math.round(at.buffer30.wasted)} MB thrown away`, `${Math.round(Math.min(at.rate120.wasted, at.buffer120.wasted))} MB or more`])
      ok(says(b.why, x), `${b.id}: the why doesn't say "${x}"`);
  }
  if (b.kind === "premiere") {
    const g = b.goals, pass = (r) => r.originPeak <= g.peak && r.waitP99 <= g.wait, at = {};
    for (const collapse of [false, true]) for (const shield of [false, true]) { const r = (at[+collapse + "" + +shield] = VD.premiere({ collapse, shield, seed: b.sim.seed })); ok(pass(r) === (collapse === b.answer.collapse && shield === b.answer.shield), `${b.id}: collapse ${collapse}, shield ${shield}: peak ${Math.round(r.originPeak)}/s, p99 ${r.waitP99.toFixed(2)} s`); }
    for (const seed of [2, 3]) ok(pass(VD.premiere({ collapse: true, shield: true, seed })) && !pass(VD.premiere({ collapse: true, shield: false, seed })), `${b.id} seed ${seed}: the answer and its rival came out differently`);
    const A = at["11"], E = at["10"], N0 = at["00"], S = at["01"];
    ok(Math.abs(A.hist.reduce((a, x) => a + x, 0) - 1) < 1e-6 && Math.abs(N0.hist.reduce((a, x) => a + x, 0) - 1) < 1e-6, `${b.id}: the waits don't add up to every viewer`);
    ok(E.originTotal === VD.EDGES * E.pieces && A.originTotal === VD.REGIONS * A.pieces, `${b.id}: collapsing doesn't send one request per edge (or per region) for each piece`);
    for (const x of [`${(N0.originPeak / 1e6).toFixed(1)} million times`, `${(N0.failed * 100).toFixed(1)}% of requests`, `${Math.round(S.failed * 100)}% give up`, `${VD.EDGES} at once`, `${E.waitP99.toFixed(2)} s`, `hears ${VD.REGIONS} requests`, `within ${A.waitP99.toFixed(2)} s`])
      ok(says(b.why, x), `${b.id}: the why doesn't say "${x}"`);
  }
}
function c(n) { return n.toLocaleString("en-US").replace(/,/g, ""); }

// ------------------------------------------------------------------------------------- Ticketmaster labs --
const pct1 = (x) => (x * 100).toFixed(1) + "%";
for (const b of BOARDS) {
  if (b.kind === "onsale") {
    // on the page's seed only the answer passes; on four more seeds the answer still passes and its rivals still fail
    const g = b.goals, pass = (r) => r.errors <= g.errors && r.soldOut != null && r.soldOut <= g.sold && r.botShare <= g.bots, at = {};
    for (const door of TX.DOORS) for (const line of TX.LINES) { const r = (at[door + line] = TX.onsale({ door, line, seed: b.sim.seed })); ok(pass(r) === (door === b.answer.door && line === b.answer.line), `${b.id}: ${door}, ${line}: ${r.errors} errors, sold out ${r.soldOut} s, bots ${pct1(r.botShare)}`); }
    for (const seed of [2, 3, 4, 5]) {
      ok(pass(TX.onsale({ ...b.answer, seed })), `${b.id} seed ${seed}: the answer failed`);
      ok(!pass(TX.onsale({ door: "swap", line: "came", seed })) && !pass(TX.onsale({ door: 3, line: "shuffle", seed })) && !pass(TX.onsale({ door: 50, line: "shuffle", seed })), `${b.id} seed ${seed}: a rival passed`);
    }
    // the door never lets more than the servers hold inside, and every seat is sold, two at a time
    const A = at.swapshuffle;
    ok(A.series.every((p) => p[1] <= A.cap) && A.sold === TX.SEATS && A.errors === 0, `${b.id}: one-in-one-out let too many in, or didn't sell every seat`);
    ok(A.order.length === 400 && at.swapcame.order.every((x) => x === 1), `${b.id}: in arrival order the front of the line isn't all bots`);
    const mn = (t) => (t / 60).toFixed(1) + " min";
    for (const x of [`${c(at.allshuffle.errors).replace(/(\d)(?=(\d{3})+$)/g, "$1,")} error pages`, `${c(at.allshuffle.gaveUp).replace(/(\d)(?=(\d{3})+$)/g, "$1,")} fans give up`, `then ${c(at["50shuffle"].errors).replace(/(\d)(?=(\d{3})+$)/g, "$1,")} error pages`,
      `after ${mn(at["3shuffle"].soldOut)}`, `after ${mn(A.soldOut)}`, `get ${pct1(at.swapcame.botShare)} of the seats`, `bots get ${pct1(A.botShare)}`])
      ok(b.why.includes(x), `${b.id}: the why doesn't say "${x}"`);
  }
  if (b.kind === "hold") {
    const g = b.goals, at19 = (r) => (r.series.find((p) => p[1] >= 19000) || [null])[0], pass = (r) => { const t = at19(r); return r.errors <= g.errors && r.kickShare <= g.kick && t != null && t <= g.by; }, at = {};
    for (const keep of TX.KEEPS) for (const mins of TX.MINS) { const r = (at[keep + mins] = TX.hold({ keep, mins, seed: b.sim.seed })); ok(pass(r) === (keep === b.answer.keep && mins === b.answer.mins), `${b.id}: ${keep}, ${mins} min: ${r.errors} errors, ${pct1(r.kickShare)} kicked, 19k at ${at19(r)} s`); }
    for (const seed of [2, 3, 4, 5]) {
      ok(pass(TX.hold({ ...b.answer, seed })), `${b.id} seed ${seed}: the answer failed`);
      ok(!pass(TX.hold({ keep: "hold", mins: 5, seed })) && !pass(TX.hold({ keep: "hold", mins: 30, seed })) && !pass(TX.hold({ keep: "lock", mins: 10, seed })), `${b.id} seed ${seed}: a rival passed`);
    }
    // a lock never has more open than the database's connections, and seats are never oversold
    for (const k in at) { const r = at[k]; ok(r.peakOpen <= r.conns && r.series.every((p) => p[1] + p[2] + p[3] <= TX.SEATS), `${b.id}: ${k} oversold or overran its connections`); }
    const A = at.hold10, pc2 = (x) => (x * 100).toFixed(2) + "%", mn = (t) => (t / 60).toFixed(1) + " min", fmt = (n) => Math.round(n).toLocaleString("en-US");
    const s60 = (r) => (r.series.filter((p) => p[0] <= 3600).pop() || [0, 0])[1];
    for (const x of [`${fmt(at.lock10.errors)} error pages`, `${pct1(at.hold2.kickShare)} of buyers`, `from ${pct1(at.hold5.kickShare)}`, `from only ${pc2(A.kickShare)}`, `sold after ${mn(at19(A))}`, `pile up to ${fmt(at.hold30.peakIdle)}`, `only ${fmt(s60(at.hold30))} are sold`])
      ok(b.why.includes(x), `${b.id}: the why doesn't say "${x}"`);
  }
  if (b.kind === "seatmap") {
    const g = b.goals, pass = (r) => r.readsPerSec <= g.reads && r.clashShare <= g.clash, at = {};
    for (const map of TX.MAPS) for (const pick of TX.PICKS) { const r = (at[map + pick] = TX.seatmap({ map, pick, seed: b.sim.seed })); ok(pass(r) === (map === b.answer.map && pick === b.answer.pick), `${b.id}: ${map}, ${pick}: ${r.readsPerSec.toFixed(1)} reads/s, ${pct1(r.clashShare)} clash`); }
    for (const seed of [2, 3, 4, 5]) {
      ok(pass(TX.seatmap({ ...b.answer, seed })), `${b.id} seed ${seed}: the answer failed`);
      ok(!pass(TX.seatmap({ map: 1, pick: "click", seed })) && !pass(TX.seatmap({ map: 30, pick: "best", seed })) && !pass(TX.seatmap({ map: "live", pick: "best", seed })), `${b.id} seed ${seed}: a rival passed`);
    }
    // no block ever goes below zero seats, and a copy made every second clashes exactly as often as the live map
    for (const k in at) { const r = at[k], free = r.start.slice(); let okk = true; for (const [, bl] of r.takes) if ((free[bl] -= 2) < 0) okk = false; ok(okk && r.got === r.takes.length, `${b.id}: ${k} sold seats that weren't there`); }
    ok(at["1best"].clashes === at.livebest.clashes && at["1click"].clashes === at.liveclick.clashes, `${b.id}: a one-second copy doesn't behave like the live map`);
    for (const x of [`${Math.round(at.liveclick.readsPerSec)} reads a second`, `${Math.round(at.livebest.readsPerSec)} while they pick`, `${pct1(at.liveclick.clashShare)} of tries clash`, `${pct1(at["30click"].clashShare)} clash`, `only ${pct1(at["1best"].clashShare)}`, `${pct1(at["30best"].clashShare)} pick sections`])
      ok(b.why.includes(x), `${b.id}: the why doesn't say "${x}"`);
  }
}

// ---------------------------------------------------------------------------------- Latency numbers --
for (const b of BOARDS) {
  if (b.kind === "ladder") {
    // every card is a number on the ruler, the numbers climb as the ladder says, and the why's human times are worked out
    ok(b.cards.every((id) => LT.N[id] >= 1 && LT.N[id] <= 1e9), `${b.id}: a card is off the 1 ns to 1 s ruler`);
    const order = ["l1", "mutex", "ram", "switch", "ssd", "dc", "seek", "ocean", "notice"];
    ok(order.every((id, i) => !i || LT.N[order[i - 1]] < LT.N[id]), `${b.id}: the numbers aren't in ladder order`);
    for (const id of ["ram", "ssd", "dc", "seek", "ocean"]) ok(b.why.includes(LT.human(LT.N[id])), `${b.id}: the why doesn't say ${id} is ${LT.human(LT.N[id])}`);
    ok(LT.human(1) === "1 second" && LT.human(100) === "1.7 minutes" && LT.human(80e6) === "2.5 years", `${b.id}: human time is off`);
  }
  if (b.kind === "race") {
    // the winner each race's why argues for is the one the numbers make, and no race is a photo finish
    const said = ["a", "b", "a", "b", "b"];
    LT.RACES.forEach((r, i) => {
      ok(r.win === said[i], `race ${i + 1}: ${r.win} wins, but the why argues for ${said[i]}`);
      ok(Math.max(r.a.ns, r.b.ns) / Math.min(r.a.ns, r.b.ns) >= 1.2, `race ${i + 1}: a photo finish (${LT.fmt(r.a.ns)} vs ${LT.fmt(r.b.ns)})`);
    });
    ok(LT.fmt(LT.RACES[3].a.ns) === "100 ms" && LT.fmt(LT.RACES[0].b.ns) === "20 ms", `${b.id}: the N+1 race or the disk race moved`);
  }
  if (b.kind === "waterfall") {
    // on the page's seed exactly the answers pass, on four more seeds too; every page's steps add up to its time
    const g = b.goals, pass = (r) => r.p50 <= g.p50 && r.p99 <= g.p99, isAns = (o) => b.answers.some((a) => a.queries === o.queries && a.pay === o.pay && a.photo === o.photo), at = {};
    for (const queries of LT.QUERIES) for (const pay of LT.PAYS) for (const photo of LT.PHOTOS) {
      const o = { queries, pay, photo }, r = (at[`${queries}:${pay}:${photo}`] = LT.page({ ...o, seed: b.sim.seed }));
      ok(pass(r) === isAns(o), `${b.id}: ${queries}, ${pay}, ${photo}: p50 ${r.p50.toFixed(1)} ms, p99 ${r.p99.toFixed(1)} ms`);
      ok(Math.abs(r.typical.steps.reduce((a, x) => a + x.d, 0) - r.typical.t) < 1e-9, `${b.id}: ${queries}, ${pay}, ${photo}: the steps don't add up to the page`);
      for (const seed of [2, 3, 4, 5]) ok(pass(LT.page({ ...o, seed })) === isAns(o), `${b.id} seed ${seed}: ${queries}, ${pay}, ${photo} came out differently`);
    }
    ok(!pass(at["serial:new:disk"]), `${b.id}: the start passes`);
    // one round trip in a thousand loses a packet: about 3% of pages with 32 round trips lose one
    ok(Math.abs(at["serial:cache:ssd"].lostShare - (1 - Math.pow(1 - LT.LOSS, 32))) < 0.012, `${b.id}: 32 round trips lost a packet on ${(at["serial:cache:ssd"].lostShare * 100).toFixed(1)}% of pages`);
    const A = at["one:cache:ssd"], P = at["parallel:cache:ssd"], S0 = at["serial:new:disk"], O = at["serial:open:disk"];
    for (const x of [`half the pages took ${Math.round(S0.p50)} ms`, `slowest 1% took ${Math.round(S0.p99)} ms`, `middle page to ${Math.round(O.p50)} ms`, `${Math.round(P.p50)} ms in the middle`,
      `${(P.lostShare * 100).toFixed(1)}% of pages`, `slowest 1% take ${Math.round(P.p99)} ms`, `half the pages in ${A.p50.toFixed(1)} ms`, `99% in ${A.p99.toFixed(1)} ms`])
      ok(b.why.includes(x), `${b.id}: the why doesn't say "${x}"`);
  }
  if (b.kind === "globe") {
    // the start misses; the answer meets it; nothing with two or more round trips meets it, even with every datacenter;
    // and every way that meets it is one round trip from three datacenters
    const g = b.goals, pass = (r) => r.worst.ms <= g.ms && r.sites <= g.sites;
    ok(!pass(LT.globe(b.start)), `${b.id}: the start passes`);
    const A = LT.globe(b.answer);
    ok(pass(A), `${b.id}: the answer misses: ${A.worst.id} ${A.worst.ms.toFixed(1)} ms`);
    const ids = LT.SITES.map((x) => x.id), wins = [];
    for (let m = 1; m < 1 << ids.length; m++) {
      const sites = ids.filter((_, i) => (m >> i) & 1);
      for (const trips of LT.TRIPS) { const r = LT.globe({ sites, trips }); if (pass(r)) wins.push({ sites, trips }); }
    }
    ok(wins.length >= 3 && wins.every((w) => w.trips === 1 && w.sites.length === 3), `${b.id}: ${wins.length} ways pass, not all one round trip from three datacenters`);
    const all2 = LT.globe({ sites: ids, trips: 2 });
    ok(all2.worst.ms > g.ms, `${b.id}: two round trips can pass with every datacenter`);
    // the speed of light: New York to London is about the ladder's Atlantic round trip
    const ny = LT.CITIES.find((x) => x.id === "ny"), ld = LT.CITIES.find((x) => x.id === "ld"), atl = LT.rtt(LT.km(ny, ld));
    ok(Math.abs(atl - LT.N.ocean / 1e6) < 8, `${b.id}: New York to London is ${atl.toFixed(1)} ms there and back, not about ${LT.N.ocean / 1e6}`);
    const st = LT.globe(b.start), v1 = LT.globe({ sites: ["va"], trips: 1 });
    const sy = (r) => r.cities.find((x) => x.id === "sy"), fmtN = (n) => Math.round(n).toLocaleString("en-US");
    for (const x of [`Sydney waits ${fmtN(sy(st).ms)} ms`, `still takes ${Math.round(sy(v1).ms)} ms`, `${fmtN(Math.round(sy(v1).km / 100) * 100)} km away`,
      `Johannesburg waits ${Math.round(all2.worst.ms)} ms`, `within ${Math.round(A.worst.ms)} ms`])
      ok(b.why.includes(x), `${b.id}: the why doesn't say "${x}"`);
    ok(all2.worst.id === "jb" && A.worst.id === "sp" && A.worst.site === "va" && A.cities.find((x) => x.id === "jb").site === "in", `${b.id}: Johannesburg isn't the hard city, São Paulo isn't the answer's farthest, or Johannesburg isn't served from Mumbai`);
  }
}

// ------------------------------------------------------------------------------------------- Caching --
const pct = (x, d = 0) => (x * 100).toFixed(d) + "%";
for (const b of BOARDS) {
  if (b.kind === "tail") {
    // the Zipf curve: H(n) matches a plain sum, the curve climbs, and the why's shares and sizes are worked out
    let sum = 0; for (let k = 1; k <= 5000; k++) sum += 1 / k;
    ok(Math.abs(CA.H(5000) - sum) < 1e-6, `${b.id}: H(5000) is ${CA.H(5000)}, the sum is ${sum}`);
    ok(CA.hit(0.001) < CA.hit(0.01) && CA.hit(0.01) < CA.hit(0.1) && Math.abs(CA.hit(1) - 1) < 1e-12, `${b.id}: the curve doesn't climb to 100%`);
    for (const r of b.rounds) ok(r.ask === "hit" ? r.at > 0 && r.at < 1 : CA.size(r.at) > 0 && CA.size(r.at) < 1, `${b.id}: a round asks for something off the curve`);
    ok(Math.abs(CA.hit(CA.size(0.9)) - 0.9) < 1e-4, `${b.id}: size() isn't hit() backwards`);
    const gb = (share) => (share * CA.PRODUCTS * CA.ITEM_KB) / 1e6;
    for (const x of [`${pct(0.01)} of products, ${Math.round(gb(0.01) * 1000)} MB, answers ${pct(CA.hit(0.01))}`, `takes the top ${pct(CA.size(0.9))}, ${gb(CA.size(0.9)).toFixed(1)} GB`,
      `takes ${pct(CA.size(0.99))} of the whole catalog, ${gb(CA.size(0.99)).toFixed(1)} GB`])
      ok(b.why.includes(x), `${b.id}: the why doesn't say "${x}"`);
  }
  if (b.kind === "inval") {
    // every interleaving of 3 + 2 + 2 steps, from a cold cache and a warm one; the answer is the order with the fewest
    // stale endings, and it still has some (the race the why describes)
    const I = CA.inval(), ids2 = Object.keys(CA.ORDERS);
    ok(ids2.every((k) => I[k].total === 2 * 210), `${b.id}: not every interleaving was tried`);
    const best = ids2.reduce((a, k) => (I[k].stale < I[a].stale ? k : a), ids2[0]);
    ok(best === b.answer, `${b.id}: ${best} has the fewest stale endings, not ${b.answer}`);
    ok(I[b.answer].stale > 0, `${b.id}: the answer never goes stale, but the why says it can`);
    const ex = I[b.answer].example.log.map((x) => x.who + x.k).join(" ");
    ok(/Rget.* Rread( \w+)* [AB]db( \w+)* [AB]del( \w+)* Rfill/.test(ex), `${b.id}: the answer's race isn't miss, read, a write and its delete, then fill: ${ex}`);
    for (const k of ["setdb", "dbset", "deldb", "dbdel"]) ok(b.why.includes(`${I[k].stale}`), `${b.id}: the why doesn't say ${k} goes stale ${I[k].stale} times`);
    ok(b.why.includes(`${I.setdb.stale} of the ${I.setdb.total} ways`), `${b.id}: the why's total is off`);
    ok(I.deldb.stale === Math.max(...ids2.map((k) => I[k].stale)), `${b.id}: delete-first isn't the worst`);
  }
  if (b.kind === "stampede") {
    // on the page's seed and four more, exactly the answers pass; the why's numbers are seed 1's
    const g = b.goals, pass = (r) => r.errors <= g.errors && r.queuePeak <= g.wait, isAns = (o) => b.answers.some((a) => a.guard === o.guard && a.ttl === o.ttl), at = {};
    for (const guard of CA.GUARDS) for (const ttl of CA.TTLS) {
      const o = { guard, ttl };
      for (const seed of SEEDS) {
        const r = CA.stampede({ ...o, seed });
        if (seed === b.sim.seed) at[`${guard}:${ttl}`] = r;
        ok(pass(r) === isAns(o), `${b.id} seed ${seed}: ${guard}, ${ttl}: ${r.errors} errors, ${r.queuePeak} waiting`);
      }
    }
    const top = CA.ST.rate / CA.H(CA.ST.keys), A = at["lock:jitter"];
    ok(b.lede.includes(num(top)) && b.why.includes(num(top)), `${b.id}: the top product's reads a second (${num(top)}) aren't quoted`);
    for (const k of ["none:same", "none:jitter", "lock:same", "early:same"]) ok(b.why.includes(`${num(at[k].errors)} error pages`) || b.why.includes(`${num(at[k].errors)} get error pages`), `${b.id}: the why doesn't quote ${k}'s ${num(at[k].errors)} error pages`);
    ok(b.why.includes(`${num(A.dbq)} queries in ${CA.ST.T} s`) && A.dbq === 2 * CA.ST.keys, `${b.id}: the answer made ${A.dbq} queries, not two a key`);
    // the herd: with no guard, the queries match the misses one for one
    ok(at["none:same"].dbq === at["none:same"].slow, `${b.id}: with no guard, a miss didn't make exactly one query`);
  }
  if (b.kind === "fresh") {
    // the closed form against a plain simulation of one product's cache, then exactly the answers pass
    {
      const r = 3, mu = 1 / 50, T = 30, own = 0.5, c = CA.cell(r, mu, T, own);
      let rnd = 9; const u = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
      const ex = (rate) => -Math.log(1 - u()) / rate;
      let t = 0, misses = 0, reads = 0, stale = 0, loaded = -1, ver = 0, mine = 0, nextR = ex(r), nextE = ex(mu);
      const END = 2e5;
      while (t < END) {
        if (nextR < nextE) {
          t = nextR; nextR = t + ex(r); reads++;
          if (loaded < 0 || t - loaded >= T) { misses++; loaded = t; mine = ver; } else if (mine !== ver) stale++;
        } else { t = nextE; nextE = t + ex(mu); ver++; if (u() < own) loaded = -1; }
      }
      ok(Math.abs(misses / END - c.misses) < 0.02 * c.misses, `fresh: one cache misses ${(misses / END).toFixed(4)}/s, the formula says ${c.misses.toFixed(4)}`);
      ok(Math.abs(stale / END - c.stale) < 0.03 * c.stale, `fresh: one cache serves ${(stale / END).toFixed(4)} stale/s, the formula says ${c.stale.toFixed(4)}`);
    }
    const g = b.goals, pass = (r) => r.db <= g.db && r.stale <= g.stale, isAns = (o) => b.answers.some((a) => a.where === o.where && a.ttl === o.ttl && a.edit === o.edit), at = {};
    for (const where of CA.WHERES) for (const ttl of CA.FTTLS) for (const edit of CA.EDITS) {
      const o = { where, ttl, edit }, r = (at[`${where}:${ttl}:${edit}`] = CA.fresh(o));
      ok(pass(r) === isAns(o), `${b.id}: ${where}, ${ttl} s, ${edit}: ${r.db.toFixed(0)} reads a second, ${(r.stale * 100).toFixed(2)}% stale`);
    }
    const L = at["local:600:delete"], sh = (t, e) => at[`shared:${t}:${e}`];
    for (const x of [`still ${num(L.db)} reads a second`, `so ${pct(L.stale, 1)} of reads`, `kept 10 s, ${num(sh(10, "none").db)} reads a second and ${pct(sh(10, "none").stale, 2)} stale`,
      `60 s, ${num(sh(60, "none").db)} and ${pct(sh(60, "none").stale, 2)} stale`, `10 minutes, ${num(sh(600, "none").db)} and ${pct(sh(600, "none").stale, 1)} stale`,
      `60 s is ${num(sh(60, "delete").db)} reads a second, 10 minutes is ${num(sh(600, "delete").db)}`])
      ok(b.why.includes(x), `${b.id}: the why doesn't say "${x}"`);
    ok(["10", "60", "600"].every((t) => sh(t, "delete").stale === 0), `${b.id}: a shared delete still serves stale reads`);
  }
}

const ids = BOARDS.map((b) => b.id), ladder = SD.LADDER.map((u) => u.id);
ok(new Set(ids).size === ids.length, "two questions share an id");
ok(new Set(ladder).size === ladder.length, "two units on the ladder share an id");
ok(SD.OLD.every((id) => ids.includes(id)), "an old #1…#6 link points nowhere");

// the simulator against theory: one app station, waits from Little's law vs Erlang C
for (const rate of [300, 450, 500]) {
  const d = { nodes: [{ id: "u", kind: "users" }, { id: "a", kind: "app", n: 1 }, { id: "d", kind: "db", size: "large" }], wires: [["u", "a"], ["a", "d"]] };
  const ws = SEEDS.map((seed) => { const r = N.run(d, { svc: { db: 0.0001 } }, { rate, seed, settle: 20, win: 300 }); return r.queue.a / r.tput.a; });
  const sim = ws.reduce((a, x) => a + x, 0) / ws.length, th = N.erlangC(8, rate, 1 / 0.015).wq;
  ok(Math.abs(sim - th) <= 0.08 * th + 0.0002, `Erlang C at ${rate}/s: sim waits ${(sim * 1000).toFixed(2)} ms, theory ${(th * 1000).toFixed(2)} ms`);
}
{
  const b = BOARDS.find((x) => x.kind === "draw");
  const a = N.run(b.reference, b.q, { rate: b.rate, seed: 7 }), c = N.run(b.reference, b.q, { rate: b.rate, seed: 7 });
  ok(a.p99 === c.p99 && a.n === c.n, "the same seed gave two different runs");
}

console.log(`${checks} checks`);
if (bad.length) { console.log(bad.map((x) => "  ✗ " + x).join("\n")); console.log(`${bad.length} PROBLEM(S)`); process.exit(1); }
console.log("ALL GOOD");
