// Checks the DSA mock test against reality.
//   1. Every "trace it" generator: for 300 seeds each, run the generated Python program with real CPython and
//      check it prints exactly the answer the generator worked out in JavaScript. Choice questions must have
//      exactly one right option, and no repeated ones.
//   2. The question bank, content/ds-mock.json: every multiple-choice question has one right answer, every
//      bug line points inside its code, and every ordering question has lines to order.
//   node tools/mock-check.js [seeds]
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const G = require("../learn/mock-gen.js");

const SEEDS = Number(process.argv[2] || 300);
const problems = [];
const cases = [];
for (const gen of G.names) {
  for (let seed = 1; seed <= SEEDS; seed++) {
    let q;
    try { q = G.make(gen, seed); } catch (e) { problems.push(`${gen} #${seed}: the generator threw ${e.message}`); continue; }
    if (q.match === "choice") {
      const ok = q.opts.filter((o) => o.ok).length, texts = new Set(q.opts.map((o) => o.t));
      if (ok !== 1) problems.push(`${gen} #${seed}: ${ok} right options`);
      if (texts.size !== q.opts.length) problems.push(`${gen} #${seed}: repeated options`);
      if (!q.opts.some((o) => o.ok && o.t === q.answer)) problems.push(`${gen} #${seed}: the right option isn't the answer`);
    }
    cases.push({ gen, seed, code: q.code, answer: q.answer });
  }
}

// run them all in one Python process: each program in a fresh namespace, its printed text captured
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mock-"));
fs.writeFileSync(path.join(dir, "cases.json"), JSON.stringify(cases.map((c) => c.code)));
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
const outs = JSON.parse(execFileSync("python3", ["-I", path.join(dir, "run.py"), path.join(dir, "cases.json")], { maxBuffer: 1 << 28 }).toString());
const tidy = (s) => s.split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").replace(/\n+$/, "");
const perGen = {};
cases.forEach((c, i) => {
  perGen[c.gen] = perGen[c.gen] || { n: 0, bad: 0 };
  perGen[c.gen].n++;
  if (tidy(outs[i]) !== tidy(c.answer)) {
    perGen[c.gen].bad++;
    if (perGen[c.gen].bad <= 2) problems.push(`${c.gen} #${c.seed}: Python printed ${JSON.stringify(tidy(outs[i]))}, the generator says ${JSON.stringify(tidy(c.answer))}`);
  }
  // the marking must accept Python's own output
  if (!G.correct({ match: "tokens", answer: c.answer }, outs[i]) && G.make(c.gen, c.seed).match !== "choice") problems.push(`${c.gen} #${c.seed}: marking rejects Python's own output`);
});
fs.rmSync(dir, { recursive: true, force: true });
for (const [g, s] of Object.entries(perGen)) console.log(`  ${g.padEnd(12)} ${s.n - s.bad} of ${s.n} agree with Python`);

// the bank
const bank = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "content", "ds-mock.json"), "utf8"));
const kinds = {};
for (const q of bank.questions) {
  kinds[q.kind] = (kinds[q.kind] || 0) + 1;
  if (q.kind === "mc" && q.opts.filter((o) => o.ok).length !== 1) problems.push(`${q.id}: ${q.opts.filter((o) => o.ok).length} right options`);
  if (q.kind === "out" && !q.out.trim()) problems.push(`${q.id}: no output`);
  if (q.kind === "line" && !(q.line >= 0 && q.line < q.code.split("\n").length)) problems.push(`${q.id}: bug line out of range`);
  if (q.kind === "order" && q.lines.length < 3) problems.push(`${q.id}: too few lines`);
  if (q.kind === "pattern" && !bank.chapters.find((c) => c.num === q.ch && c.pattern)) problems.push(`${q.id}: not a pattern chapter`);
}
console.log("  bank        " + Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(", "));
if (problems.length) { console.log(problems.slice(0, 30).join("\n")); console.log(`${problems.length} PROBLEMS`); process.exit(1); }
console.log("ALL GOOD");
