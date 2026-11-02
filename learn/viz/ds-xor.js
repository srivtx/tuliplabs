/* DSA, chapter 41: XOR and the number without a partner (LeetCode 136).
   21 numbers: every value appears twice except one. Which one?
   The "why": a tally (a hash map of counts) works, but it needs a slot for every distinct value: O(n)
   extra memory. XOR needs one number. x ^ x = 0 and x ^ 0 = x, and XOR doesn't care about order, so
   XOR-ing everything cancels every pair bit by bit, and only the loner is left. Each bit of the
   running total just flips whenever a number with that bit arrives. */
VIZ.register("ds-xor", async (api) => {
  const W = await api.world3d();
  const SEQ = [13, 40, 7, 21, 13, 58, 33, 7, 40, 21, 46, 58, 33, 9, 46, 27, 9, 27, 62, 62, 5], B = 6;
  let mode = "tally", gen = null, ops = 0, idx = -1, tally = new Map(), acc = 0, peak = 0, ans = null, hot = null, running = false, ran = {}, reached = false, line = "";
  function* tallyRun() {
    for (let i = 0; i < SEQ.length; i++) {
      idx = i; ops++; const x = SEQ[i]; hot = x;
      tally.set(x, (tally.get(x) || 0) + 1); peak = Math.max(peak, tally.size);
      yield `${x}: count is now ${tally.get(x)}. The tally has ${tally.size} slot${tally.size === 1 ? "" : "s"}`;
    }
    idx = -1;
    for (const [k, v] of tally) { ops++; hot = k; if (v === 1) { ans = k; yield `${k} was seen once: that's the loner`; break; } yield `${k} was seen ${v} times`; }
    hot = null;
    yield `answer ${ans}, using ${peak} slots of memory`;
  }
  function* xorRun() {
    peak = 1;
    for (let i = 0; i < SEQ.length; i++) {
      idx = i; ops++; const x = SEQ[i], was = acc; acc ^= x;
      yield `${was} ^ ${x} = ${acc}: ${x.toString(2).padStart(B, "0")} flips those bits of ${was.toString(2).padStart(B, "0")}, giving ${acc.toString(2).padStart(B, "0")}`;
    }
    idx = -1; ans = acc;
    yield `every pair cancelled out. ${acc} is left: the loner, using one number of memory`;
  }
  function draw() {
    const ta = mode === "tally";
    SEQ.forEach((x, i) => {
      W.box("s" + i, { x: -5 + (i % 11) * 1.0, y: i < 11 ? 3.7 : 2.9, z: 0, sx: 0.8, sy: 0.6, sz: 0.3, color: i === idx ? "c1" : idx < 0 && x === ans ? "c3" : i < idx || (idx < 0 && ans !== null) ? "c5" : "c2", glow: i === idx ? 0.35 : 0, opacity: (i < idx || (idx < 0 && ans !== null)) && x !== ans ? 0.4 : 0.92,
        label: String(x), labelSize: 0.24, labelUp: 0, info: { title: `Number ${i + 1}`, html: `<p>${x} = ${x.toString(2)} in binary.</p>` } });
    });
    const keys = [...tally.keys()];
    for (let k = 0; k < 11; k++) {
      const key = keys[k], c = tally.get(key);
      W.box("t" + k, { x: -5 + k * 1.0, y: 0.8, z: 0, sx: 0.85, sy: 0.85, sz: 0.25 + (c || 0) * 0.3, visible: ta && key !== undefined, color: key === hot ? "c1" : c === 1 && ans === key ? "c3" : "c4", opacity: 0.9,
        label: key !== undefined ? `${key}: ${c}` : "", labelSize: 0.2, labelUp: 0, info: { title: `Tally slot for ${key}`, html: `<p>Seen ${c} time${c === 1 ? "" : "s"}. One slot per distinct value: memory grows with the input.</p>` } });
    }
    const cur = idx >= 0 ? SEQ[idx] : 0;
    for (let b = 0; b < B; b++) {
      const x = 2.5 - b * 1.0, cb = (cur >> b) & 1, ab = (acc >> b) & 1;
      W.box("cb" + b, { x, y: 1.4, z: 0, sx: 0.8, sy: 0.8, sz: 0.3, visible: !ta && idx >= 0, color: cb ? "c1" : "c5", opacity: cb ? 0.9 : 0.35, label: String(cb), labelSize: 0.28, labelUp: 0, info: { title: `Bit ${b} (worth ${2 ** b}) of ${cur}`, html: "<p>A 1 here flips the same bit of the total.</p>" } });
      W.box("ab" + b, { x, y: -0.2, z: 0, sx: 0.8, sy: 0.8, sz: ab ? 0.7 : 0.3, visible: !ta, color: ab ? "c3" : "c5", opacity: ab ? 0.92 : 0.35, label: String(ab), labelSize: 0.28, labelUp: 0, info: { title: `Bit ${b} (worth ${2 ** b}) of the total`, html: "<p>Flips every time a number with this bit passes. Pairs flip it twice: back to where it was.</p>" } });
      W.label("bw" + b, ta ? "" : String(2 ** b), [x, -1.0, 0.3], { color: "muted", size: 0.2 });
    }
    W.label("lc", !ta && idx >= 0 ? `${cur}` : "", [-4.2, 1.4, 0.3], { color: "c1", size: 0.3 });
    W.label("la", ta ? "" : `total ${acc}`, [-4.2, -0.2, 0.3], { color: "c3", size: 0.3 });
  }
  function show() { api.status(`${mode === "tally" ? "tally every value" : "XOR everything"} · ${ops} step${ops === 1 ? "" : "s"} · memory: ${mode === "tally" ? `${peak} slot${peak === 1 ? "" : "s"}` : "1 number"}${ans !== null ? ` · loner ${ans}` : ""}\n${line}`); }
  function reset() { ops = 0; idx = -1; tally = new Map(); acc = 0; peak = 0; ans = null; hot = null; line = ""; gen = mode === "tally" ? tallyRun() : xorRun(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = peak;
    if (mode === "tally") api.explain(`${peak} slots of memory`, `<p>A slot for every distinct value: memory grows with the input. Interviewers often ask for O(1) extra memory.</p><p>Switch to <b>XOR everything</b> and run it.</p>`);
    else if (ran.tally && !reached) { reached = true; api.explain("Pairs cancel", `<p>Same answer, ${ans}, with one number instead of ${ran.tally} slots. x ^ x = 0, x ^ 0 = x, and order doesn't matter, so every pair wipes itself out bit by bit.</p><p>Bits are a tiny, fast set: one integer can hold 64 yes/no answers.</p>`); api.done("You found the loner with XOR"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(650); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "tally every value", value: "tally" }, { label: "XOR everything", value: "xor" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 1.2, 0], dist: 15.5, theta: 0, phi: 1.5, instant: true });
  api.hud("every number appears twice except one · top: the numbers, red = now · tally: one slot per value, height = count · XOR: red = the number's bits, green = the running total's bits");
  reset();
  api.explain("How to read this", `<p>Every number here appears twice, except one. Find it. <b>Run all</b> with <b>tally every value</b>, then with <b>XOR everything</b>.</p>`);
});
