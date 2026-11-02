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
      await page.waitForTimeout(700);
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
function CSS_escape(s) { return s.replace(/([^a-zA-Z0-9_-])/g, "\\$1"); }
