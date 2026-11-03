/* Build your own X, chapter 31: a shell.
   The pipeline: seq 1 1000000 | grep 7 | head -3
   The "why": running each program to the end and handing its whole output to the next (through a
   temporary file) means seq writes a million lines and grep reads them all, just so head can keep
   three. A pipe connects the programs while they all run at once. Lines flow through a small buffer
   one at a time; when head has its three lines it exits, the pipe closes, grep and then seq get
   told to stop (SIGPIPE), and the whole thing ends after 27 lines. Buffers also put the brakes on a
   fast writer: when a pipe is full, the writer waits. */
VIZ.register("bx-shell", async (api) => {
  const W = await api.world3d();
  const N = 1000000, CAP = 4, P = [{ name: "seq 1 1000000", x: -2.6 }, { name: "grep 7", x: 0 }, { name: "head -3", x: 2.6 }];
  const sevens = N - 531441;
  let mode = "files", gen = null, made = 0, passed = 0, printed = [], pipeA = [], pipeB = [], done = [false, false, false], fileA = 0, fileB = 0, work = 0, running = false, ran = {}, reached = false, line = "";
  function* files() {
    for (let k = 1; k <= 5; k++) { made = (N * k) / 5; fileA = made; work = made; done[0] = k === 5; yield `seq runs alone and writes to a temporary file: ${made.toLocaleString()} lines so far`; }
    for (let k = 1; k <= 5; k++) { const r = (N * k) / 5; fileB = Math.round((sevens * k) / 5); passed = fileB; work = N + r; done[1] = k === 5; yield `grep reads the whole file, ${r.toLocaleString()} lines so far, and keeps ${fileB.toLocaleString()} with a 7`; }
    printed = [7, 17, 27]; done[2] = true; work += 3;
    yield `head finally runs, prints 7, 17, 27, and throws the other ${(sevens - 3).toLocaleString()} away`;
  }
  function* pipes() {
    let n = 0;
    while (printed.length < 3) {
      // head reads from pipe B
      if (pipeB.length) { const v = pipeB.shift(); printed.push(v); work++; yield `head reads ${v} and prints it (${printed.length} of 3)`; if (printed.length === 3) break; continue; }
      // grep reads from pipe A
      if (pipeA.length) { const v = pipeA.shift(); work++; if (String(v).includes("7")) { pipeB.push(v); passed++; yield `grep reads ${v}: it has a 7, so into the next pipe`; } else yield `grep reads ${v}: no 7, dropped`; continue; }
      // seq writes into pipe A
      while (pipeA.length < CAP) { n++; made = n; pipeA.push(n); work++; }
      yield `seq writes ${pipeA.join(", ")} into the pipe, then waits: the pipe holds ${CAP} lines and it's full`;
    }
    done[2] = true;
    yield `head has its 3 lines and exits. The pipe closes`;
    done[1] = true; done[0] = true;
    yield `grep and seq get SIGPIPE ("nobody's reading") and stop. seq made ${made} lines, not a million`;
  }
  function draw() {
    const fm = mode === "files";
    P.forEach((p, i) => W.box("p" + i, { x: p.x, y: 1.5, z: 0, sx: 1.9, sy: 0.7, sz: 0.5, color: done[i] ? "c5" : "c2", opacity: done[i] ? 0.5 : 0.92, label: p.name, labelSize: 0.2, labelUp: 0,
      info: { title: p.name, html: `<p>${i === 0 ? "Prints the numbers 1 to a million, one per line." : i === 1 ? "Passes on only the lines containing a 7." : "Prints the first three lines it gets, then exits."}</p>` } }));
    for (let k = 0; k < 2; k++) {
      const x = (P[k].x + P[k + 1].x) / 2, buf = k === 0 ? pipeA : pipeB, sz = k === 0 ? fileA : fileB;
      if (fm) {
        const h = 0.08 + (sz / N) * 1.5;
        W.box("f" + k, { x, y: -0.9 + h / 2, z: 0, sx: 0.9, sy: h, sz: 0.5, color: "c4", opacity: 0.85, visible: true, label: sz ? `${(sz / 1000).toFixed(0)}k lines` : "temp file", labelSize: 0.15, labelUp: 0.25,
          info: { title: "Temporary file", html: `<p>The whole output of one program, stored until the next one runs.</p>` } });
        for (let j = 0; j < CAP; j++) W.box(`b${k}${j}`, { visible: false });
      } else {
        W.box("f" + k, { visible: false });
        for (let j = 0; j < CAP; j++) {
          const v = buf[j];
          W.box(`b${k}${j}`, { x: x - 0.54 + j * 0.36, y: 0.5, z: 0, sx: 0.3, sy: 0.3, sz: 0.3, visible: true, color: v === undefined ? "line" : String(v).includes("7") ? "c3" : "c5",
            opacity: v === undefined ? 0.3 : 0.92, label: v === undefined ? "" : `${v}`, labelSize: 0.14, labelUp: 0, info: { title: "Pipe buffer", html: `<p>Holds at most ${CAP} lines. A full pipe makes the writer wait; an empty one makes the reader wait.</p>` } });
        }
      }
    }
    W.label("out", `terminal: ${printed.join("  ")}`, [2.3, -1.5, 0.2], { color: "ink", size: 0.2 });
    W.label("work", `lines handled: ${work.toLocaleString()}`, [-2.3, -1.5, 0.2], { color: "muted", size: 0.18 });
  }
  function show() { api.status(`${mode === "files" ? "one at a time, through files" : "pipes, all at once"} · ${work.toLocaleString()} lines handled\n${line}`); }
  function reset() { made = passed = fileA = fileB = work = 0; printed = []; pipeA = []; pipeB = []; done = [false, false, false]; line = ""; gen = mode === "files" ? files() : pipes(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = work;
    if (mode === "files") api.explain(`${work.toLocaleString()} lines for 3`, `<p>Every program waited for the one before it to finish completely, and the files held everything in between.</p><p>Switch to <b>pipes, all at once</b> and run it.</p>`);
    else if (ran.files !== undefined && !reached) { reached = true; api.explain("Streams, not files", `<p>${work} lines against ${ran.files.toLocaleString()}. All three programs ran at the same time, a few lines in flight, and closing the pipe stopped the ones upstream.</p><p>That's what <code>|</code> does: the shell calls pipe() and fork(), and wires one program's output to the next one's input.</p>`); api.done("You ran a pipeline"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(650); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "one at a time, through files", value: "files" }, { label: "pipes, all at once", value: "pipes" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.2, 0], dist: 10.5, theta: 0, phi: 1.5, instant: true });
  api.hud("seq 1 1000000 | grep 7 | head -3 · grey = finished · pipes: small boxes are lines waiting in a buffer, green = has a 7");
  reset();
  api.explain("How to read this", `<p>Three programs, one pipeline. <b>Run all</b> with <b>one at a time, through files</b>, then with <b>pipes, all at once</b>.</p>`);
});
