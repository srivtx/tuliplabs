/* Build your own X, chapter 14: the adder at the heart of a CPU.
   Top: two 4-bit numbers A and B (click a bit to flip it). Middle: four full adders, one per bit,
   each built from five gates. A carry ripples from the right (bit 0) to the left (bit 3).
   Bottom: the sum bits and the carry out.
   The "why": addition is just gates wired in a chain, and the chain is slow because each bit waits
   for the carry from the bit below it. Two's complement lets the very same wires subtract. */
VIZ.register("bx-cpu", async (api) => {
  const W = await api.world3d();
  const N = 4;
  const X = (i) => (1.5 - i) * 2.5; // bit 0 on the right
  let A = 5, B = 3, mode = "unsigned", busy = false;
  const bit = (v, i) => (v >> i) & 1;
  const signed = (v) => (v & 8 ? v - 16 : v);
  const show = (v) => (mode === "signed" ? signed(v) : v);
  function drawInputs() {
    for (let i = 0; i < N; i++) {
      for (const [name, v, y, dx] of [["A", A, 5.2, -0.45], ["B", B, 4.2, 0.45]]) {
        const b = bit(v, i);
        W.box(name + i, { x: X(i) + dx, y, z: 0, s: 0.7, color: b ? "c4" : "c5", glow: b ? 0.6 : 0, opacity: b ? 1 : 0.5, label: `${name}${i}=${b}`, labelSize: 0.28,
          info: { title: `Input bit ${name}${i} (worth ${mode === "signed" && i === 3 ? "−8" : 2 ** i})`, html: `<p>One wire: high voltage is 1, low is 0. Click it to flip it.</p><p>${i === 3 && mode === "signed" ? "In two's complement the top bit is worth <b>−8</b> instead of +8. Nothing about the wires changes: only how we read them." : `Bit ${i} is worth ${2 ** i}, so ${name} = sum of the bits that are on.`}</p>` } });
      }
    }
  }
  function drawAdders() {
    for (let i = 0; i < N; i++) {
      W.box("fa" + i, { x: X(i), y: 2.4, z: 0, sx: 1.8, sy: 1.0, sz: 1.0, color: "c1", opacity: 0.8, label: `full adder ${i}`, labelSize: 0.28, labelUp: -0.5, instant: true,
        info: { title: `Full adder for bit ${i}`, html: "<p>Five gates:</p><pre>sum   = a XOR b XOR carry_in\ncarry = (a AND b) OR (carry_in AND (a XOR b))</pre><p>It adds three single bits (a, b and the carry from the bit below), so the answer is 0–3: a sum bit and a carry bit. Chain four of these and you can add 4-bit numbers; chain 64 and you have the adder in your laptop.</p><p>Why a carry at all? Same as on paper: 1 + 1 in binary is 10, so you write 0 and carry 1.</p>" } });
      W.line("ia" + i, "A" + i, "fa" + i, { color: "muted" });
      W.line("ib" + i, "B" + i, "fa" + i, { color: "muted" });
      if (i < N - 1) W.line("cl" + i, "fa" + i, "fa" + (i + 1), { color: "muted" });
    }
    W.box("cin", { x: X(0) + 1.9, y: 2.4, z: 0, s: 0.5, color: "c5", opacity: 0.5, label: "carry in = 0", labelSize: 0.26, instant: true,
      info: { title: "Carry in", html: "<p>The bottom bit has no carry from below, so it's wired to 0. Set it to 1 (and flip every bit of B) and the same circuit computes A − B: that's how a CPU subtracts without a subtractor.</p>" } });
    W.line("clin", "cin", "fa0", { color: "muted" });
  }
  function drawOutputs(sum, carries, upto = N) {
    for (let i = 0; i < N; i++) {
      const known = i < upto, b = bit(sum, i);
      W.box("S" + i, { x: X(i), y: 0.6, z: 0, s: 0.7, color: !known ? "c5" : b ? "c3" : "c5", glow: known && b ? 0.6 : 0, opacity: known ? 1 : 0.3, label: known ? `S${i}=${b}` : `S${i}=?`, labelSize: 0.28,
        info: { title: `Sum bit ${i}`, html: "<p>Each sum bit is ready only once its adder has the carry from below. Bit 3 is ready last.</p>" } });
      W.line("os" + i, "fa" + i, "S" + i, { color: known ? "c3" : "muted" });
    }
    const c4 = carries[N] ?? 0, known = upto >= N;
    W.box("cout", { x: X(N - 1) - 1.9, y: 2.4, z: 0, s: 0.6, color: known && c4 ? "bad" : "c5", glow: known && c4 ? 0.7 : 0, opacity: known ? 1 : 0.3, label: known ? `carry out = ${c4}` : "carry out = ?", labelSize: 0.26,
      info: { title: "Carry out", html: "<p>The carry that falls off the top. In unsigned maths it means the true answer didn't fit in 4 bits (it wrapped around past 15). CPUs keep it in a <b>flag</b> register so the next instruction can check it.</p>" } });
    W.line("clout", "fa" + (N - 1), "cout", { color: known && c4 ? "bad" : "muted" });
  }
  function add() {
    const carries = [0];
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const a = bit(A, i), b = bit(B, i), c = carries[i];
      sum |= (a ^ b ^ c) << i;
      carries.push((a & b) | (c & (a ^ b)));
    }
    return { sum, carries };
  }
  function chain(carries) {
    // longest run of consecutive carries out of adders 0..3
    let best = 0, run = 0;
    for (let i = 1; i <= N; i++) { run = carries[i] ? run + 1 : 0; best = Math.max(best, run); }
    return best;
  }
  function report(sum, carries) {
    const ch = chain(carries), over = mode === "unsigned" ? carries[N] === 1 : signed(A) + signed(B) !== signed(sum);
    const b4 = (v) => v.toString(2).padStart(4, "0");
    api.status(`A = ${b4(A)} = ${show(A)}\nB = ${b4(B)} = ${show(B)}\nS = ${b4(sum)} = ${show(sum)}   carry out = ${carries[N]}\n${mode} reading: ${show(A)} + ${show(B)} = ${show(sum)}${over ? "   ← overflow: the true answer doesn't fit" : ""}\nlongest carry chain: ${ch} adder${ch === 1 ? "" : "s"}\nworst case for any input: the carry crosses all ${N} adders, 2 gate delays each`);
    return ch;
  }
  async function run() {
    if (busy) return;
    busy = true;
    const { sum, carries } = add();
    drawOutputs(sum, carries, 0);
    for (let i = 0; i < N; i++) {
      W.flash("fa" + i);
      W.box("carry", { x: X(i) + 0.9, y: 3.15, z: 0, s: 0.36, color: carries[i] ? "c4" : "c5", glow: carries[i] ? 1 : 0, label: `carry ${carries[i]}`, labelSize: 0.26, instant: i === 0,
        info: { title: "The carry signal", html: "<p>It has to travel through every adder in turn. That's the ripple, and it's why a 64-bit ripple adder would be far too slow: real CPUs use <b>carry-lookahead</b> logic that works out all the carries at once.</p>" } });
      await api.sleep(450);
      drawOutputs(sum, carries, i + 1);
      api.explain(`Adder ${i}`, `<p>${bit(A, i)} + ${bit(B, i)} + carry ${carries[i]} = ${bit(A, i) + bit(B, i) + carries[i]}, so sum bit <b>${bit(sum, i)}</b> and carry <b>${carries[i + 1]}</b> to the next adder.</p>`);
      await api.sleep(250);
    }
    W.box("carry", { x: X(N - 1) - 1.2, y: 3.15, z: 0, s: 0.36, color: carries[N] ? "bad" : "c5", glow: carries[N] ? 1 : 0, label: `carry ${carries[N]}`, labelSize: 0.26 });
    const ch = report(sum, carries);
    if (ch === N) {
      api.explain("The worst case: the carry rippled all the way", `<p>Every adder produced a carry, so adder 3 couldn't finish until adders 0, 1 and 2 had. The answer took the longest possible time.</p><p>${mode === "unsigned" ? `And the carry fell off the top: ${A} + ${B} = ${A + B} doesn't fit in 4 bits, so the result wrapped to ${sum}.` : "Switch to <b>signed</b> and the same bits might mean a perfectly fine negative-number sum. The wires don't know; only the reader does."}</p><p>This waiting is why CPU designers use carry-lookahead adders: more gates, but the carries arrive at once.</p>`);
      api.done("You made a carry ripple through every adder");
    } else api.explain("Done", `<p>The longest carry chain was ${ch}. Can you choose A and B so a carry is passed through <b>all four</b> adders? Think about what makes a column produce a carry.</p>`);
    busy = false;
  }
  function redraw() {
    drawInputs();
    const { sum, carries } = add();
    drawOutputs(sum, carries);
    report(sum, carries);
  }
  W.onPick((key) => {
    const m = /^([AB])(\d)$/.exec(key || "");
    if (!m || busy) return;
    if (m[1] === "A") A ^= 1 << +m[2]; else B ^= 1 << +m[2];
    sa.set(A); sb.set(B);
    redraw();
    return false;
  });
  const sa = api.slider("A", { min: 0, max: 15, step: 1, value: A }, (v) => { if (busy) return; A = v; redraw(); });
  const sb = api.slider("B", { min: 0, max: 15, step: 1, value: B }, (v) => { if (busy) return; B = v; redraw(); });
  api.seg([{ label: "unsigned", value: "unsigned" }, { label: "signed (two's complement)", value: "signed" }], mode, (v) => { mode = v; redraw(); });
  api.button("Add, step by step", run, { primary: true });
  W.camera({ target: [0, 2.7, 0], dist: 17, theta: 0, phi: 1.32, instant: true });
  drawAdders(); redraw();
  api.hud("click an input bit to flip it · click an adder to see its gates");
  api.explain("How to read this", "<p>Two 4-bit numbers sit on top (amber = 1). Below them, four <b>full adders</b>, one per column, exactly like adding on paper, right to left. Press <b>Add</b> and watch the carry travel.</p><p>Your challenge: pick A and B so the carry has to pass through every adder.</p>");
});
