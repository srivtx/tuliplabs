// Proves the Wind Tunnel's experiments with the same simulator the page runs.
//   node tools/tunnel-check.js
// For every live experiment:
//   * the task's starting system misses the goal and the reference answer meets it, both at steady state
//     and in the page's own 30-second measuring window, for several seeds;
//   * every number the text quotes comes out of the sim (within its tolerance), including Zipf shares and
//     changes made mid-run;
//   * the predict answer is what theory says (capacity, Little's law, round robin's slowest server, or the cache
//     size where misses meet the database's capacity), and the sim bends there.
// And for the simulator itself: queue waits agree with M/M/c theory (Erlang C), for one server and for random
// routing over several; an LRU cache never beats the ideal one; the same seed gives the same run.
// And for each experiment's "Take it home" (tunnel/home.js): every Python file runs (or parses) for the reference
// answer and for other designs, prints exactly what its "# →" lines say, and any number it shares with the sim agrees.
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");
const { Sim, erlangC, zipfShare, rng } = require(path.join(__dirname, "..", "tunnel", "sim.js"));
const { experiments } = require(path.join(__dirname, "..", "tunnel", "experiments.js"));
const HOME = require(path.join(__dirname, "..", "tunnel", "home.js"));
const { DEFAULTS } = require(path.join(__dirname, "..", "tunnel", "sim.js"));

const bad = [];
let checks = 0;
const ms = (x) => (x * 1000).toFixed(0) + " ms";
const DEF = { servers: 1, cache: 0, lb: "rr", slow: 1 };
// one goal row, the same rule the page uses
function meets(row, stats, cfg) {
  const [k, op, v] = row;
  const x = k in stats ? stats[k] : { ...DEF, ...cfg }[k];
  return op === "<" ? x < v : op === "<=" ? x <= v : op === "==" ? x === v : op === ">" ? x > v : x >= v;
}
const WINDOW = 30, SETTLE = 20; // the page measures the last 30 s once the system has been left alone that long
function liveWindow(cfg, seed, settle = SETTLE, win = WINDOW) {
  const s = new Sim(cfg, seed);
  s.advance(settle + win);
  return s.stats(settle, settle + win);
}
function within(got, q) {
  let ok = true;
  if (q.value !== undefined) ok = Math.abs(got - q.value) <= q.tol * Math.abs(q.value);
  if (q.min !== undefined) ok = ok && got >= q.min;
  if (q.max !== undefined) ok = ok && got <= q.max;
  return ok;
}
const said = (q) => q.value ?? (q.min !== undefined ? "≥ " + q.min : "≤ " + q.max);

