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
const { BOARDS } = require(path.join(__dirname, "..", "tunnel", "boards.js"));

const bad = [];
let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) bad.push(msg); };
const meets = (g, s) => { const [k, op, v] = g, x = s[k]; return op === "<" ? x < v : op === "<=" ? x <= v : op === ">" ? x > v : x >= v; };
const SEEDS = [1, 2, 3, 4, 5];
const num = (x) => Math.round(x).toLocaleString("en-US");
const quotes = (text, x) => text.replace(/,/g, "").includes(String(Math.round(x)));

for (const b of BOARDS) {
  const q = { ...b.q };
  const c0 = N.compile(b.design, q);
  ok(!c0.problems.length, `${b.id}: the starting design doesn't compile: ${c0.problems.map((p) => p.text).join(" / ")}`);
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
