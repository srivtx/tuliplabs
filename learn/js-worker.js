/* Runs a Workbench project's JavaScript (learn/wb-node.js, Node in a box) off the main thread, so a loop that
   never ends can be stopped by throwing the worker away. Speaks the same messages as py-worker.js:
   in {id, req}, out {id, res} | {status, text}. Nothing to download, so it's ready at once. */
importScripts("wb-node.js");
// indirect eval: the source runs in global scope, and sourceURL names it in stack traces (wb/app.js:12:5)
const box = self.WBNode.create({ compile: (src, filename) => (0, eval)(src + "\n//# sourceURL=" + filename) });
self.addEventListener("unhandledrejection", (e) => { e.preventDefault(); box.unhandled(e.reason); });
self.addEventListener("error", (e) => { e.preventDefault(); box.unhandled(e.error || new Error(e.message)); });
postMessage({ status: true, text: "ready" });

onmessage = async (e) => {
  const { id, req } = e.data;
  if (req.op === "warm") { postMessage({ id, res: {} }); return; }
  postMessage({ id, started: true });
  let res;
  try { res = await box.handle(req); }
  catch (err) { res = { error: "The Node runtime hit a problem: " + ((err && err.message) || err), stdout: "", disk: [] }; }
  postMessage({ id, res });
};
