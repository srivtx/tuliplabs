/* Build your own X, chapter 26: a diff tool.
   An old file (rows, on the left) and a new file (columns, listed on the right), with a grid between
   them: cell (i, j) holds the length of the longest common subsequence (LCS) of the first i old
   lines and the first j new lines, drawn as its height. Green cells are lines that are equal.
   The "why": the obvious diff compares line 1 with line 1, line 2 with line 2, … so one line added
   at the top shifts everything and every line looks changed. That's walking only the diagonal of
   the grid. The real diff finds the LCS, the most lines both files share in order, and reports only
   the rest: a path through the grid that steps right (added), down (removed) or diagonally (kept). */
VIZ.register("bx-diff", async (api) => {
  const W = await api.world3d();
  const OLD = ["def greet(name):", "  msg = 'hi ' + name", "  print(msg)", "  return msg", "", "greet('ana')"];
  const edits = { top: false, del: false, change: false };
  let mode = "naive", seen = {}, reached = false, prevSize = [0, 0];
  const NEW = () => {
    let n = OLD.slice();
    if (edits.change) n[3] = "  return msg.upper()";
    if (edits.del) n.splice(2, 1);
    if (edits.top) n.unshift("import sys");
    return n;
  };
  function lcsTable(a, b) {
    const t = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        t[i][j] = a[i - 1] === b[j - 1] ? t[i - 1][j - 1] + 1 : Math.max(t[i - 1][j], t[i][j - 1]);
    return t;
  }
  // Walk back from the corner: diagonal on a match, otherwise toward the bigger neighbour.
  function lcsDiff(a, b, t) {
    const ops = [], path = new Set();
    let i = a.length, j = b.length;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) { path.add(`${i - 1},${j - 1}`); ops.push(["  ", a[i - 1]]); i--; j--; }
      else if (j > 0 && (i === 0 || t[i][j - 1] >= t[i - 1][j])) { if (i > 0) path.add(`${i - 1},${j - 1}`); ops.push(["+ ", b[j - 1]]); j--; }
      else { if (j > 0) path.add(`${i - 1},${j - 1}`); ops.push(["- ", a[i - 1]]); i--; }
    }
    return { ops: ops.reverse(), path };
  }
  function naiveDiff(a, b) {
    const ops = [];
    for (let k = 0; k < Math.max(a.length, b.length); k++) {
      if (a[k] === b[k]) ops.push(["  ", a[k]]);
      else { if (k < a.length) ops.push(["- ", a[k]]); if (k < b.length) ops.push(["+ ", b[k]]); }
    }
    return ops;
  }
  const show = (s) => (s === "" ? "(blank)" : s), esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  function draw() {
    const a = OLD, b = NEW(), t = lcsTable(a, b), S = 1.15;
    const ox = -((b.length - 1) * S) / 2, oz = -((a.length - 1) * S) / 2;
    for (let i = 0; i < prevSize[0]; i++) for (let j = 0; j < prevSize[1]; j++) if (i >= a.length || j >= b.length) W.remove(`g${i},${j}`);
    for (let j = 0; j < 8; j++) W.label("nn" + j, null);
    prevSize = [a.length, b.length];
    const { ops, path } = lcsDiff(a, b, t), nops = naiveDiff(a, b);
    a.forEach((line, i) => W.label("ol" + i, String(i + 1), [ox - 1.1, 0.2, oz + i * S], { color: "muted", size: 0.34 }));
    b.forEach((line, j) => W.label("nn" + j, String(j + 1), [ox + j * S, 0.2, oz - 1.1], { color: "muted", size: 0.34 }));
    W.label("hOld", "old ↓", [ox - 1.3, 0.2, oz - 1.1], { color: "ink", size: 0.34 });
    W.label("hNew", "new →", [ox + b.length * S + 0.2, 0.2, oz - 1.1], { color: "ink", size: 0.34 });
    for (let i = 0; i < a.length; i++)
      for (let j = 0; j < b.length; j++) {
        const eq = a[i] === b[j], v = t[i + 1][j + 1], k = `${i},${j}`;
        const onPath = mode === "naive" ? i === j : path.has(k);
        const color = mode === "naive" ? (i === j ? (eq ? "c3" : "c1") : eq ? "c3" : "c5") : onPath ? (eq ? "c3" : "c4") : eq ? "c3" : "c5";
        W.box("g" + k, { x: ox + j * S, y: (0.2 + v * 0.35) / 2, z: oz + i * S, sx: 0.9, sy: 0.2 + v * 0.35, sz: 0.9, color, opacity: onPath || eq ? 0.95 : 0.35, glow: onPath ? 0.35 : 0,
          info: { title: `old line ${i + 1} vs new line ${j + 1}: ${eq ? "equal" : "different"}`, html: `<p><code>${esc(show(a[i]))}</code> vs <code>${esc(show(b[j]))}</code></p><p>The height is <b>${v}</b>: the longest run of lines the first ${i + 1} old lines and the first ${j + 1} new lines share, in order (their LCS).</p><p>${eq ? "The lines match, so it's the cell up and to the left, plus one." : "The lines differ, so it's the bigger of the cell above and the cell to the left: drop one line from either file."}</p>` } });
      }
    const list = mode === "naive" ? nops : ops, add = list.filter((o) => o[0] === "+ ").length, rem = list.filter((o) => o[0] === "- ").length;
    const any = edits.top || edits.del || edits.change;
    if (any) { const key = JSON.stringify(edits); seen[key] = seen[key] || {}; seen[key][mode] = add + rem; }
    api.status(`${mode === "naive" ? "line by line, by position" : "LCS diff"}: ${add} added, ${rem} removed\n` + list.map((o) => o[0] + show(o[1])).join("\n"));
    if (!reached) for (const s of Object.values(seen)) if (s.naive != null && s.lcs != null && s.lcs < s.naive) {
      reached = true;
      api.explain("The LCS diff reports only the real change", "<p>Comparing by position reported lines that never changed, because one edit shifted everything after it. The LCS diff found the most lines the files share in order, and reported only what's left. This is the idea inside <code>git diff</code>, <code>diff</code> and code review tools (git uses a faster variant, Myers' algorithm).</p>");
      api.done("You saw the LCS diff find the real change");
    }
  }
  const toggle = (k) => () => { edits[k] = !edits[k]; draw(); };
  api.button("Add a line at the top", toggle("top"), { primary: true });
  api.button("Delete line 3", toggle("del"));
  api.button("Change line 4", toggle("change"));
  api.seg([{ label: "line by line", value: "naive" }, { label: "LCS diff", value: "lcs" }], mode, (m) => {
    mode = m; draw();
    if (!reached) api.explain(m === "naive" ? "Line by line" : "LCS diff", m === "naive"
      ? "<p>Line 1 against line 1, line 2 against line 2: only the <b>diagonal</b> of the grid. Red cells are positions that differ, and each becomes a remove plus an add.</p>"
      : "<p>The yellow and green cells are the path back from the corner. A <b>diagonal</b> step on a green cell keeps a line, a step <b>right</b> adds a new line and a step <b>down</b> removes an old one.</p>");
  });
  W.camera({ target: [-0.3, 0.3, 0.5], dist: 14.5, theta: 0, phi: 0.85, instant: true });
  api.hud("height = LCS length so far · green = equal lines · click a cell for why");
  draw();
  api.explain("How to read this", "<p>The old file runs down the rows and the new file across the columns. Each cell compares one old line with one new line.</p><p>Press <b>Add a line at the top</b> and read the diff below in <b>line by line</b> mode, then switch to <b>LCS diff</b>.</p>");
});
