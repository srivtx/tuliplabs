/* Runs Python (Pyodide) off the main thread so a long simulation never freezes the page.
   Messages in:  {id, req}   where req is {op:'cell'|'check'|'reset', ...}
   Messages out: {id, res} | {status, text} */
// Two mirrors of the same files: if one CDN edge hiccups, the other usually answers.
const MIRRORS = ["https://cdn.jsdelivr.net/pyodide/v0.26.4/full/", "https://fastly.jsdelivr.net/pyodide/v0.26.4/full/"];
const FILES = ["harness.py", "modsim.py", "complexity.py"];
let py = null;
let sources = {};
let ready = null;

function status(text) { postMessage({ status: true, text }); }

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(base) {
  if (typeof loadPyodide === "undefined") importScripts(base + "pyodide.js");
  py = await loadPyodide({ indexURL: base });
  status("Loading numpy…");
  await py.loadPackage(["numpy"]);
}

async function init() {
  status("Downloading Python…");
  // Try each mirror, twice round, before giving up: a single dropped request shouldn't sink the page.
  for (let i = 0; ; i++) {
    try { await boot(MIRRORS[i % MIRRORS.length]); break; }
    catch (e) {
      py = null;
      if (i >= 3) throw e;
      status("Retrying the Python download…");
      await wait(800 * (i + 1));
    }
  }
  for (const f of FILES) {
    let r = null;
    for (let i = 0; i < 3 && !(r && r.ok); i++) {
      try { r = await fetch(f); } catch (e) { r = null; }
      if (!(r && r.ok)) await wait(500 * (i + 1));
    }
    if (!(r && r.ok)) throw new Error("Could not fetch " + f);
    sources[f] = await r.text();
    py.FS.writeFile("/home/pyodide/" + f, sources[f]);
  }
  py.runPython(`
import os, sys
os.environ["MPLBACKEND"] = "Agg"
sys.path.insert(0, "/home/pyodide")
import harness
`);
  status("ready");
}

async function packagesFor(req) {
  let text = [req.prelude, req.setup, req.code, req.tests, req.show].filter(Boolean).join("\n");
  // flipbook() draws frames with matplotlib even if the lesson never imports it.
  if (/\bflipbook\s*\(/.test(text)) text += "\nimport matplotlib";
  // Our helper modules import packages too; scan them when a lesson uses them.
  if (/\bmodsim\b/.test(text)) text += "\n" + sources["modsim.py"];
  if (/\bcomplexity\b/.test(text)) text += "\n" + sources["complexity.py"];
  const before = Object.keys(py.loadedPackages).length;
  await py.loadPackagesFromImports(text, {
    messageCallback: (m) => {
      if (!/^Loading /.test(m)) return;
      const names = m.replace(/^Loading /, "").replace(/\.\.\.$/, "").split(", ");
      status(names.length > 2 ? `Loading ${names.length} packages…` : `Loading ${names.join(", ")}…`);
    },
  });
  if (Object.keys(py.loadedPackages).length !== before) status("ready");
}

onmessage = async (e) => {
  const { id, req } = e.data;
  try {
    // A failed start is forgotten, so the next Run tries again instead of failing forever.
    if (!ready) ready = init().catch((err) => { ready = null; status("failed"); throw err; });
    await ready;
    if (req.op !== "reset") await packagesFor(req);
    if (req.op === "warm") { postMessage({ id, res: {} }); return; }
    postMessage({ id, started: true });
    const handle = py.globals.get("harness").handle;
    const out = handle(py.toPy(req));
    const res = out.toJs({ dict_converter: Object.fromEntries });
    out.destroy();
    postMessage({ id, res });
  } catch (err) {
    postMessage({ id, res: { error: "The Python runtime hit a problem: " + (err && err.message || err), stdout: "", figures: [] } });
  }
};
