// Checks the mock tests against reality, for every track.
//   1. Every "trace it" generator: for N seeds each, run the generated program for real and check it prints
//      exactly the answer the generator worked out in JavaScript. Python programs run in CPython (SQL ones
//      through Python's sqlite3), JavaScript ones in Node, event loop and all. Choice questions must have
//      exactly one right option, and no repeated ones.
//   2. Every question bank, content/<track>-mock.json: every multiple-choice question has one right answer,
//      every bug line points inside its code, every ordering question has lines to order, and every
//      "explain it" question has an answer to compare with.
//   node tools/mock-check.js [seeds] [track]
const fs = require("fs");
const path = require("path");
const os = require("os");
const vm = require("vm");
const { execFileSync } = require("child_process");
const G = require("../learn/mock-gen-x.js");

const SEEDS = Number(process.argv[2] || 300);
const ONLY = process.argv[3] || null;
const problems = [];
const cases = [];
const skipped = new Set();
// Express questions run with the real express package: NODE_PATH=<node_modules with express@5>
const { createRequire } = require("module");
const NODE_PATH = process.env.NODE_PATH || "";
const realRequire = createRequire(path.join(NODE_PATH || __dirname, "x.js"));
let EXPRESS = false;
try { realRequire.resolve("express"); EXPRESS = true; } catch (e) {}
for (const gen of G.names) {
  if (ONLY && (G.GENS[gen].track || "ds") !== ONLY) continue;
  for (let seed = 1; seed <= SEEDS; seed++) {
    let q;
    try { q = G.make(gen, seed); } catch (e) { problems.push(`${gen} #${seed}: the generator threw ${e.message}`); continue; }
    if (q.match === "choice") {
      const ok = q.opts.filter((o) => o.ok).length, texts = new Set(q.opts.map((o) => o.t));
      if (ok !== 1) problems.push(`${gen} #${seed}: ${ok} right options`);
      if (texts.size !== q.opts.length) problems.push(`${gen} #${seed}: repeated options`);
      if (!q.opts.some((o) => o.ok && o.t === q.answer)) problems.push(`${gen} #${seed}: the right option isn't the answer`);
    }
    if (!String(q.answer).trim()) problems.push(`${gen} #${seed}: an empty answer`);
    if (q.needs === "express" && !EXPRESS) { skipped.add(gen); continue; }
    cases.push({ gen, seed, code: q.run || q.code, runs: q.lang === "node" ? "node" : "py", answer: q.answer, choice: q.match === "choice" });
  }
}

// Python: all in one process, each program in a fresh namespace, its printed text captured
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mock-"));
const py = cases.filter((c) => c.runs === "py");
fs.writeFileSync(path.join(dir, "cases.json"), JSON.stringify(py.map((c) => c.code)));
fs.writeFileSync(path.join(dir, "run.py"), `import json, io, sys, contextlib
codes = json.load(open(sys.argv[1]))
outs = []
for code in codes:
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            exec(code, {"__name__": "__main__"})
        outs.append(buf.getvalue())
    except Exception as e:
        outs.append("ERROR " + repr(e))
print(json.dumps(outs))
`);
const pyOut = py.length ? JSON.parse(execFileSync("python3", ["-I", path.join(dir, "run.py"), path.join(dir, "cases.json")], { maxBuffer: 1 << 28 }).toString()) : [];
py.forEach((c, i) => (c.out = pyOut[i]));
fs.rmSync(dir, { recursive: true, force: true });

// JavaScript: one after another in this process, each in a fresh context with its own console, on the real
// event loop: the run ends once its timers, promises and immediates have all gone quiet
async function runNode(code, lines) {
  let out = "";
  const log = (...a) => { out += a.map((x) => (typeof x === "string" ? x : require("util").inspect(x))).join(" ") + "\n"; };
  const ctx = vm.createContext({ console: { log }, setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, queueMicrotask, Promise, fetch, require: realRequire, process: { nextTick: process.nextTick } });
  try { vm.runInContext(code, ctx, { timeout: 2000 }); } catch (e) { return "ERROR " + e.message; }
  // wait until it has printed as many lines as the answer has (or 3 s), then a little longer for any extra
  for (let t = 0; t < 300 && out.split("\n").length - 1 < lines; t++) await new Promise((r) => setTimeout(r, 10));
  await new Promise((r) => setTimeout(r, 40));
  return out;
}

