// The sandbox's Express against the real one. For every ticket's terminal session in the Workbench's Node
// projects, run the ticket's finished code twice and compare what the terminal prints, line by line:
//   1. in Node in a box (learn/wb-node.js), as the page runs it;
//   2. in a real Node process, with real sockets and the real Express 5 from npm.
// Trellis writes its own express.js; there the real Express replaces it, which is the claim its finish makes.
// The real Express answers its default 404 and 500 with an HTML page; that page is reduced to the text in its
// <pre> before comparing, since the sandbox answers in plain text on purpose.
//   EXPRESS=/path/to/node_modules/express node tools/wb-express-parity.js [ex01 ux01 ...]
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");
const WBNode = require("../learn/wb-node.js");

const ROOT = path.join(__dirname, "..");
const EXPRESS = path.dirname(require.resolve(path.join(process.env.EXPRESS || "express", "package.json")));
const only = process.argv.slice(2);
const box = WBNode.create({ compile: (src, filename) => vm.runInThisContext(src, { filename }) });
process.on("unhandledRejection", (r) => box.unhandled(r));

// the commands of a session, in order
const commands = (t, prompt) => t.session.split("\n").filter((l) => l.startsWith(prompt)).map((l) => l.slice(prompt.length));
const plain = (s) => s.replace(/<!DOCTYPE html>[\s\S]*?<pre>([\s\S]*?)<\/pre>[\s\S]*?<\/html>/g, (_, x) => x.replace(/<br>/g, "\n").replace(/&nbsp;/g, " ").split("\n")[0]).replace(/\n+$/, "");

async function inBox(proj, t, lines) {
  const pid = `parity:${proj.id}:${t.id}`;
  await box.handle({ op: "project_load", pid, files: t.after, main: proj.main, wipe: true });
  const out = [];
  for (const line of lines) out.push((await box.handle({ op: "project_call", pid, line })).stdout.replace(/\n+$/, ""));
  return out;
}

function inNode(proj, t, lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-parity-"));
  for (const [f, src] of Object.entries(t.after)) fs.writeFileSync(path.join(dir, f), src);
  if ("express.js" in t.after) fs.writeFileSync(path.join(dir, "express.js"), `module.exports = require(${JSON.stringify(EXPRESS)});\n`);
  fs.mkdirSync(path.join(dir, "node_modules"));
  fs.symlinkSync(EXPRESS, path.join(dir, "node_modules", "express"));
  // a process of its own: a fresh port, fresh modules, and console output caught in order with the replies
  const runner = `
    const out = []; let cur = [];
    console.log = console.error = (...a) => cur.push(require("util").format(...a));
    const { handle } = require(${JSON.stringify(path.join(dir, proj.main + ".js"))});
    (async () => {
      await new Promise((r) => setTimeout(r, 150)); cur = [];
      for (const line of ${JSON.stringify(lines)}) {
        const reply = await handle(line);
        await new Promise((r) => setTimeout(r, 15));
        if (reply !== null && reply !== undefined) cur.push(String(reply));
        out.push(cur.join("\\n")); cur = [];
      }
      process.stdout.write(JSON.stringify(out));
      process.exit(0);
    })();`;
  const res = JSON.parse(execFileSync("node", ["-e", runner], { cwd: dir, timeout: 30000 }).toString());
  fs.rmSync(dir, { recursive: true, force: true });
  return res;
}

(async () => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "wb.json"), "utf8"));
  let same = 0, all = 0;
  const per = {};
  for (const proj of data.projects.filter((p) => p.lang === "js" && (!only.length || only.includes(p.id)))) {
    for (const t of proj.tickets.filter((t) => t.session)) {
      // ticket 1 of Trellis is bare http, before there's any Express to swap in
      if (!("express.js" in t.after) && !/require\(["']express["']\)/.test(Object.values(t.after).join("\n"))) continue;
      const lines = commands(t, proj.prompt);
      const a = await inBox(proj, t, lines), b = inNode(proj, t, lines).map(plain);
      lines.forEach((l, i) => {
        all++;
        const k = (per[proj.id] = per[proj.id] || [0, 0]);
        k[1]++;
        if (a[i] === b[i]) { same++; k[0]++; return; }
        console.log(`  ${proj.id} ${t.id} ${l}\n    sandbox: ${JSON.stringify(a[i])}\n    express: ${JSON.stringify(b[i])}`);
      });
    }
  }
  for (const [id, [s1, n1]] of Object.entries(per)) console.log(`  ${id}: ${s1} of ${n1} identical`);
  console.log(`${same} of ${all} terminal answers identical to the real Express ${require(path.join(EXPRESS, "package.json")).version}`);
  process.exit(same === all ? 0 : 1);
})();
