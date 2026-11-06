// End-to-end check of the code tracks with the local Python runner.
//   python3 tools/devserver.py 8765 &   then   node tools/e2e.js [track] [chapter]
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:8765";
const track = process.argv[2] || "code";
const chap = process.argv[3] || "1";
const shots = process.env.SHOTS || ".";
(async () => {
  // Software WebGL, so the 3D simulations still render on machines (and CI) with no GPU for the browser.
  const args = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL, args } : { args });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts.g|Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
  if (track === "design") return studio(page, browser, errors);
  if (track === "workbench") return workbench(page, browser, errors);
  if (track === "tunnel") return tunnel(page, browser, errors);
  await page.goto(`${BASE}/${track}/?runner=local#${chap}`);
  await page.waitForSelector(".stephead");
  const data = await page.evaluate(async (t) => (await (await fetch(`/content/${t}.json`)).json()), ({ code: "tc", modsim: "ms", build: "bx", stats: "ps", dsa: "ds", ods: "od" })[track]);
  const ch = data.chapters.find((c) => String(c.num) === chap);
  let ok = 0, bad = [];
  for (const s of ch.sections) {
  for (const b of s.blocks) {
    const el = page.locator("#b-" + CSS_escape(b.id));
    if (b.type === "md" || b.type === "bridge") continue;
    if (b.type === "run") {
      await el.locator("button.btn.primary").click();
      await el.locator(".out").first().waitFor({ state: "attached" });
      await page.waitForFunction((id) => { const e = document.getElementById("b-" + id); return e && !e.querySelector("button.primary").disabled; }, b.id);
      const err = await el.locator(".out.err").count();
      err ? bad.push(b.id + " run error: " + await el.locator(".out.err").innerText()) : ok++;
    } else if (b.type === "predict") {
      await el.locator("textarea.guess").fill("my guess");
      await el.locator("button:has-text('Lock in')").click();
      await el.locator(".cmp").waitFor();
      ok++;
    } else if (b.type === "exercise") {
      // wrong first: starter must fail
      await el.locator("button:has-text('Run & check')").click();
      await el.locator(".result").waitFor();
      await page.waitForFunction((id) => !document.querySelector("#b-" + CSS.escape(id) + " button.primary").disabled, b.id);
      if (await el.locator(".result.pass").count()) bad.push(b.id + " starter passed in browser");
      await el.locator("textarea").first().fill(b.solution);
      await el.locator("button:has-text('Run & check')").click();
      await page.waitForFunction((id) => document.querySelector("#b-" + CSS.escape(id) + " .result.pass"), b.id, { timeout: 15000 }).catch(() => {});
      (await el.locator(".result.pass").count()) ? ok++ : bad.push(b.id + " solution failed in browser: " + (await el.innerText()).slice(-400));
    } else if (b.type === "parsons") {
      for (const line of b.lines) {
        // Exact text match in the page: Playwright's regex filters break on lines containing quotes.
        const btns = el.locator(".pz ol").first().locator("button.ln");
        const i = await btns.evaluateAll((bs, t) => bs.findIndex((x) => x.textContent === t), line);
        await btns.nth(i).click();
      }
      await el.locator("button:has-text('Check order')").click();
      await el.locator(".result").waitFor();
      (await el.locator(".result.pass").count()) ? ok++ : bad.push(b.id + " parsons not accepted");
    } else if (b.type === "quiz") {
      await el.locator(".opt").first().click();
      await el.locator(".why p").first().waitFor();
      ok++;
    } else if (b.type === "viz") {
      await el.locator(".vz-view").waitFor({ timeout: 15000 });
      await page.waitForTimeout(1200);
      const failed = await el.locator(".vstage").innerText();
      if (/failed to start|did not load/.test(failed)) { bad.push(b.id + " viz: " + failed.slice(0, 200)); continue; }
      await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(600);
      await el.screenshot({ path: `${shots}/${track}-ch${chap}-${b.id}.png` }).catch(() => {});
      await page.evaluate((id) => document.querySelector("#b-" + CSS.escape(id) + " .vstage").vizDone(), b.id);
      ok++;
    } else if (b.type === "project") {
      for (const cb of await el.locator(".miles input").all()) await cb.check();
      await el.locator("button:has-text('I built it')").click();
      ok++;
    } else if (b.type === "recall") {
      await el.locator("button:has-text('Compare')").click();
      await el.locator("button:has-text('Nailed it')").click();
      ok++;
    }
  }
  const gate = page.locator(".gate button.primary");
  await page.waitForFunction(() => { const g = document.querySelector(".gate button.primary"); return g && !g.disabled; }, null, { timeout: 15000 }).catch(() => {});
  if (await gate.isDisabled()) bad.push("gate still locked after step: " + s.title);
  await gate.click();
  }
  await page.locator(".finale").waitFor({ timeout: 5000 }).catch(() => bad.push("no chapter-complete screen"));
  await page.screenshot({ path: `${shots}/${track}-ch${chap}.png`, fullPage: false });
  const prog = await page.locator(".meta .pill").nth(1).innerText();
  console.log(`${track} ch${chap}: ${ok} blocks worked, ${bad.length} failed; header after reload would show progress; pill=${prog}`);
  bad.forEach((b) => console.log("  FAIL " + b));
  errors.forEach((e) => console.log("  " + e));
  await browser.close();
  process.exit(bad.length || errors.length ? 1 : 0);
})();
// The design studio: every level's start must miss the target and its answer must match it.
//   node tools/e2e.js design
async function studio(page, browser, errors) {
  await page.goto(`${BASE}/design/studio.html#1`);
  await page.waitForSelector(".meter");
  const n = await page.locator("#map a").count();
  const bad = [];
  for (let i = 1; i <= n; i++) {
    await page.evaluate((k) => { location.hash = "#" + k; }, i);
    await page.waitForFunction((k) => document.querySelector(`#map a[href="#${k}"].cur`), i);
    const title = await page.locator(".brief h1").innerText();
    const won = async (css) => {
      await page.evaluate((c) => document.querySelector("#table").dzSet(c), css);
      await page.waitForTimeout(1100);
      return page.evaluate(() => [document.querySelector(".meter").classList.contains("won"), document.querySelector(".pct").textContent]);
    };
    const [startWon, s0] = await won(await page.evaluate(() => document.querySelector("#table").dzStart()));
    const [answerWon, s1] = await won(await page.evaluate(() => document.querySelector("#table").dzAnswer()));
    if (startWon) bad.push(`${i} ${title}: the start already matches (${s0})`);
    if (!answerWon) bad.push(`${i} ${title}: the answer doesn't match (${s1})`);
  }
  console.log(`design: ${n} levels checked, ${bad.length} failed`);
  bad.forEach((b) => console.log("  FAIL " + b));
  errors.forEach((e) => console.log("  " + e));
  await browser.close();
  process.exit(bad.length || errors.length ? 1 : 0);
}
// Workbench: every ticket of a project, through the real buttons. The starting code must fail Test,
// the reference solution must pass it and commit, and each session transcript must replay in the terminal.
//   node tools/e2e.js workbench [project number]
async function workbench(page, browser, errors) {
  const num = process.argv[3] || "1";
  await page.goto(`${BASE}/workbench/bench.html?runner=local#${num}`);
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("vnl-code-v1") || "{}"); s.wb = {}; localStorage.setItem("vnl-code-v1", JSON.stringify(s)); });
  await page.reload();
  await page.waitForSelector(".wact .run");
  const data = await page.evaluate(async () => (await (await fetch("/content/wb.json")).json()));
  const proj = data.projects.find((p) => String(p.num) === num);
  const bad = [];
  const lines = () => page.locator(".term .ln").count();
  // a command's reply: the out/err lines after its own echoed command line
  const term = async (line) => {
    const before = await page.locator(".term .ln.cmd").count();
    await page.locator(".term .inp input").fill(line);
    await page.locator(".term .inp input").press("Enter");
    await page.waitForFunction((n) => document.querySelectorAll(".term .ln.cmd").length > n && document.querySelector(".term .inp:not(.off)"), before);
    return page.evaluate(() => {
      const ls = [...document.querySelectorAll(".term .ln")];
      const at = ls.map((e) => e.classList.contains("cmd")).lastIndexOf(true);
      return ls.slice(at + 1).filter((e) => e.matches(".out,.err")).map((e) => e.textContent);
    });
  };
  const starts = () => page.evaluate(() => [...document.querySelectorAll(".term .ln.sys")].filter((e) => /▶|↻/.test(e.textContent)).length);
  const runProg = async () => {
    const k = await starts();
    await page.locator(".wact .run").click();
    await page.waitForFunction((k) => [...document.querySelectorAll(".term .ln.sys")].filter((e) => /▶|↻/.test(e.textContent)).length > k && document.querySelector(".term .inp:not(.off)"), k);
  };
  const test = async () => {
    await page.locator(".wact .test").click();
    await page.waitForSelector(".lamps", { timeout: 20000 });
    return page.locator(".wact .commit").isEnabled();
  };
  for (const [i, t] of proj.tickets.entries()) {
    await page.waitForFunction((k) => (document.querySelector(".tk-no") || {}).textContent?.includes("#" + k), i + 1);
    if (await test()) bad.push(`${t.id}: the starting code passes Test`);
    for (const [f, src] of Object.entries(t.solution)) await page.evaluate(([f, src]) => document.querySelector("#ide").wbSet(f, src), [f, src]);
    if (!(await test())) bad.push(`${t.id}: the solution doesn't pass Test: ` + (await page.locator(".fail").first().innerText().catch(() => "")).slice(0, 300));
    // the session transcript, typed into the terminal, from an empty disk like the build's replay
    await page.evaluate((pid) => fetch("/__run", { method: "POST", body: JSON.stringify({ op: "project_load", pid, files: {}, main: "nothing", wipe: true }) }), proj.id);
    await page.locator(".ptabs button", { hasText: "Terminal" }).click();
    await runProg();
    let want = null, cmd = null;
    const check = async () => {
      if (cmd === null) return;
      if (cmd === "!restart") {
        const n = await lines();
        await page.locator(".ptabs .act", { hasText: "restart" }).click();
        await page.waitForFunction((k) => document.querySelectorAll(".term .ln").length > k, n);
        return;
      }
      const got = (await term(cmd)).join("\n");
      if (got !== want.join("\n")) bad.push(`${t.id}: terminal "${cmd}" printed ${JSON.stringify(got)}, expected ${JSON.stringify(want.join("\n"))}`);
    };
    for (const line of t.session.split("\n")) {
      if (line.startsWith(proj.prompt) || line === "!restart") { await check(); cmd = line.startsWith(proj.prompt) ? line.slice(proj.prompt.length) : line; want = []; }
      else if (cmd !== null) want.push(line);
    }
    await check();
    await page.screenshot({ path: `${shots}/workbench-${t.id}.png` });
    await page.locator(".wact .commit").click();
    await page.locator(".csheet input").press("Enter");
  }
  // the finale: write, pull the plug, and read the data back
  await page.waitForSelector(".wfin");
  await runProg();
  await term("SET survivor yes");
  await term("SET doomed maybe");
  await page.locator(".ptabs .act.plug").click();
  await page.waitForFunction(() => /power back on/.test(document.querySelector(".term").textContent));
  const a = (await term("GET survivor")).join(), b = (await term("GET doomed")).join();
  if (a !== "yes" || b !== "(nil)") bad.push(`pull the plug: survivor=${a}, doomed=${b} (want yes, (nil))`);
  const commits = await page.locator(".hist li").count();
  if (commits !== proj.tickets.length) bad.push(`history shows ${commits} commits, want ${proj.tickets.length}`);
  await page.screenshot({ path: `${shots}/workbench-done.png` });
  // the download: a real zip whose run.py answers the same commands with plain Python, no browser
  {
    const fs = require("fs"), os = require("os"), path = require("path"), { execFileSync } = require("child_process");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.locator(".wdl-big").click()]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wbzip-")), zipPath = path.join(dir, dl.suggestedFilename());
    await dl.saveAs(zipPath);
    const name = proj.title.toLowerCase();
    try {
      execFileSync("python3", ["-c", "import sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; z.extractall(sys.argv[2])", zipPath, dir]);
      const out = execFileSync("python3", ["run.py"], { cwd: path.join(dir, name), input: "SET a 1\nMULTI\nINCR n\nINCR n\nEXEC\nGET a\n" }).toString();
      if (!/OK[\s\S]*1\) 1\n2\) 2[\s\S]*\b1\b/.test(out)) bad.push(`the downloaded ${name}.zip ran, but printed ${JSON.stringify(out)}`);
      const again = execFileSync("python3", ["run.py"], { cwd: path.join(dir, name), input: "GET n\n" }).toString();
      if (!again.includes("2")) bad.push(`the downloaded ${name} lost its data across a restart: ${JSON.stringify(again)}`);
    } catch (e) { bad.push(`the downloaded ${name}.zip doesn't run: ${String(e.stderr || e).slice(0, 300)}`); }
  }
  console.log(`workbench ${proj.title}: ${proj.tickets.length} tickets driven, ${bad.length} failed`);
  bad.forEach((b) => console.log("  FAIL " + b));
  errors.forEach((e) => console.log("  " + e));
  await browser.close();
  process.exit(bad.length || errors.length ? 1 : 0);
}
// Wind Tunnel: every live experiment through the page. Lock a guess, open the answer, start the task; the starting
// server must not meet the goal in 60 simulated seconds, and the reference answer must meet it within 120.
//   node tools/e2e.js tunnel
async function tunnel(page, browser, errors) {
  await page.goto(`${BASE}/tunnel/lab.html#1`);
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("vnl-code-v1") || "{}"); s.wt = {}; for (const k in s.done || {}) if (k.startsWith("wt")) delete s.done[k]; localStorage.setItem("vnl-code-v1", JSON.stringify(s)); });
  const X = await page.evaluate(() => window.WT.experiments.map((x, i) => ({ n: i + 1, id: x.id, live: !!x.live, title: x.title, ref: x.task && x.task.reference })));
  const bad = [];
  let n = 0;
  for (const x of X.filter((x) => x.live)) {
    await page.goto(`${BASE}/tunnel/lab.html#${x.n}`);
    await page.reload();
    await page.waitForSelector(".wt-step.now .pin");
    await page.locator(".wt-step.now .pin").press("ArrowRight");
    await page.locator(".wt-go", { hasText: "Lock in" }).click();
    await page.locator(".wt-link", { hasText: "Show me now" }).click();
    await page.locator(".wt-go", { hasText: "→" }).click();
    const st = () => page.evaluate(() => document.querySelector("#wt").wtState());
    if ((await st()).phase !== "task") bad.push(`${x.id}: the task didn't start`);
    await page.evaluate(() => document.querySelector("#wt").wtRun(60));
    if ((await st()).done) bad.push(`${x.id}: the starting server already meets the goal`);
    // the reference answer, through the page's own gestures
    const ref = x.ref;
    if (ref.workers !== undefined) {
      await page.locator(".wt-server").first().click();
      for (let i = (await st()).cfg.workers; i < ref.workers; i++) await page.locator(".wt-insp .step", { hasText: "+" }).click();
    }
    if (ref.servers !== undefined) {
      // the first extra server is dragged from the parts tray onto the stage; any more are clicked on
      const g = page.locator(".wt-parts .ghost.server"), stage = page.locator(".wt-stage");
      for (let i = (await st()).cfg.servers; i < ref.servers; i++) {
        if (i === (await st()).cfg.servers && !x.dragged) {
          const a = await g.boundingBox(), b = await stage.boundingBox();
          await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
          await page.mouse.down();
          await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.5, { steps: 8 });
          await page.mouse.up();
          x.dragged = true;
          if ((await st()).cfg.servers !== i + 1) bad.push(`${x.id}: dragging a server onto the wire didn't add one`);
        } else await g.click();
      }
    }
    if (ref.lb !== undefined) for (let i = 0; i < 3 && (await st()).cfg.lb !== ref.lb; i++) await page.locator(".wt-lbtag").click();
    if (ref.cache !== undefined) {
      await page.locator(".wt-ctag").click();
      for (let i = 0; i < 12 && (await st()).cfg.cache < ref.cache; i++) await page.locator(".wt-insp .step", { hasText: "+" }).click();
    }
    const got = (await st()).cfg;
    for (const k in ref) if (got[k] !== ref[k]) bad.push(`${x.id}: couldn't set ${k} to ${ref[k]} through the page (it's ${got[k]})`);
    if (!(await page.locator(".wt-code .y-l.add").count())) bad.push(`${x.id}: system.yaml shows no change after the fix`);
    for (let i = 0; i < 24 && !(await st()).done; i++) await page.evaluate(() => document.querySelector("#wt").wtRun(10));
    const s = await st();
    if (!s.done) bad.push(`${x.id}: the reference ${JSON.stringify(ref)} didn't meet the goal`);
    if (!(await page.locator(".won").count())) bad.push(`${x.id}: no done note`);
    await page.screenshot({ path: `${shots}/tunnel-${x.id}.png` });
    n++;
  }
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("vnl-code-v1") || "{}").done || {});
  for (const x of X.filter((x) => x.live)) if (!kept[x.id]) bad.push(`${x.id}: not saved as done`);
  console.log(`tunnel: ${n} experiments driven, ${bad.length} failed`);
  bad.forEach((b) => console.log("  FAIL " + b));
  errors.forEach((e) => console.log("  " + e));
  await browser.close();
  process.exit(bad.length || errors.length ? 1 : 0);
}
function CSS_escape(s) { return s.replace(/([^a-zA-Z0-9_-])/g, "\\$1"); }