(async () => {
  for (const c of cases.filter((c) => c.runs === "node")) c.out = await runNode(c.code, c.answer.split("\n").length);
  if (skipped.size) console.log(`  skipped ${[...skipped].join(", ")}: set NODE_PATH to a node_modules with express@5 to check them`);
  const tidy = (s) => s.split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").replace(/\n+$/, "");
  const perGen = {};
  for (const c of cases) {
    perGen[c.gen] = perGen[c.gen] || { n: 0, bad: 0, track: G.GENS[c.gen].track || "ds" };
    perGen[c.gen].n++;
    if (tidy(c.out) !== tidy(c.answer)) {
      perGen[c.gen].bad++;
      if (perGen[c.gen].bad <= 2) problems.push(`${c.gen} #${c.seed}: the program printed ${JSON.stringify(tidy(c.out))}, the generator says ${JSON.stringify(tidy(c.answer))}`);
    }
    // the marking must accept the program's own output
    if (!c.choice && !G.correct({ match: "tokens", answer: c.answer }, c.out)) problems.push(`${c.gen} #${c.seed}: marking rejects the program's own output`);
  }
  const byTrack = {};
  for (const [g, s] of Object.entries(perGen)) (byTrack[s.track] = byTrack[s.track] || []).push(`${g} ${s.n - s.bad}/${s.n}`);
  for (const [t, list] of Object.entries(byTrack)) console.log(`  ${t}: ${list.length} generators, ${list.reduce((a, x) => a + +x.split(" ")[1].split("/")[1], 0)} programs\n    ${list.join(", ")}`);

  // the banks
  for (const f of fs.readdirSync(path.join(__dirname, "..", "content")).filter((f) => /-mock\.json$/.test(f))) {
    const bank = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content", f), "utf8"));
    if (ONLY && bank.track !== ONLY) continue;
    const kinds = {};
    const ids = new Set();
    for (const q of bank.questions) {
      kinds[q.kind] = (kinds[q.kind] || 0) + 1;
      if (ids.has(q.id)) problems.push(`${f} ${q.id}: id used twice`);
      ids.add(q.id);
      if (!bank.chapters.find((c) => c.num === q.ch)) problems.push(`${f} ${q.id}: no chapter ${q.ch}`);
      if (q.kind === "mc" && q.opts.filter((o) => o.ok).length !== 1) problems.push(`${f} ${q.id}: ${q.opts.filter((o) => o.ok).length} right options`);
      if (q.kind === "out" && !q.out.trim()) problems.push(`${f} ${q.id}: no output`);
      if (q.kind === "line" && !(q.lines.length && q.lines.every((l) => l >= 0 && l < q.code.split("\n").length))) problems.push(`${f} ${q.id}: bug lines out of range`);
      if (q.kind === "order" && q.lines.length < 3) problems.push(`${f} ${q.id}: too few lines`);
      if (q.kind === "pattern" && !bank.chapters.find((c) => c.num === q.ch && c.pattern)) problems.push(`${f} ${q.id}: not a pattern chapter`);
      if (q.kind === "explain" && !(q.q && q.a)) problems.push(`${f} ${q.id}: no question or answer`);
    }
    console.log(`  ${f.padEnd(14)} ${bank.questions.length} questions: ` + Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(", "));
  }
  if (problems.length) { console.log(problems.slice(0, 40).join("\n")); console.log(`${problems.length} PROBLEMS`); process.exit(1); }
  console.log("ALL GOOD");
})();
