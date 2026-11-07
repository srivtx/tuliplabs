// Runs a Node chapter's blocks in real Node, with the real express and zod packages, and compares them with
// Node in a box (learn/wb-node.js), which is what the page runs:
//   * every run and predict block prints exactly what the page prints;
//   * every exercise's solution passes its checks and its starter fails them, in real Node too;
//   * every Parsons answer passes its checks.
//   NODE_PATH=<a node_modules with express@5 and zod@4> node tools/bx-real-node.js bx50
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");
const WBNode = require("../learn/wb-node.js");

const ROOT = path.join(__dirname, "..");
if (!process.env.NODE_PATH) { console.error("Set NODE_PATH to a node_modules folder with express@5 and zod@4 in it."); process.exit(2); }
const only = process.argv.slice(2);
const box = WBNode.create({ compile: (src, filename) => vm.runInThisContext(src, { filename }) });
process.on("unhandledRejection", (r) => box.unhandled(r));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bx-real-"));

// the checks' helpers, as tools in real Node: the same request() the page gives them
const HELPERS = `
const __assert = (cond, message) => { if (!cond) throw Object.assign(new Error(message || "This check did not hold."), { __assert: true }); };
const __request = async (line, body, opts = {}) => {
  const [method, p] = line.trim().split(/\\s+/);
  const headers = { ...(opts.headers || {}) };
  let payload;
  if (body !== undefined) {
    if (typeof body === "string") payload = body;
    else { payload = JSON.stringify(body); if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json"; }
  }
  const r = await fetch("http://localhost:" + (opts.port || 3000) + p, { method, headers, body: payload, redirect: "manual" });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch (e) { json = undefined; }
  const hs = {};
  for (const [k, v] of r.headers) hs[k] = k in hs ? [].concat(hs[k], v) : v;
  return { status: r.status, headers: hs, text, json, type: (r.headers.get("content-type") || "").split(";")[0] };
};
`;
function realRun(code, tests) {
  const file = path.join(dir, "main.js");
  let src = `(async () => {\n${HELPERS}\nawait (async () => {${code}\n})();\n`;
  if (tests !== undefined) src += `await new Promise((r) => setTimeout(r, 30));\nconst mod = module.exports;\nawait (async (assert, request) => {${tests}\n})(__assert, __request);\nconsole.log("__PASSED__");\n`;
  src += `})().then(() => process.exit(0), (e) => { console.log("__FAILED__ " + (e && e.message)); process.exit(0); });\n`;
  fs.writeFileSync(file, src);
  const r = spawnSync("node", [file], { encoding: "utf8", timeout: 20000, env: process.env });
  return { stdout: r.stdout, stderr: r.stderr };
}

(async () => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "bx.json"), "utf8"));
  const chapters = data.chapters.filter((c) => c.lang === "node" && (!only.length || only.includes(c.id)));
  let bad = 0, count = 0;
  const problem = (s) => { bad++; console.log("  - " + s.replace(/\n/g, "\n    ")); };
  for (const ch of chapters) {
    console.log(ch.id);
    for (const b of ch.sections.flatMap((s) => s.blocks)) {
      if (b.type === "run" || b.type === "predict") {
        const page = await box.handle({ op: "cell", ns: ch.id, code: b.code });
        const real = realRun(b.code);
        count++;
        if (real.stderr.trim()) problem(`${b.id}: real Node wrote to stderr:\n${real.stderr.trim()}`);
        if (page.stdout !== real.stdout) problem(`${b.id}: the page prints\n${page.stdout}\nbut real Node prints\n${real.stdout}`);
      } else if (b.type === "exercise" || b.type === "parsons") {
        const runs = b.type === "exercise" ? [["solution", b.solution, true], ["starter", b.starter, false]] : [["answer", b.lines.join("\n"), true]];
        for (const [name, code, should] of runs) {
          const real = realRun((b.setup ? b.setup + "\n" : "") + code, b.tests || "");
          const passed = real.stdout.includes("__PASSED__");
          count++;
          if (passed !== should) problem(`${b.id}: the ${name} ${passed ? "passes" : "fails"} in real Node: ${(real.stdout.split("__FAILED__ ")[1] || real.stderr).trim()}`);
        }
      }
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(bad ? `${bad} PROBLEM(S) in ${count} checks` : `ALL GOOD: ${count} checks agree with real Node`);
  process.exit(bad ? 1 : 0);
})();
