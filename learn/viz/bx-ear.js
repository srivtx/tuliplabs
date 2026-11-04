/* Build your own X, chapter 46: the ear takes sound apart.
   The air only carries one wiggly line. A bank of 49 tuned reeds, one per semitone, turns it back
   into separate notes: each reed is a complex one-pole filter, so it rings only when its own
   frequency arrives, and the size of its swing is one row of the picture. That's a Fourier
   transform done by physics, and it's roughly what the cochlea does.
   The "why": a sharper reed tells frequencies apart better but takes longer to start and stop, so
   it blurs time. A loose reed is the opposite. You can't have both: this trade-off is the same
   mathematics as the uncertainty principle in quantum physics. */
VIZ.register("bx-ear", async (api) => {
  const FS = 8000, SECS = 2, LEN = FS * SECS, REEDS = 49, LOW = 110, SPAN = 1.25;
  const TAU = Math.PI * 2;
  const freq = Array.from({ length: REEDS }, (_, i) => LOW * 2 ** (i / 12));
  const zr = new Float64Array(REEDS), zi = new Float64Array(REEDS), amp = new Float64Array(REEDS);
  const cr = new Float64Array(REEDS), ci = new Float64Array(REEDS), gain = new Float64Array(REEDS);
  const sig = new Float32Array(LEN);
  let source = "chord", sharp = 5, pos = 0, hidden = [], found = new Set(), reached = api.wasDone;
  let ac = null, node = null, guard = 0, onScreen = true, level = 1, seed = (Math.random() * 1e9) | 0;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

  function tune() {
    for (let i = 0; i < REEDS; i++) {
      const th = (TAU * freq[i]) / FS, r = Math.exp(-(Math.PI * freq[i]) / (sharp * FS));
      cr[i] = r * Math.cos(th); ci[i] = r * Math.sin(th); gain[i] = 1 - r;
    }
  }
  function newChord() {
    const low = 4 + Math.floor(rnd() * 8);
    const near = low + 12 + Math.floor(rnd() * 8);
    hidden = [low, near, near + 2];
    found = new Set();
  }
  function render() {
    sig.fill(0);
    if (source === "chord") {
      for (const i of hidden) {
        const f = Math.round(freq[i]);
        for (let n = 0; n < LEN; n++) sig[n] += Math.sin((TAU * f * n) / FS) / 3;
      }
      level = 3;
    } else if (source === "clicks") {
      for (let c = 0; c < 8; c++) {
        const at = Math.round((c + 0.5) * (LEN / 8));
        for (let k = 0; k < 4; k++) sig[at + k] = (k % 2 ? -1 : 1) * (1 - k / 4);
      }
      level = 14;
    } else {
      let ph = 0;
      for (let n = 0; n < LEN; n++) {
        const u = n / LEN, tri = u < 0.5 ? u * 2 : 2 - u * 2;
        ph += (TAU * 180 * 2 ** (tri * 3)) / FS;
        sig[n] = Math.sin(ph) * 0.8;
      }
      level = 1.25;
    }
    if (node) { stopSound(); startSound(); }
  }
  function startSound() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { api.status("This browser can't play sound, but the picture still works."); return false; }
    ac = ac || new AC();
    if (ac.state === "suspended") ac.resume();
    const buf = ac.createBuffer(1, LEN, FS);
    buf.copyToChannel(sig, 0);
    node = ac.createBufferSource(); node.buffer = buf; node.loop = true;
    const g = ac.createGain(); g.gain.value = 0.18;
    node.connect(g).connect(ac.destination);
    node.start();
    // a looping sound must not outlive the page it belongs to
    guard = setInterval(() => { if (!cv.canvas.isConnected || !onScreen) { stopSound(); hear.textContent = "Hear it"; } }, 400);
    return true;
  }
  function stopSound() { if (node) { node.stop(); node.disconnect(); node = null; } clearInterval(guard); }

  // The picture: new columns are drawn into a strip, which scrolls left.
  const strip = document.createElement("canvas");
  const sg = strip.getContext("2d");
  let sw = 0, sh = 0, colAcc = 0;
  function lay(w, h) {
    const top = 24, waveH = Math.round(h * 0.18), barW = Math.min(64, Math.round(w * 0.14)), labelW = 40, specY = top + waveH + 10;
    return { wave: { x: 0, y: top, w, h: waveH }, spec: { x: labelW, y: specY, w: w - labelW - barW - 6, h: h - specY - 6 }, barX: w - barW, barW };
  }
  const rowY = (S, i) => S.y + S.h - ((i + 0.5) / REEDS) * S.h;
  const shown = (v) => Math.min(1, v * 2 * level) ** 0.8;

  function pushColumn(S) {
    if (sw !== Math.round(S.w) || sh !== Math.round(S.h)) {
      sw = strip.width = Math.round(S.w); sh = strip.height = Math.round(S.h);
    }
    sg.globalCompositeOperation = "copy";
    sg.drawImage(strip, -1, 0);
    sg.globalCompositeOperation = "source-over";
    sg.fillStyle = api.color("c2");
    for (let i = 0; i < REEDS; i++) {
      const v = shown(amp[i]);
      if (v < 0.05) continue;
      const y0 = Math.round(sh - ((i + 1) / REEDS) * sh), y1 = Math.round(sh - (i / REEDS) * sh);
      sg.globalAlpha = v;
      sg.fillRect(sw - 1, y0, 1, y1 - y0);
    }
    sg.globalAlpha = 1;
  }

  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const L = lay(w, h), S = L.spec, muted = api.color("muted"), line = api.color("line"), c1 = api.color("c1"), c3 = api.color("c3");
    g.font = "11px 'IBM Plex Mono', monospace"; g.textAlign = "left"; g.fillStyle = muted;
    g.fillText("what the air does", L.wave.x, L.wave.y + 8);
    // the last 30 ms of the signal
    const span = Math.round(FS * 0.03), midY = L.wave.y + 10 + (L.wave.h - 10) / 2, half = (L.wave.h - 10) / 2;
    g.strokeStyle = c1; g.lineWidth = 1.4; g.beginPath();
    for (let k = 0; k < span; k++) {
      const x = L.wave.x + (k / (span - 1)) * L.wave.w, s = sig[(pos - span + k + LEN) % LEN];
      const y = midY - Math.max(-1, Math.min(1, s)) * half;
      k ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
    // the time-by-pitch picture
    g.strokeStyle = line; g.lineWidth = 1; g.strokeRect(S.x + 0.5, S.y + 0.5, S.w, S.h);
    if (sw) g.drawImage(strip, S.x, S.y);
    g.fillStyle = muted; g.textAlign = "right";
    for (const i of [12, 24, 36, 48]) g.fillText(String(Math.round(freq[i])), S.x - 5, Math.max(S.y + 9, Math.min(S.y + S.h - 1, rowY(S, i) + 4)));
    // the reeds, right now
    const bx = L.barX, rowH = S.h / REEDS;
    g.fillStyle = api.color("c2");
    for (let i = 0; i < REEDS; i++) {
      const v = shown(amp[i]);
      g.fillRect(bx, rowY(S, i) - rowH / 2 + 0.5, Math.max(1, v * L.barW), Math.max(1, rowH - 1));
    }
    // notes you've named
    g.textAlign = "left";
    if (source === "chord") [...found].sort((p, q) => p - q).forEach((i, k) => {
      const y = rowY(S, i);
      g.strokeStyle = c3; g.lineWidth = 1.5; g.beginPath(); g.moveTo(S.x, y); g.lineTo(S.x + S.w, y); g.stroke();
      g.fillStyle = c3; g.font = "600 11px 'IBM Plex Mono', monospace";
      g.fillText(`${Math.round(freq[i])} Hz`, S.x + 6 + k * 58, y - 4);
    });
    g.font = "11px 'IBM Plex Mono', monospace";
  });
  cv.canvas.style.cursor = "pointer";
  new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; }).observe(cv.canvas);

  function peaks() {
    let top = 0; const r = [];
    for (let i = 0; i < REEDS; i++) top = Math.max(top, amp[i]);
    for (let i = 0; i < REEDS; i++) {
      const l = i ? amp[i - 1] : 0, n = i < REEDS - 1 ? amp[i + 1] : 0;
      if (amp[i] >= l && amp[i] >= n && amp[i] > top * 0.35) r.push(i);
    }
    return r;
  }
  function tell() {
    if (source !== "chord") return;
    api.status(`${found.size} of 3 hidden notes named. Tap a bright line in the picture.`);
  }
  cv.canvas.addEventListener("pointerdown", (e) => {
    if (!cv.w || source !== "chord") return;
    const r = cv.canvas.getBoundingClientRect(), y = e.clientY - r.top, S = lay(cv.w, cv.h).spec;
    const tapped = ((S.y + S.h - y) / S.h) * REEDS - 0.5;
    let best = -1, gap = 4;
    for (const p of peaks()) if (Math.abs(p - tapped) < gap) { gap = Math.abs(p - tapped); best = p; }
    if (best < 0) { api.status("Nothing is ringing there. Tap a bright line."); return; }
    const closePair = best === hidden[1] || best === hidden[2];
    if (!hidden.includes(best) || (closePair && sharp < 12)) {
      api.status(`That's a blur around ${Math.round(freq[best])} Hz, too wide to name. Could it be two notes? Try sharper reeds.`);
      return;
    }
    found.add(best);
    tell();
    if (found.size === 3) {
      api.explain("Unmixed", `<p>The air carried one wiggly line. You got ${hidden.map((i) => Math.round(freq[i])).join(", ")} Hz back out of it, and two of them were only sitting two semitones apart. Loose reeds smeared them into one.</p><p>Now switch to <b>Clicks</b> and move the slider both ways.</p>`);
      if (!reached) { reached = true; api.done("One line of air, three notes back out. That's a Fourier transform, and your ear does it all day"); }
    }
    cv.redraw();
  });

  api.loop((dt) => {
    if (!cv.w) return;
    const S = lay(cv.w, cv.h).spec, perCol = (FS * SPAN) / S.w;
    const n = Math.min(Math.round(dt * FS), FS / 8);
    for (let k = 0; k < n; k++) {
      const s = sig[pos];
      pos = pos + 1 === LEN ? 0 : pos + 1;
      for (let i = 0; i < REEDS; i++) {
        const a = zr[i], b = zi[i];
        zr[i] = cr[i] * a - ci[i] * b + gain[i] * s;
        zi[i] = ci[i] * a + cr[i] * b;
      }
      if (++colAcc >= perCol) {
        colAcc -= perCol;
        for (let i = 0; i < REEDS; i++) amp[i] = Math.hypot(zr[i], zi[i]);
        pushColumn(S);
      }
    }
    cv.redraw();
    const ms = Math.round((1000 * sharp) / (Math.PI * 440));
    api.hud(`Sharpness ${sharp} · settles in <b>${ms} ms</b> at 440 Hz`);
  });

  const row = api.row();
  const hear = api.button("Hear it", () => {
    if (node) { stopSound(); hear.textContent = "Hear it"; }
    else if (startSound()) hear.textContent = "Stop sound";
  }, { row });
  api.button("New chord", () => {
    newChord();
    if (source === "chord") render();
    tell();
    cv.redraw();
  }, { row });
  api.seg([{ label: "Mystery chord", value: "chord" }, { label: "Clicks", value: "clicks" }, { label: "Sliding whistle", value: "slide" }], "chord", (v) => {
    source = v; render();
    if (v === "chord") { api.explain("Three notes, one line", "<p>Three sine waves are hidden in the red line. You can't see them there. The picture below shows what each reed is doing: <b>up</b> is higher pitch, and <b>across</b> is time.</p>"); tell(); }
    else if (v === "clicks") { api.explain("A click is every frequency at once", "<p>A click is so short that every reed feels it, so it shows as a tall line. With <b>loose</b> reeds the line is crisp: you know exactly <b>when</b>. With <b>sharp</b> reeds each one rings on after the click, and the line smears sideways. You've lost the when.</p>"); api.status("Move the sharpness slider and watch the clicks smear."); }
    else { api.explain("Pitch that moves", "<p>A note that changes is the hard case. Sharp reeds know the pitch but lag behind it. Loose reeds keep up but blur the pitch. Speech recognition, sonar and music apps all have to choose a point on this trade-off.</p>"); api.status("Move the sharpness slider and watch the curve thicken or lag."); }
  });
  api.slider("Reed sharpness", { min: 3, max: 60, step: 1, value: sharp }, (v) => { sharp = v; tune(); });
  api.explain("Three notes, one line", "<p>A microphone or an eardrum only ever gets one thing: a single line going up and down. Three notes are hidden in the red line, and you can't see them in it.</p><p>The reeds can. Each one swings only for its own pitch. <b>Tap the bright lines</b> to name the notes. Only two bright lines? Something's blurred together.</p>");
  newChord(); tune(); render(); tell();
});
