// Eye self-test: runs every trial with random answers on three screen sizes, then checks the reveal.
// Fails on broken text (NaN, undefined) and on canvas labels that leave the canvas or overlap.
// Usage: serve the site (python3 -m http.server 8765), then: node tools/eye-selftest.js [runs]
// Set CHANNEL=chrome to use the installed Chrome instead of Playwright's own browser.
const { chromium } = require("playwright");
const SIZES = [[1280,720],[390,844],[844,390]], RUNS = +(process.argv[2]||4);
(async () => {
  const b = await chromium.launch({ headless: true, channel: process.env.CHANNEL });
  const bad = [];
  for (const [w,h] of SIZES) {
    const ctx = await b.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:2, reducedMotion:"reduce" });
    const p = await ctx.newPage(); const errs=[]; p.on("pageerror",e=>errs.push(e.message));
    await p.addInitScript(() => {
      const P = CanvasRenderingContext2D.prototype, fill = P.fillText, clr = P.clearRect;
      window.__T = [];
      P.clearRect = function (...a) { if (this.canvas.id === "cv") window.__T = []; return clr.apply(this, a); };
      P.fillText = function (t, x, y, ...r) {
        if (this.canvas.id === "cv" && String(t).trim() && parseFloat((this.font.match(/(\d+(?:\.\d+)?)px/) || [0, 0])[1]) < 80) {
          const m = this.measureText(t), M = this.getTransform();
          const x0 = x - m.actualBoundingBoxLeft, x1 = x + m.actualBoundingBoxRight, y0 = y - m.actualBoundingBoxAscent, y1 = y + m.actualBoundingBoxDescent;
          const P4 = [[x0,y0],[x1,y0],[x0,y1],[x1,y1]].map(([u,v]) => [M.a*u+M.c*v+M.e, M.b*u+M.d*v+M.f]);
          window.__T.push({ t: String(t), a: this.globalAlpha, b: [Math.min(...P4.map(q=>q[0])), Math.min(...P4.map(q=>q[1])), Math.max(...P4.map(q=>q[0])), Math.max(...P4.map(q=>q[1]))] });
        }
        return fill.call(this, t, x, y, ...r);
      };
    });
    await p.goto((process.env.BASE || "http://localhost:8765") + "/eye/"); await p.waitForTimeout(1500);
    const n = await p.evaluate(() => EYE.flat.length);
    for (let i = 0; i < n; i++) for (let run = 0; run < RUNS; run++) {
      const r = await p.evaluate(async ([i, run]) => {
        EYE.start(i); const T = EYE.T;
        if (run > 0) for (let k = 0; k < 6; k++) {
          const pt = [Math.random()*1000, Math.random()*1000], hd = T.grab ? T.grab(pt) : 0;
          T.move(hd, (Math.random()-.5)*(run*300), (Math.random()-.5)*(run*300), pt); T.s.moved = true;
        }
        EYE.commit(); await new Promise(r => setTimeout(r, 120));
        const cv = document.getElementById("cv"), W = cv.width, H = cv.height, L = window.__T.filter(l => l.a > 0.05);
        const out = [], say = document.getElementById("say").textContent;
        if (/NaN|undefined|Infinity|null|\[object/.test(say)) out.push("text: " + say.slice(0, 160));
        for (const l of L) { const [a,b2,c,d] = l.b; if (a < -1 || b2 < -1 || c > W+1 || d > H+1) out.push(`outside: "${l.t}" ${l.b.map(Math.round)}`); if (/NaN|undefined|Infinity/.test(l.t)) out.push(`label text: "${l.t}"`); }
        for (let x = 0; x < L.length; x++) for (let y = x+1; y < L.length; y++) {
          const A = L[x].b, B = L[y].b, ix = Math.min(A[2],B[2]) - Math.max(A[0],B[0]), iy = Math.min(A[3],B[3]) - Math.max(A[1],B[1]);
          if (ix > 3 && iy > 3 && L[x].t !== L[y].t) out.push(`overlap: "${L[x].t}" × "${L[y].t}"`);
        }
        return { id: T.id, out };
      }, [i, run]);
      for (const o of r.out) bad.push(`${w}x${h} ${r.id} run${run}: ${o}`);
    }
    if (errs.length) bad.push(`${w}x${h} page errors: ${errs.join(" | ")}`);
    await ctx.close();
  }
  await b.close();
  const uniq = [...new Set(bad.map(s => s.replace(/ run\d+/, "")))];
  console.log(uniq.length ? uniq.join("\n") : "ALL CLEAR"); console.log(`${uniq.length} distinct problems`); process.exit(uniq.length ? 1 : 0);
})();

