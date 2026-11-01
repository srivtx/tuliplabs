// End-to-end check of the code tracks with the local Python runner.
//   python3 tools/devserver.py 8765 &   then   node tools/e2e.js [track] [chapter]
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:8765";
const track = process.argv[2] || "code";
const chap = process.argv[3] || "1";
const shots = process.env.SHOTS || ".";
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts.g|Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
  await page.goto(`${BASE}/${track}/?runner=local#${chap}`);
  await page.waitForSelector(".stephead");
  const data = await page.evaluate(async (t) => (await (await fetch(`/content/${t}.json`)).json()), track === "code" ? "tc" : "ms");
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
        await el.locator(".pz ol").first().locator("button.ln", { hasText: line.trim() }).filter({ hasText: new RegExp("^" + escapeRe(line) + "$") }).first().click();
      }
      await el.locator("button:has-text('Check order')").click();
      await el.locator(".result").waitFor();
      (await el.locator(".result.pass").count()) ? ok++ : bad.push(b.id + " parsons not accepted");
    } else if (b.type === "quiz") {
      await el.locator(".opt").first().click();
      await el.locator(".why p").first().waitFor();
      ok++;
    } else if (b.type === "recall") {
      await el.locator("button:has-text('Compare')").click();
      await el.locator("button:has-text('Nailed it')").click();
      ok++;
    }
  }
  const gate = page.locator(".gate button.primary");
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
function CSS_escape(s) { return s.replace(/([^a-zA-Z0-9_-])/g, "\\$1"); }
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
