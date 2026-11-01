/* Runs Python (Pyodide) off the main thread so a long simulation never freezes the page.
   Messages in:  {id, req}   where req is {op:'cell'|'check'|'reset', ...}
   Messages out: {id, res} | {status, text} */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
const FILES = ["harness.py", "modsim.py", "complexity.py"];
let py = null;
let sources = {};
let ready = null;

function status(text) { postMessage({ status: true, text }); }

async function init() {
  status("Downloading Python…");
  importScripts(PYODIDE + "pyodide.js");
  py = await loadPyodide({ indexURL: PYODIDE });
  status("Loading numpy…");
  await py.loadPackage(["numpy"]);
  for (const f of FILES) {
    const r = await fetch(f);
    if (!r.ok) throw new Error("Could not fetch " + f);
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
    messageCallback: (m) => { if (/Loading/.test(m)) status(m.replace(/\.\.\.$/, "…")); },
  });
  if (Object.keys(py.loadedPackages).length !== before) status("ready");
}

onmessage = async (e) => {
  const { id, req } = e.data;
  try {
    if (!ready) ready = init();
    await ready;
    if (req.op !== "reset") await packagesFor(req);
    const handle = py.globals.get("harness").handle;
    const out = handle(py.toPy(req));
    const res = out.toJs({ dict_converter: Object.fromEntries });
    out.destroy();
    postMessage({ id, res });
  } catch (err) {
    postMessage({ id, res: { error: "The Python runtime hit a problem: " + (err && err.message || err), stdout: "", figures: [] } });
  }
};
