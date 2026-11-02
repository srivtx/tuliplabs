/* DSA, chapter 31: DP on two strings (edit distance).
   Turn "sunday" into "saturday" with the fewest single-letter inserts, deletes or replacements.
   The "why": comparing letter by letter at the same position counts 7 differences, because one
   missing "at" shifts everything after it. The DP table answers "edit distance between the first i
   letters of one word and the first j of the other" for every i and j; each cell is the cheapest of
   delete (from above), insert (from the left) or replace/match (from the diagonal). It finds 3. The
   walk back from the corner spells out the edits. */
VIZ.register("ds-edit", async (api) => {
  const W = await api.world3d();
  const A = "sunday", B = "saturday", R = A.length, C = B.length;
  let mode = "pos", gen = null, steps = 0, dp = [], cur = null, reads = [], path = new Set(), pairs = [], cost = 0, running = false, ran = {}, reached = false, line = "";
  function* positional() {
    for (let k = 0; k < Math.max(R, C); k++) {
      steps++;
      const a = A[k] ?? "-", b = B[k] ?? "-", same = a === b;
      if (!same) cost++;
      pairs.push([a, b, same ? "match" : "edit"]);
      yield same ? `position ${k}: "${a}" = "${b}"` : `position ${k}: "${a}" against "${b}": ${a === "-" ? "insert" : "replace"}. ${cost} edit${cost === 1 ? "" : "s"} so far`;
    }
    yield `letter by letter: ${cost} edits`;
  }
  function* table() {
    dp = Array.from({ length: R + 1 }, () => Array(C + 1).fill(undefined));
    for (let i = 0; i <= R; i++) for (let j = 0; j <= C; j++) {
      steps++; cur = [i, j];
      if (!i || !j) { dp[i][j] = i + j; reads = []; yield !i && !j ? "empty to empty: 0 edits" : !i ? `"" to "${B.slice(0, j)}": insert ${j} letter${j === 1 ? "" : "s"}` : `"${A.slice(0, i)}" to "": delete ${i} letter${i === 1 ? "" : "s"}`; continue; }
      const same = A[i - 1] === B[j - 1], d = dp[i - 1][j - 1] + (same ? 0 : 1), del = dp[i - 1][j] + 1, ins = dp[i][j - 1] + 1;
      dp[i][j] = Math.min(d, del, ins); reads = [[i - 1, j - 1], [i - 1, j], [i, j - 1]];
      yield `"${A.slice(0, i)}" to "${B.slice(0, j)}": ${same ? `last letters match, diagonal ${d}` : `replace ${d}`}, delete ${del}, insert ${ins}. Best ${dp[i][j]}`;
    }
    reads = []; cost = dp[R][C];
    let i = R, j = C; path.add(`${i}_${j}`);
    while (i || j) {
      steps++;
      let msg;
      if (i && j && dp[i][j] === dp[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1)) {
        const same = A[i - 1] === B[j - 1]; pairs.unshift([A[i - 1], B[j - 1], same ? "match" : "edit"]);
        msg = same ? `"${A[i - 1]}" matches: keep it` : `replace "${A[i - 1]}" with "${B[j - 1]}"`; i--; j--;
      } else if (i && dp[i][j] === dp[i - 1][j] + 1) { pairs.unshift([A[i - 1], "-", "edit"]); msg = `delete "${A[i - 1]}"`; i--; }
      else { pairs.unshift(["-", B[j - 1], "edit"]); msg = `insert "${B[j - 1]}"`; j--; }
      path.add(`${i}_${j}`); cur = [i, j];
      yield `walk back: ${msg}`;
    }
    cur = null;
    yield `edit distance ${cost}`;
  }
  function draw() {
    const tb = mode === "dp";
    for (let i = 0; i <= R; i++) for (let j = 0; j <= C; j++) {
      const v = dp[i] && dp[i][j], hot = cur && cur[0] === i && cur[1] === j, rd = reads.some(([a, b]) => a === i && b === j);
      W.box(`t${i}_${j}`, { x: -3 + j * 0.8, y: 2.3 - i * 0.72, z: 0, sx: 0.74, sy: 0.66, sz: 0.25, color: hot ? "c1" : rd ? "c4" : path.has(`${i}_${j}`) ? "c3" : v !== undefined ? "c5" : "muted", glow: hot || rd ? 0.35 : 0, opacity: tb ? 0.95 : 0.12,
        label: tb && v !== undefined ? String(v) : "", labelSize: 0.22, labelUp: 0,
        info: { title: `"${A.slice(0, i)}" → "${B.slice(0, j)}"`, html: `<p>Fewest edits: ${v ?? "not filled yet"}.</p>` } });
    }
    for (let j = 1; j <= C; j++) W.label("cb" + j, B[j - 1], [-3 + j * 0.8, 3, 0.3], { color: tb ? "ink" : "muted", size: 0.28 });
    for (let i = 1; i <= R; i++) W.label("ra" + i, A[i - 1], [-3.8, 2.3 - i * 0.72, 0.3], { color: tb ? "ink" : "muted", size: 0.28 });
    for (let k = 0; k < 9; k++) {
      const p = pairs[k];
      ["top", "bot"].forEach((row, n) => W.box(`al${row}${k}`, { x: -3.2 + k * 0.8, y: -3.1 - n * 0.95, z: 0, sx: 0.7, sy: 0.65, sz: 0.3, visible: !!p, color: p && p[2] === "match" ? "c3" : "bad", opacity: 0.9,
        label: p ? p[n] : "", labelSize: 0.26, labelUp: 0, info: { title: "Alignment", html: "<p>Top: the letter from sunday. Bottom: the letter from saturday. Red = an edit, – = a gap.</p>" } }));
    }
  }
  function show() { api.status(`${mode === "pos" ? "letter by letter at the same position" : "edit distance table"} · ${steps} step${steps === 1 ? "" : "s"}${cost ? ` · ${cost} edits` : ""}\n${line}`); }
  function reset() { steps = 0; dp = []; cur = null; reads = []; path = new Set(); pairs = []; cost = 0; line = ""; gen = mode === "pos" ? positional() : table(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = cost;
    if (mode === "pos") api.explain(`${cost} edits`, `<p>"saturday" has "at" that "sunday" doesn't, so after the first letter everything is shifted by two and nothing lines up.</p><p>Switch to <b>edit distance table</b> and run it.</p>`);
    else if (ran.pos && !reached) { reached = true; api.explain("Every prefix against every prefix", `<p>${cost} edits against ${ran.pos}: ${pairs.filter((q) => q[2] === "edit").map(([x, y]) => x === "-" ? `insert "${y}"` : y === "-" ? `delete "${x}"` : `replace "${x}" with "${y}"`).join(", ")}. Each cell is the cheapest of three moves: diagonal (match or replace), from above (delete), from the left (insert).</p><p>${R + 1} × ${C + 1} cells, O(1) each: O(n·m).</p>`); api.done("You computed an edit distance"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "pos" ? 600 : 170); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "letter by letter", value: "pos" }, { label: "edit distance table", value: "dp" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, -0.6, 0], dist: 17, theta: 0, phi: 1.5, instant: true });
  api.hud(`turn "${A}" (rows) into "${B}" (columns) · number = fewest edits between those prefixes · amber = cells read · green = the path back · bottom: the alignment, red = an edit`);
  reset();
  api.explain("How to read this", `<p>Turn <b>${A}</b> into <b>${B}</b> with the fewest single-letter inserts, deletes or replacements. <b>Run all</b> with <b>letter by letter</b>, then with <b>edit distance table</b>.</p>`);
});
