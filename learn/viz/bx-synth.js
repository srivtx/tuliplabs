/* Build your own X, chapter 46: every sound is a stack of sine waves.
   Twelve bars set how loud each multiple of one base frequency is. The wave is simply their sum,
   and the keys play exactly that sum through the speakers, using the same twelve numbers.
   The "why": a flute and a violin playing the same note differ only in these bars. And pitch isn't
   the lowest sine: it's how often the whole pattern repeats. Remove the lowest bar and the pattern
   still repeats at the same rate, so you still hear the same note, even though that frequency
   isn't there any more. Your brain fills it in. */
VIZ.register("bx-synth", async (api) => {
  const NH = 12, BASE = 220, TAU = Math.PI * 2;
  const NOTES = ["A", "", "B", "C", "", "D", "", "E", "F", "", "G", "", "A"];
  const a = new Float64Array(NH); a[0] = 1;
  const PTS = 512;
  let reached = api.wasDone, match = 0, attack = 15, release = 250;
  let ac = null, osc = null, amp = null, heldKey = -1, dragging = false;

  const active = () => { const r = []; for (let i = 0; i < NH; i++) if (a[i] > 0.01) r.push(i + 1); return r; };
  const gcd = (p, q) => (q ? gcd(q, p % q) : p);
  const repeats = () => active().reduce(gcd, 0);
  const sum = (x) => { let y = 0; for (let i = 0; i < NH; i++) if (a[i]) y += a[i] * Math.sin(TAU * (i + 1) * x); return y; };
  function score() {
    let yy = 0, ys = 0, ss = 0;
    for (let k = 0; k < PTS; k++) {
      const x = (k + 0.5) / PTS, y = sum(x), s = x < 0.5 ? 1 : -1;
      yy += y * y; ys += y * s; ss += 1;
    }
    return yy ? ys / Math.sqrt(yy * ss) : 0;
  }

  // ---- sound ----
  function periodic() {
    const re = new Float32Array(NH + 1), im = new Float32Array(NH + 1);
    for (let i = 0; i < NH; i++) im[i + 1] = a[i];
    return ac.createPeriodicWave(re, im);
  }
  function press(k) {
    if (!active().length) { api.status("Every bar is at zero, so there's nothing to hear."); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { api.status("This browser can't play sound, but the picture still works."); return; }
    ac = ac || new AC();
    if (ac.state === "suspended") ac.resume();
    lift();
    const t = ac.currentTime;
    osc = ac.createOscillator(); amp = ac.createGain();
    osc.setPeriodicWave(periodic());
    osc.frequency.value = BASE * 2 ** (k / 12);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(0.16, t + Math.max(0.005, attack / 1000));
    osc.connect(amp).connect(ac.destination);
    osc.start();
    heldKey = k;
  }
  function lift() {
    if (!osc) return;
    const t = ac.currentTime, o = osc, g = amp, r = Math.max(0.01, release / 1000);
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
    g.gain.linearRampToValueAtTime(0.0001, t + r);
    o.stop(t + r + 0.02);
    osc = null; amp = null; heldKey = -1;
  }
  const retune = () => { if (osc && active().length) osc.setPeriodicWave(periodic()); };

  // ---- layout ----
  function lay(w, h) {
    const keyH = 46, gap = 12, top = 24, body = h - keyH - gap - top;
    const keys = { x: 0, y: h - keyH, w, h: keyH };
    if (w < 520) {
      const waveH = Math.round(body * 0.5);
      return { wave: { x: 0, y: top, w, h: waveH }, bars: { x: 0, y: top + waveH + gap, w, h: body - waveH - gap }, keys };
    }
    const barsW = Math.round(w * 0.38);
    return { bars: { x: 0, y: top, w: barsW, h: body }, wave: { x: barsW + 24, y: top, w: w - barsW - 24, h: body }, keys };
  }

  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const L = lay(w, h), ink = api.color("ink"), muted = api.color("muted"), line = api.color("line");
    const c1 = api.color("c1"), c2 = api.color("c2"), c5 = api.color("c5");
    g.textAlign = "center";

    // the bars
    const B = L.bars, slot = B.w / NH, labelH = 16, barTop = B.y + 16, barBottom = B.y + B.h - labelH;
    g.fillStyle = muted; g.font = "11px 'IBM Plex Mono', monospace"; g.textAlign = "left";
    g.fillText("how loud each multiple is", B.x, B.y + 8);
    g.textAlign = "center";
    g.strokeStyle = line; g.lineWidth = 1;
    g.beginPath(); g.moveTo(B.x, barBottom + 0.5); g.lineTo(B.x + B.w, barBottom + 0.5); g.stroke();
    for (let i = 0; i < NH; i++) {
      const cx = B.x + slot * (i + 0.5), v = a[i], y = barBottom - v * (barBottom - barTop);
      g.fillStyle = v > 0.01 ? c2 : c5;
      g.fillRect(cx - Math.min(5, slot * 0.28), y, Math.min(10, slot * 0.56), barBottom - y);
      g.fillStyle = muted;
      g.fillText(`${i + 1}×`, cx, B.y + B.h - 3);
    }

    // the wave: faint parts underneath, the sum on top, the square as a ghost
    const V = L.wave, mid = V.y + 16 + (V.h - 16) / 2, half = (V.h - 16) / 2 - 4;
    let peak = 0;
    for (let k = 0; k < PTS; k++) peak = Math.max(peak, Math.abs(sum(k / PTS)));
    const scale = peak ? (half * 0.96) / peak : 0, cycles = 2;
    g.textAlign = "left"; g.fillStyle = muted;
    g.fillText("the wave, two repeats", V.x, V.y + 8);
    g.strokeStyle = line; g.beginPath(); g.moveTo(V.x, mid + 0.5); g.lineTo(V.x + V.w, mid + 0.5); g.stroke();
    const ghost = half * 0.8;
    g.strokeStyle = api.color("c4"); g.globalAlpha = 0.75; g.lineWidth = 1.5; g.setLineDash([5, 4]);
    g.beginPath();
    for (let c = 0; c < cycles; c++) {
      const x0 = V.x + (V.w * c) / cycles, x1 = x0 + V.w / cycles / 2, x2 = x0 + V.w / cycles;
      g[c ? "lineTo" : "moveTo"](x0, mid - ghost); g.lineTo(x1, mid - ghost); g.lineTo(x1, mid + ghost); g.lineTo(x2, mid + ghost);
      if (c < cycles - 1) g.lineTo(x2, mid - ghost);
    }
    g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    g.strokeStyle = c5; g.lineWidth = 1; g.globalAlpha = 0.5;
    for (const n of active()) {
      g.beginPath();
      for (let px = 0; px <= V.w; px += 2) {
        const y = mid - a[n - 1] * Math.sin((TAU * n * px * cycles) / V.w) * scale;
        px ? g.lineTo(V.x + px, y) : g.moveTo(V.x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1; g.strokeStyle = c1; g.lineWidth = 2.2;
    g.beginPath();
    for (let px = 0; px <= V.w; px++) {
      const y = mid - sum((px * cycles) / V.w) * scale;
      px ? g.lineTo(V.x + px, y) : g.moveTo(V.x, y);
    }
    g.stroke();

    // the keys
    const K = L.keys, kw = K.w / 13;
    g.lineWidth = 1; g.textAlign = "center";
    for (let i = 0; i < 13; i++) {
      const x = K.x + i * kw, sharp = !NOTES[i];
      if (i === heldKey) { g.fillStyle = c1; g.fillRect(x, K.y, kw, K.h); }
      else if (sharp) { g.fillStyle = c5; g.globalAlpha = 0.3; g.fillRect(x, K.y, kw, K.h); g.globalAlpha = 1; }
      g.strokeStyle = line; g.strokeRect(x + 0.5, K.y + 0.5, kw - 1, K.h - 1);
      if (!sharp) { g.fillStyle = i === heldKey ? api.color("card") : ink; g.font = "12px 'IBM Plex Mono', monospace"; g.fillText(NOTES[i], x + kw / 2, K.y + 18); }
    }
  });
  cv.canvas.style.touchAction = "none";

  function say() {
    const r = repeats();
    match = score();
    const m = Math.max(0, Math.round(match * 100));
    api.hud(r ? `Repeats <b>${BASE * r}</b> a second · ${m}% square` : "Silence");
    if (!reached && match >= 0.96) {
      reached = true;
      api.done("You built a square corner out of smooth curves. Every shape of wave is a stack of sines");
      api.explain("Corners are made of sines", "<p>Only the odd bars, each shorter than the last: 1, ⅓, ⅕, ⅐. The more you add, the sharper the corners get. A perfect corner needs infinitely many sines, which is why a square wave sounds so buzzy: it's full of high harmonics.</p><p>Now press <b>Drop the lowest</b>.</p>");
    }
    cv.redraw();
  }
  function setBar(p) {
    const B = lay(cv.w, cv.h).bars, top = B.y + 16, bottom = B.y + B.h - 16;
    const i = Math.floor(((p[0] - B.x) / B.w) * NH);
    if (i < 0 || i >= NH) return;
    let v = (bottom - p[1]) / (bottom - top);
    v = Math.max(0, Math.min(1, v));
    a[i] = v < 0.03 ? 0 : v;
    retune(); say();
  }
  const at = (e) => { const r = cv.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.canvas.addEventListener("pointerdown", (e) => {
    if (!cv.w) return;
    cv.canvas.setPointerCapture(e.pointerId);
    const p = at(e), L = lay(cv.w, cv.h);
    if (p[1] >= L.keys.y) { press(Math.min(12, Math.floor(p[0] / (L.keys.w / 13)))); cv.redraw(); return; }
    const B = L.bars;
    if (p[0] >= B.x && p[0] <= B.x + B.w && p[1] >= B.y && p[1] <= B.y + B.h) { dragging = true; setBar(p); }
  });
  cv.canvas.addEventListener("pointermove", (e) => { if (dragging) setBar(at(e)); });
  const up = () => { dragging = false; if (osc) { lift(); cv.redraw(); } };
  cv.canvas.addEventListener("pointerup", up);
  cv.canvas.addEventListener("pointercancel", up);

  let first = true;
  api.loop(() => { if (cv.w && first) { first = false; say(); } });

  function load(list) { a.fill(0); list.forEach((v, i) => { a[i] = v; }); retune(); say(); }
  const row = api.row();
  api.button("Pure sine", () => {
    load([1]);
    api.explain("One sine wave", "<p>The simplest sound there is: air moving back and forth smoothly at one rate. Almost nothing in nature sounds like this. It's the sound of a tuning fork or a hearing test.</p>");
  }, { row });
  api.button("Flute-like", () => {
    load([1, 0.32, 0.12, 0.05]);
    api.explain("Few harmonics", "<p>A flute's note is close to a plain sine with a little of its first few multiples. That's why it sounds pure and round. Press a key, then compare it with <b>Bowed string</b> on the same key.</p>");
  }, { row });
  api.button("Bowed string", () => {
    load(Array.from({ length: NH }, (_, i) => 1 / (i + 1)));
    api.explain("Many harmonics", "<p>A bow grips the string, slips, and grips again, which gives a sawtooth shape: every multiple, each a bit quieter. Same note as the flute, same repeat rate. The only difference between them is the bars. That difference is what we call <b>timbre</b>.</p>");
  }, { row });
  api.button("Drop the lowest", () => {
    if (active().length < 3) a.set(Array.from({ length: NH }, (_, i) => 1 / (i + 1)));
    a[0] = 0; retune(); say();
    api.explain("The note that isn't there", `<p>There's no ${BASE} in this sound any more, but look at the number on the picture: the pattern still repeats ${BASE * repeats()} times a second. Hold a key. You still hear the same note.</p><p>Your brain doesn't read the lowest sine. It measures how often the whole pattern repeats, and hears a pitch that isn't in the air. This is called the <b>missing fundamental</b>, and it's how a tiny phone speaker seems to play a bass line it physically can't make.</p>`);
    api.status("Hold a key. The lowest sine is gone, and the note hasn't moved.");
  }, { row });
  api.slider("Attack", { min: 0, max: 600, step: 5, value: attack, format: (v) => `${v} ms` }, (v) => { attack = v; });
  api.slider("Release", { min: 0, max: 1200, step: 10, value: release, format: (v) => `${v} ms` }, (v) => { release = v; });
  api.explain("Sound is air, moving", "<p>The red line is one pure sine. The dashed line is a square wave, all sharp corners. You can't draw a corner with a smooth curve, right?</p><p>Drag the bars to add sines at 2×, 3×, 4× the frequency, and see if your stack can reach the corners. Press a key at any time to hear it.</p>");
  api.status("Drag the bars. Hold a key to hear what you've made.");
});
