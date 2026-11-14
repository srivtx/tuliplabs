// The labs' shelf pictures, rendered by the labs themselves, so the shelf shows the real thing.
//   python3 tools/devserver.py      (in another terminal; the IDE shot runs Python locally)
//   BASE=http://localhost:8765 node tools/lab-thumbs.js
// Wind Tunnel: each live experiment's stage at the moment it bends, drawn on transparency (lab.html?shot) and
// trimmed to the scene: tunnel/shots/wtNN.webp. Workbench: the Ledger IDE mid-project, with a terminal session
// that survives a power cut: workbench/shots/ide.webp.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = process.env.BASE || "http://localhost:8765";
const ROOT = path.join(__dirname, "..");

// the moment each experiment is drawn at: what to turn, and how long to run it
const MOMENTS = {
  wt01: { set: { rate: 96 }, run: 30 },        // past capacity: the queue towers up and the server turns red
  wt02: { set: { users: 640 }, run: 60 },      // a crowd far past what Little's law allows
  wt03: { set: { rate: 100 }, run: 25 },       // round robin drowning the slow server
  wt04: { set: { cache: 250, rate: 160 }, run: 40 }, // the cache taking the hits
  wt05: { set: {}, run: 40 },                  // the storm, after the surge has gone
  wt06: { set: {}, run: 14 },                  // the newsletter towering in the website's own line
  wt07: { set: { replicas: 2 }, run: 20 },     // writes copying to the replicas, and a stale read popping red
  wt08: { set: { limit: 20 }, run: 20 },       // the limiter bouncing the script's flood back as 429s
  wt09: { set: {}, run: 20 },                  // the viral account melting one shard under the hash ring
};
// ONLY=wt08 renders just those (comma-separated), and skips the Workbench shot
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;

async function trimmed(page, dataUrl, maxW) {
  return page.evaluate(async ([url, maxW]) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 10) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const pad = 12, w = x1 - x0 + 1 + pad * 2, h = y1 - y0 + 1 + pad * 2, k = Math.min(1, maxW / w);
    const o = document.createElement("canvas");
    o.width = Math.round(w * k); o.height = Math.round(h * k);
    o.getContext("2d").drawImage(c, x0 - pad, y0 - pad, w, h, 0, 0, o.width, o.height);
    return o.toDataURL("image/webp", 0.9);
  }, [dataUrl, maxW]);
}
const save = (file, dataUrl) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log(`  ${path.relative(ROOT, file)}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
};

(async () => {
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => { try { localStorage.setItem("vnl-theme", "dark"); localStorage.setItem("vnl-code-v1", "{}"); } catch (e) {} });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // Wind Tunnel
  await page.goto(`${BASE}/tunnel/lab.html?shot#1`);
  const X = await page.evaluate(() => window.WT.experiments.map((x, i) => ({ n: i + 1, id: x.id, live: !!x.live })));
  for (const x of X.filter((x) => x.live && MOMENTS[x.id] && (!ONLY || ONLY.includes(x.id)))) {
    await page.goto(`${BASE}/tunnel/lab.html?shot#${x.n}`);
    await page.reload();
    await page.waitForSelector(".wt-stage canvas");
    const m = MOMENTS[x.id];
    await page.evaluate(([set, run]) => { const w = document.querySelector("#wt"); if (Object.keys(set).length) w.wtSet(set); w.wtRun(run); }, [m.set, m.run]);
    await page.waitForTimeout(2600); // real frames, so requests are in flight and heat has eased in
    const url = await page.evaluate(() => document.querySelector("#wt").wtFrame());
    save(path.join(ROOT, "tunnel", "shots", `${x.id}.webp`), await trimmed(page, url, 1100));
  }

  if (ONLY) { await browser.close(); if (errors.length) { console.log(errors.join("\n")); process.exit(1); } return; }
  // Workbench: Ledger with seven tickets committed and the eighth written, after a run and a power cut
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "wb.json"), "utf8"));
  const P = data.projects[0];
  const filesAt = (i) => ({ ...P.tickets[i].start, ...P.tickets[i].solution });
  const commits = P.tickets.slice(0, 7).map((t, i) => ({ sha: (0x1a2b3c4 + i * 0x9e3779).toString(16).slice(-7), msg: t.title, ticket: t.id, t: Date.now() - (7 - i) * 3600e3, files: filesAt(i) }));
  const state = { wb: { [P.id]: { cur: 7, files: filesAt(7), commits, todo: {}, hints: {}, open: ["shell.py", "store.py", "log.py"], active: "shell.py" } }, done: Object.fromEntries(P.tickets.slice(0, 7).map((t) => [`${P.id}-${t.id}`, 1])) };
  const ide = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 });
  ide.on("pageerror", (e) => errors.push(String(e)));
  await ide.addInitScript((s) => { try { localStorage.setItem("vnl-theme", "dark"); localStorage.setItem("vnl-code-v1", s); } catch (e) {} }, JSON.stringify(state));
  await ide.goto(`${BASE}/workbench/bench.html?runner=local#1`);
  await ide.waitForSelector(".wact .run");
  await ide.evaluate((pid) => fetch("/__run", { method: "POST", body: JSON.stringify({ op: "project_load", pid, files: {}, main: "nothing", wipe: true }) }), P.id);
  await ide.locator(".wact .run").click();
  await ide.waitForSelector(".term .inp:not(.off)");
  for (const line of ["SET from 90", "SET to 10", "MULTI", "INCR to", "SET from 89", "EXEC"]) {
    const n = await ide.locator(".term .ln.cmd").count();
    await ide.locator(".term .inp input").fill(line);
    await ide.locator(".term .inp input").press("Enter");
    await ide.waitForFunction((n) => document.querySelectorAll(".term .ln.cmd").length > n && document.querySelector(".term .inp:not(.off)"), n);
  }
  await ide.locator(".ptabs .act.plug").click();
  await ide.waitForFunction(() => /power back on/.test(document.querySelector(".term").textContent));
  await ide.locator(".term .inp input").fill("GET to");
  await ide.locator(".term .inp input").press("Enter");
  await ide.waitForTimeout(800);
  await ide.evaluate(() => { const s = document.querySelector(".cm-scroller"); if (s) s.scrollTop = 1180; });
  await ide.waitForTimeout(300);
  const shot = await ide.locator("#ide").screenshot({ type: "png" });
  const url = "data:image/png;base64," + shot.toString("base64");
  save(path.join(ROOT, "workbench", "shots", "ide.webp"), await ide.evaluate(async ([u]) => {
    const img = new Image(); img.src = u; await img.decode();
    const k = Math.min(1, 1600 / img.width), c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/webp", 0.86);
  }, [url]));

  errors.forEach((e) => console.log("  page error: " + e));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
