// Proves a Build X chapter that runs in Node (front matter lang: node), with the runtime the page uses
// (learn/wb-node.js, Node in a box). The same proofs build.py --verify makes for a Python chapter:
//   * every run and predict block runs without an error, and every predict block prints something,
//     the same thing twice;
//   * every exercise's solution passes its checks, and its starter doesn't;
//   * every Parsons answer, in order, passes its checks (or runs, if it has none).
//   node tools/bx-node-check.js [bx50 ...]        a report
//   node tools/bx-node-check.js --json bx50       one JSON line, for build.py --verify
// Run python3 tools/build.py first, so content/bx.json is current.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const WBNode = require("../learn/wb-node.js");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const asJson = args.includes("--json");
const only = args.filter((a) => !a.startsWith("--"));

const box = WBNode.create({ compile: (src, filename) => vm.runInThisContext(src, { filename }) });
process.on("unhandledRejection", (r) => box.unhandled(r));
process.on("uncaughtException", (e) => box.unhandled(e));

async function verify(ch) {
  const problems = [];
  let count = 0;
  const blocks = ch.sections.flatMap((s) => s.blocks);
  for (const b of blocks) {
    if (b.type === "run" || b.type === "predict") {
      const outs = [];
      for (let rep = 0; rep < (b.type === "predict" ? 2 : 1); rep++) {
        const r = await box.handle({ op: "cell", ns: ch.id, code: b.code });
        if (r.error) { problems.push(`${b.id}: ${b.type} raised\n${r.error}`); break; }
        outs.push(r.stdout);
      }
      if (b.type === "predict" && outs.length === 2) {
        if (!outs[0].trim()) problems.push(`${b.id}: predict block prints nothing`);
        else if (outs[0] !== outs[1]) problems.push(`${b.id}: predict output is not deterministic`);
      }
      count++;
    } else if (b.type === "exercise") {
      const good = await box.handle({ op: "check", code: b.solution, setup: b.setup, tests: b.tests });
      if (!good.passed) problems.push(`${b.id}: SOLUTION fails: ${good.error || good.failed} -> ${good.message}`);
      const bad = await box.handle({ op: "check", code: b.starter, setup: b.setup, tests: b.tests });
      if (bad.passed) problems.push(`${b.id}: starter already passes the tests`);
      count += 2;
    } else if (b.type === "parsons") {
      const r = await box.handle({ op: "check", code: b.lines.join("\n"), setup: b.setup, tests: b.tests || "" });
      if (!r.passed) problems.push(`${b.id}: parsons answer fails: ${r.error || r.failed} ${r.message || ""}`);
      if (b.lines.length < 3) problems.push(`${b.id}: parsons needs at least 3 lines`);
      count++;
    }
  }
  return { count, problems };
}

(async () => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "bx.json"), "utf8"));
  const chapters = data.chapters.filter((c) => c.lang === "node" && (!only.length || only.includes(c.id)));
  let bad = 0;
  for (const ch of chapters) {
    const r = await verify(ch);
    bad += r.problems.length;
    if (asJson) { console.log(JSON.stringify(r)); continue; }
    console.log(`  ${ch.id}: ${r.count} checks, ${r.problems.length ? r.problems.length + " problem(s)" : "ok"}`);
    for (const x of r.problems) console.log("     - " + x.replace(/\n/g, "\n       "));
  }
  if (!asJson) console.log(bad ? `${bad} PROBLEM(S)` : "ALL GOOD");
  process.exit(asJson ? 0 : bad ? 1 : 0);
})();