for (const x of experiments.filter((e) => e.live)) {
  const base = { ...x.system, ...x.task.set };
  for (const [label, patch, want] of [["start", x.task.start, false], ["reference", x.task.reference, true]]) {
    const cfg = { ...base, ...patch };
    const steady = Sim.measure(cfg, { span: 600 });
    const ok = x.task.goal.every((g) => meets(g, steady, cfg));
    checks++;
    if (ok !== want) bad.push(`${x.id} ${label} ${want ? "misses" : "already meets"} the goal at steady state (p99 ${ms(steady.p99)}, errors ${steady.errors})`);
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const wins = seeds.filter((seed) => { const w = liveWindow(cfg, seed, x.task.settle, x.task.window); return x.task.goal.every((g) => meets(g, w, cfg)); }).length;
    checks++;
    if (want && wins < seeds.length) bad.push(`${x.id} reference meets the goal in only ${wins} of ${seeds.length} live windows`);
    if (!want && wins > 0) bad.push(`${x.id} start meets the goal in ${wins} of ${seeds.length} live windows`);
  }
  // every knob the reference turns is one the task lets the learner turn
  checks++;
  for (const k in x.task.reference) if (!x.task.knobs.includes(k)) bad.push(`${x.id} reference changes ${k}, which the task doesn't let you change`);
  for (const q of x.quotes) {
    checks++;
    if (q.zipf !== undefined) {
      const got = zipfShare(q.zipf, x.system.keys, x.system.zipf);
      if (!within(got, q)) bad.push(`${x.id} quote: the hottest ${q.zipf} keys get ${got.toFixed(3)} of reads, text says ${said(q)}`);
      continue;
    }
    const cfg = { ...x.system, ...q.cfg };
    let got;
    if (q.window) {
      const s = new Sim(cfg, 7);
      if (q.then) { s.advance(q.then.at); s.set(q.then.set); }
      s.advance(q.window[1]);
      got = s.stats(q.window[0], q.window[1])[q.metric];
    } else got = Sim.measure(cfg, { span: 600 })[q.metric];
    if (!within(got, q)) bad.push(`${x.id} quote ${JSON.stringify(q.cfg)}${q.then ? " then " + JSON.stringify(q.then.set) : ""} ${q.metric}: sim says ${got.toFixed(3)}, text says ${said(q)}`);
  }
  // the predict answer, by theory, and the sim bending there
  const s = { ...DEF, ...x.system }, th = x.predict.theory || (s.mode === "open" ? "capacity" : "little");
  const cap = s.workers / s.service, knob = x.crowd.knob, A = x.predict.answer;
  checks += 2;
  if (th === "capacity" || th === "little") {
    const expect = th === "capacity" ? cap : cap * (s.think + s.service);
    if (Math.abs(expect - A) > 1) bad.push(`${x.id} predict answer ${A}, theory says ${expect.toFixed(1)}`);
    // just past it, throughput stops growing
    const over = Sim.measure({ ...s, [knob]: A * 1.25, timeout: 0 }, { span: 600 });
    if (Math.abs(over.tput - cap) / cap > 0.03) bad.push(`${x.id} past the answer the sim serves ${over.tput.toFixed(1)}/s, not capacity ${cap}`);
  } else if (th === "rr") {
    // round robin gives each server 1/n of the load, so the slowest one breaks first
    const expect = s.servers * s.workers / (s.service * s.slow);
    if (Math.abs(expect - A) > 1) bad.push(`${x.id} predict answer ${A}, theory says ${expect.toFixed(1)}`);
    const under = Sim.measure({ ...s, [knob]: A * 0.85 }, { span: 600 }), over = Sim.measure({ ...s, [knob]: A * 1.15 }, { span: 600 });
    if (!(under.errors === 0 && under.p99 < 2 && over.p99 > 5)) bad.push(`${x.id} the sim doesn't bend at ${A}: p99 ${ms(under.p99)} just under, ${ms(over.p99)} just over`);
  } else if (th === "queue") {
    // a queue is safe while a full one drains within the client's timeout: capacity × timeout requests
    const expect = cap * s.timeout;
    if (Math.abs(expect - A) > 1) bad.push(`${x.id} predict answer ${A}, theory says ${expect.toFixed(1)}`);
    // just under it recovers; at 1.5× it never does (in between, recovery is down to luck)
    const lo = Math.round(A * 0.8), hi = Math.round(A * 1.5);
    const small = Sim.measure({ ...s, queueMax: lo }, { span: 600 });
    if (!(small.errors === 0 && small.p99 < 1)) bad.push(`${x.id} a queue of ${lo} doesn't recover (errors ${small.errors}, p99 ${ms(small.p99)})`);
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const b = Sim.measure({ ...s, queueMax: hi }, { seed, span: 600 });
      if (!(b.tput < 1)) bad.push(`${x.id} a queue of ${hi} recovers with seed ${seed} (${b.tput.toFixed(0)}/s answered)`);
    }
  } else if (th === "cache") {
    // at the rate the question names, the cache must catch everything above the database's capacity
    const rate = parseInt((x.predict.q.match(/(\d+) reads a second/) || [])[1], 10), need = 1 - cap / rate;
    if (!rate) bad.push(`${x.id} the question doesn't name a rate in reads a second`);
    const lo = Math.round(A * 0.8), hi = Math.round(A * 1.2);
    const small = Sim.measure({ ...s, rate, cache: lo, warm: true }, { span: 600 }), big = Sim.measure({ ...s, rate, cache: hi, warm: true }, { span: 600 });
    if (!(small.hit < need && small.p99 > 2)) bad.push(`${x.id} a cache of ${lo} already keeps up (hit ${small.hit.toFixed(3)}, need ${need.toFixed(3)})`);
    if (!(big.hit > need && big.errors === 0 && big.p99 < 1)) bad.push(`${x.id} a cache of ${hi} doesn't keep up (hit ${big.hit.toFixed(3)}, p99 ${ms(big.p99)})`);
  } else if (th === "room") {
    // the most a second source can send before everyone else's p99 passes the line: under it at 0.8×, over at 1.25×,
    // and the server is busy by about what the answer implies, (everyone else + the answer) ÷ capacity
    const k = x.predict.axis.knob, line = x.predict.bend;
    for (const seed of [1, 2, 3]) {
      const lo = Sim.measure({ ...s, [k]: Math.round(A * 0.8) }, { seed, span: 600 }), hi = Sim.measure({ ...s, [k]: Math.round(A * 1.25) }, { seed, span: 600 });
      if (!(lo.p99 < line && lo.errors === 0)) bad.push(`${x.id} at ${Math.round(A * 0.8)} p99 is already ${ms(lo.p99)} (seed ${seed})`);
      if (!(hi.p99 > line)) bad.push(`${x.id} at ${Math.round(A * 1.25)} p99 is still ${ms(hi.p99)} (seed ${seed})`);
    }
    const at = Sim.measure({ ...s, [k]: A }, { span: 600 }), expect = (s.rate + A) / cap;
    if (Math.abs(at.util - expect) > 0.03) bad.push(`${x.id} at ${A} the server is ${at.util.toFixed(2)} busy, not ${expect.toFixed(2)}`);
  } else if (th === "drain") {
    // a batch drains in its work ÷ the job workers: every seed's first batch, within the tolerance
    const B = s.batch, jw = x.predict.setup.jobWorkers, expect = B.n * B.service / jw;
    if (Math.abs(expect - A) > 1) bad.push(`${x.id} predict answer ${A}, theory says ${expect.toFixed(1)}`);
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const r = new Sim({ ...s, jobWorkers: jw }, seed);
      r.advance(B.at + expect * 2);
      const b = r.batches[0], took = b.left ? Infinity : b.last - b.t;
      if (Math.abs(took - A) > x.predict.tol) bad.push(`${x.id} with seed ${seed} the first batch drains in ${took.toFixed(1)} s, not about ${A}`);
    }
  }
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
// random routing splits a Poisson stream into n Poisson streams, so each server is its own M/M/c fed λ/n
{
  const n = 3, rate = 150, c = 4, mu = 20, theory = erlangC(rate / n, mu, c).wait;
  let sum = 0;
  for (const seed of [1, 2, 3, 4, 5]) sum += Sim.measure({ mode: "open", rate, servers: n, lb: "random", workers: c, service: 1 / mu, timeout: 0 }, { seed, warm: 100, span: 3000 }).mean - 1 / mu;
  checks++;
  if (Math.abs(sum / 5 - theory) > Math.max(0.04 * theory, 0.0015)) bad.push(`random routing over ${n} servers: sim waits ${ms(sum / 5)}, theory ${ms(theory)}`);
}
// an LRU cache never beats the ideal cache that holds exactly the hottest keys
for (const size of [100, 1000]) {
  const got = Sim.measure({ mode: "open", rate: 60, cache: size, warm: true, workers: 8 }, { span: 600 }).hit, ideal = zipfShare(size, 10000);
  checks++;
  if (!(got <= ideal + 0.01 && got > ideal * 0.5)) bad.push(`LRU of ${size}: hit ${got.toFixed(3)} against ideal ${ideal.toFixed(3)}`);
}

