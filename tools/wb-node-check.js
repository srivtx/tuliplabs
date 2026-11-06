// Proves every ticket of the Workbench's JavaScript projects, with the same runtime the page uses
// (learn/wb-node.js, Node in a box). For each ticket, in order:
//   * its starting point (the previous solution plus its starters) fails its tests,
//   * its solution passes its tests and every earlier ticket's,
//   * its terminal session replays exactly.
//   node tools/wb-node-check.js [nb01 ...]        a report
//   node tools/wb-node-check.js --json nb01       one JSON line, for build.py --verify
// Run python3 tools/build.py first, so content/wb.json is current.
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

async function verify(proj) {
  const problems = [];
  let count = 0, done = [];
  for (const t of proj.tickets) {
    const mine = [[t.title, t.tests]];
    const bad = await box.handle({ op: "project_check", pid: `${proj.id}:${t.id}:start`, files: t.start, main: proj.main, tickets: mine });
    if (bad.passed) problems.push(`${t.id}: the starting point already passes its tests`);
    const good = await box.handle({ op: "project_check", pid: `${proj.id}:${t.id}`, files: t.after, main: proj.main, tickets: [...done, ...mine] });
    if (!good.passed) {
      const last = good.tickets[good.tickets.length - 1] || {};
      problems.push(`${t.id}: SOLUTION fails in '${last.title}': ${good.error || last.failed}\n  -> ${last.message}`);
    }
    count += 2;
    if (t.session) {
      const diff = await box.handle({ op: "project_session", pid: `${proj.id}:${t.id}:session`, files: t.after, main: proj.main, transcript: t.session, prompt: proj.prompt });
      if (diff) problems.push(`${t.id}: session doesn't replay:\n  ${diff}`);
      count++;
    }
    done = [...done, ...mine];
  }
  return { count, problems };
}

(async () => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "wb.json"), "utf8"));
  const projects = data.projects.filter((p) => p.lang === "js" && (!only.length || only.includes(p.id)));
  let bad = 0;
  for (const p of projects) {
    const r = await verify(p);
    bad += r.problems.length;
    if (asJson) { console.log(JSON.stringify(r)); continue; }
    console.log(`  ${p.id}: ${r.count} checks, ${r.problems.length ? r.problems.length + " problem(s)" : "ok"}`);
    for (const x of r.problems) console.log("     - " + x.replace(/\n/g, "\n       "));
  }
  if (!asJson) console.log(bad ? `${bad} PROBLEM(S)` : "ALL GOOD");
  process.exit(asJson ? 0 : bad ? 1 : 0);
})();
