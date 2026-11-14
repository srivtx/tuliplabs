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
  if (b.kind === "follow") {
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
