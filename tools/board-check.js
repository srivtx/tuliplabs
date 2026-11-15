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