// the same seed gives the same run
const a = Sim.measure(experiments[0].system, { seed: 3 }), b = Sim.measure(experiments[0].system, { seed: 3 });
checks++;
if (JSON.stringify(a) !== JSON.stringify(b)) bad.push("the sim isn't deterministic for a fixed seed");

// rewind: a run driven the way the page drives it (uneven frame steps, knobs turned mid-run) is rebuilt exactly by
// Sim.replay at any moment, both before and after the changes; utilisation may differ only by float rounding
for (const x of experiments.filter((e) => e.live)) {
  const cfg = { ...x.system, ...x.task.set, ...x.task.start }, seed = 9, changes = [];
  const live = new Sim(cfg, seed), r = rng(5);
  const plan = [[12.3, { ...x.task.reference }], [31.7, { [x.crowd.knob]: (x.task.set || x.system)[x.crowd.knob] * 1.1 }]];
  const marks = [8.9, 20.05, 47.2];
  let snaps = [];
  while (live.t < 50) {
    const next = Math.min(50, live.t + 0.004 + r() * 0.09);
    for (const m of marks) if (live.t < m && next >= m) { live.advance(m); snaps.push([m, live.stats(0, m), live.view().srv.map((s) => [s.queue.length, s.busy.length])]); }
    live.advance(next);
    while (plan.length && live.t >= plan[0][0]) { const [, patch] = plan.shift(); changes.push({ t: live.t, patch }); live.set(patch); }
  }
  for (const [T, st, v] of snaps) {
    const re = Sim.replay(cfg, seed, changes, T), rs = re.stats(0, T), rv = re.view();
    checks++;
    const same = ["sent", "ok", "errors", "p50", "p99", "hit"].every((k) => rs[k] === st[k]) && Math.abs(rs.util - st.util) < 1e-9 &&
      JSON.stringify(rv.srv.map((s) => [s.queue.length, s.busy.length])) === JSON.stringify(v);
    if (!same) bad.push(`${x.id} rewind to ${T} s doesn't rebuild the run (sent ${rs.sent} vs ${st.sent}, p99 ${ms(rs.p99)} vs ${ms(st.p99)})`);
  }
}

