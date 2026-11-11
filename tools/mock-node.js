// For tools/mock.py: runs Node chapters' code in Node in a box (learn/wb-node.js), the runtime the page uses.
// Reads a JSON list of requests ({op: "cell", ns, code} or {op: "check", setup, code, tests}) from the file
// given, and prints one JSON list of results.
//   node tools/mock-node.js requests.json
const fs = require("fs");
const vm = require("vm");
const WBNode = require("../learn/wb-node.js");

const box = WBNode.create({ compile: (src, filename) => vm.runInThisContext(src, { filename }) });
process.on("unhandledRejection", (r) => box.unhandled(r));
process.on("uncaughtException", (e) => box.unhandled(e));

(async () => {
  const reqs = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const out = [];
  for (const q of reqs) {
    try {
      const r = await box.handle(q);
      out.push({ stdout: r.stdout || "", error: r.error || null, passed: !!r.passed });
    } catch (e) {
      out.push({ stdout: "", error: String(e && e.message), passed: false });
    }
  }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
})();
