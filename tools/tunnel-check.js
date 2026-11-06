// Proves the Wind Tunnel's experiments with the same simulator the page runs.
//   node tools/tunnel-check.js
// For every live experiment:
//   * the task's starting server misses the goal and the reference answer meets it, both at steady state
//     and in the page's own 30-second measuring window, for several seeds;
//   * every number the text quotes comes out of the sim (within its tolerance);
//   * the predict answer is what the sim says (capacity, or Little's law).
// And for the simulator itself: mean queue waits agree with M/M/c theory (Erlang C) within 3%.
const path = require("path");
const { Sim, erlangC } = require(path.join(__dirname, "..", "tunnel", "sim.js"));
const { experiments } = require(path.join(__dirname, "..", "tunnel", "experiments.js"));

const bad = [];
let checks = 0;
const ms = (x) => (x * 1000).toFixed(0) + " ms";
// one goal row, the same rule the page uses
function meets(row, stats, cfg) {
  const [k, op, v] = row;
  const x = k in stats ? stats[k] : cfg[k];
  return op === "<" ? x < v : op === "<=" ? x <= v : op === "==" ? x === v : op === ">" ? x > v : x >= v;
}
const WINDOW = 30, SETTLE = 20; // the page measures the last 30 s once the server has been left alone that long
function liveWindow(cfg, seed) {
  const s = new Sim(cfg, seed);
  s.advance(SETTLE + WINDOW);
  return s.stats(SETTLE, SETTLE + WINDOW);
}

for (const x of experiments.filter((e) => e.live)) {
  const base = { ...x.system, ...x.task.set };
  for (const [label, patch, want] of [["start", x.task.start, false], ["reference", x.task.reference, true]]) {
    const cfg = { ...base, ...patch };
    const steady = Sim.measure(cfg, { span: 600 });
    const ok = x.task.goal.every((g) => meets(g, steady, cfg));
    checks++;
    if (ok !== want) bad.push(`${x.id} ${label} ${want ? "misses" : "already meets"} the goal at steady state (p99 ${ms(steady.p99)}, errors ${steady.errors})`);
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const wins = seeds.filter((seed) => { const w = liveWindow(cfg, seed); return x.task.goal.every((g) => meets(g, w, cfg)); }).length;
    checks++;
    if (want && wins < seeds.length) bad.push(`${x.id} reference meets the goal in only ${wins} of ${seeds.length} live windows`);
    if (!want && wins > 0) bad.push(`${x.id} start meets the goal in ${wins} of ${seeds.length} live windows`);
  }
  for (const q of x.quotes) {
    const cfg = { ...x.system, ...q.cfg };
    const got = Sim.measure(cfg, { span: 600 })[q.metric];
    let ok = true;
    if (q.value !== undefined) ok = Math.abs(got - q.value) <= q.tol * Math.abs(q.value);
    if (q.min !== undefined) ok = ok && got >= q.min;
    if (q.max !== undefined) ok = ok && got <= q.max;
    checks++;
    if (!ok) bad.push(`${x.id} quote ${JSON.stringify(q.cfg)} ${q.metric}: sim says ${got.toFixed(3)}, text says ${q.value ?? (q.min !== undefined ? "≥ " + q.min : "≤ " + q.max)}`);
  }
  // the predict answer: an open server's capacity is workers ÷ service; a closed one carries capacity × (think + service) people
  const s = x.system, cap = s.workers / s.service;
  const expect = s.mode === "open" ? cap : cap * (s.think + s.service);
  checks++;
  if (Math.abs(expect - x.predict.answer) > 1) bad.push(`${x.id} predict answer ${x.predict.answer}, theory says ${expect.toFixed(1)}`);
  // and the sim agrees that's where it bends: just past it, throughput stops growing
  const knob = x.crowd.knob, over = Sim.measure({ ...s, [knob]: x.predict.answer * 1.25, timeout: 0 }, { span: 600 });
  checks++;
  if (Math.abs(over.tput - cap) / cap > 0.03) bad.push(`${x.id} past the answer the sim serves ${over.tput.toFixed(1)}/s, not capacity ${cap}`);
}

// Erlang C: mean wait in the queue of an M/M/c server, over five seeds
for (const [rate, c, mu] of [[40, 4, 20], [60, 4, 20], [70, 4, 20], [100, 8, 20], [15, 1, 20]]) {
  const theory = erlangC(rate, mu, c).wait;
  let sum = 0;
  for (const seed of [1, 2, 3, 4, 5]) sum += Sim.measure({ mode: "open", rate, workers: c, service: 1 / mu, timeout: 0 }, { seed, warm: 100, span: 4000 }).mean - 1 / mu;
  const sim = sum / 5;
  checks++;
  // absolute slack for tiny waits, where 3% is under a millisecond
  if (Math.abs(sim - theory) > Math.max(0.03 * theory, 0.0015)) bad.push(`Erlang C λ=${rate} c=${c}: sim waits ${ms(sim)}, theory ${ms(theory)}`);
}

// the same seed gives the same run
const a = Sim.measure(experiments[0].system, { seed: 3 }), b = Sim.measure(experiments[0].system, { seed: 3 });
checks++;
if (JSON.stringify(a) !== JSON.stringify(b)) bad.push("the sim isn't deterministic for a fixed seed");

console.log(`wind tunnel: ${checks} checks, ${bad.length ? bad.length + " failed" : "ALL GOOD"}`);
bad.forEach((m) => console.log("  FAIL " + m));
process.exit(bad.length ? 1 : 0);