// Take it home: the code is real
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wt-home-"));
for (const x of experiments.filter((e) => e.live)) {
  const H = HOME[x.id];
  checks++;
  if (!H) { bad.push(`${x.id} has no Take it home`); continue; }
  const base = { ...DEFAULTS, ...x.system, ...x.task.set, ...x.task.start };
  const designs = [{ ...base, ...x.task.reference }, ...(H.try || []).map((t) => ({ ...base, ...t }))];
  designs.forEach((c, di) => {
    for (const f of H.files) {
      const src = f.src(c), where = `${x.id} ${f.name}${di ? " (design " + di + ")" : ""}`;
      checks++;
      const long = src.split("\n").filter((l) => l.length > 60);
      if (long.length) bad.push(`${where}: ${long.length} line(s) over 60 characters, like "${long[0]}"`);
      if (f.lang !== "py") continue;
      const file = path.join(tmp, f.name);
      fs.writeFileSync(file, src);
      checks++;
      let out;
      try {
        out = f.run ? execFileSync("python3", ["-I", file], { cwd: tmp, encoding: "utf8", timeout: 30000 })
          : execFileSync("python3", ["-I", "-c", "import ast,sys; ast.parse(open(sys.argv[1]).read())", file], { encoding: "utf8" });
      } catch (e) { bad.push(`${where} doesn't run: ${String(e.stderr || e.message).trim().split("\n").pop()}`); continue; }
      if (!f.run) continue;
      const said = src.split("\n").filter((l) => l.startsWith("# → ")).map((l) => l.slice(4));
      const got = out.replace(/\n$/, "").split("\n");
      for (let i = 0; i < said.length; i++) {
        checks++;
        if (got[i] !== said[i]) bad.push(`${where} prints "${got[i]}" where it says "${said[i]}"`);
      }
      // a number the code and the sim both produce must agree (the reference design only)
      if (H.check && di === 0) {
        checks++;
        const v = parseFloat(got[H.check.line].match(/[\d.]+/)[0]) / (/%/.test(got[H.check.line]) ? 100 : 1);
        const st = Sim.measure({ ...c, warm: true }, { seed: 4 });
        if (Math.abs(v - st[H.check.metric]) > H.check.tol) bad.push(`${where}: Python says ${H.check.metric} ${v}, the sim ${st[H.check.metric].toFixed(2)}`);
      }
    }
  });
}
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`wind tunnel: ${checks} checks, ${bad.length ? bad.length + " failed" : "ALL GOOD"}`);
bad.forEach((m) => console.log("  FAIL " + m));
process.exit(bad.length ? 1 : 0);
