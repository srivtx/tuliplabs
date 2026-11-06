// Trellis on real Express: runs the finished app.js + notes.js + client.js twice, on the learner's framework in
// Node in a box and on the real Express 5 with real sockets, and compares what the terminal prints.
//   EXPRESS=/path/to/node_modules/express node tools/wb-express-parity.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const os = require("os");
const EXPRESS = process.env.EXPRESS || "express";  // a path to Express 5, or a name Node can resolve
const LAB = path.join(__dirname, "..");
const W = require(LAB + "/learn/wb-node.js");
const data = JSON.parse(fs.readFileSync(LAB + "/content/wb.json", "utf8"));
const P = data.projects.find((p) => p.id === "nb01");
const files = P.tickets[P.tickets.length - 1].after;

const LINES = [
  "GET /", "GET /health", "GET /notes", "GET /notes/2", "GET /notes/2/", "GET /notes?q=TULIP", "GET /notes/9",
  'POST /notes {"text": "  graft the apple "}', 'POST /notes {"text": ""}', 'POST /notes {"text": ', "POST /notes hello",
  "GET /notes/3", "DELETE /notes/3", "DELETE /notes/3", "GET /notes", "PUT /notes/1",
];

(async () => {
  // 1. the box
  const box = W.create({ compile: (src, filename) => vm.runInThisContext(src, { filename }) });
  await box.handle({ op: "project_load", pid: "p", files, main: "client", wipe: true });
  const mine = [];
  for (const l of LINES) mine.push((await box.handle({ op: "project_call", pid: "p", line: l })).stdout.trimEnd());

  // 2. real Express, real sockets
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-"));
  for (const [f, src] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), src);
  fs.writeFileSync(path.join(dir, "express.js"), `module.exports = require(${JSON.stringify(require.resolve(EXPRESS))});\n`);
  const logs = [];
  const orig = console.log, origErr = console.error;
  console.log = console.error = (...a) => logs.push(a.join(" "));
  const client = require(path.join(dir, "client.js"));
  await new Promise((r) => setTimeout(r, 300));
  const real = [];
  for (const l of LINES) {
    logs.length = 0;
    const out = await client.handle(l);
    await new Promise((r) => setTimeout(r, 20));
    real.push([...logs, out].join("\n").trimEnd());
  }
  console.log = orig; console.error = origErr;
  let same = 0;
  LINES.forEach((l, i) => {
    const a = mine[i], b = real[i];
    if (a === b) { same++; return; }
    console.log(`--- ${l}\n  trellis: ${JSON.stringify(a)}\n  express: ${JSON.stringify(b)}`);
  });
  console.log(`${same} of ${LINES.length} identical`);
  process.exit(0);
})();
