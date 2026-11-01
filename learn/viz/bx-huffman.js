/* Build your own X, chapter 17: Huffman coding, the heart of ZIP, PNG and JPEG's last step.
   Each letter starts as a block holding its count. Repeatedly merge the two smallest into a parent;
   the forest grows into one tree. Left edges are 0, right edges are 1, and a letter's code is the
   path from the root. Common letters end up near the top with short codes.
   The "why": fixed-length codes waste bits on common letters. Giving short codes to common symbols
   (and keeping codes prefix-free so they can be read back without separators) shrinks the total. */
VIZ.register("bx-huffman", async (api) => {
  const W = await api.world3d();
  const MESSAGES = {
    abra: "abracadabra alakazam",
    miss: "mississippi river",
    bee: "to be or not to be that is the question",
  };
  let pick = "abra", text, forest, uid, merges, busy = false;
  const leafCount = (n) => (n.kids ? leafCount(n.kids[0]) + leafCount(n.kids[1]) : 1);
  const height = (n) => (n.kids ? 1 + Math.max(height(n.kids[0]), height(n.kids[1])) : 0);
  const show = (ch) => (ch === " " ? "␣" : ch);
  function reset() {
    text = MESSAGES[pick];
    const counts = {};
    for (const c of text) counts[c] = (counts[c] || 0) + 1;
    uid = 0; merges = 0;
    forest = Object.entries(counts).map(([ch, w]) => ({ id: "n" + uid++, ch, w })).sort((a, b) => a.w - b.w || (a.ch < b.ch ? -1 : 1));
    W.clear();
    draw();
    status();
  }
  function codes() {
    const out = {};
    (function walk(n, path) { if (!n.kids) { out[n.ch] = path || "0"; return; } walk(n.kids[0], path + "0"); walk(n.kids[1], path + "1"); })(forest[0], "");
    return out;
  }
  function draw(hl = []) {
    const total = forest.reduce((a, t) => a + leafCount(t), 0), DX = Math.min(1.15, 15 / total);
    let slot = 0;
    function place(n, depth) {
      let x;
      if (!n.kids) x = (slot++ - (total - 1) / 2) * DX;
      else { const a = place(n.kids[0], depth + 1), b = place(n.kids[1], depth + 1); x = (a + b) / 2; }
      const y = height(n) * 1.15;
      const leaf = !n.kids;
      W.box(n.id, { x, y, z: 0, sx: leaf ? 0.8 : 0.6, sy: leaf ? 0.8 : 0.5, sz: 0.6, color: hl.includes(n.id) ? "c4" : leaf ? "c2" : "c1", glow: hl.includes(n.id) ? 0.6 : 0,
        label: leaf ? `${show(n.ch)}\n${n.w}` : String(n.w), labelSize: leaf ? 0.3 : 0.26, labelUp: leaf ? -0.4 : -0.25,
        info: leaf
          ? { title: `'${show(n.ch)}' appears ${n.w} time${n.w > 1 ? "s" : ""}`, html: "<p>A leaf: one symbol and how often it occurs. Leaves that get merged late end up near the top of the tree, with short codes. Rare symbols get merged first and sink deep, so their codes are long. That's the trade.</p>" }
          : { title: `A merged node: total ${n.w}`, html: "<p>Made by joining the two smallest trees. Its weight is their sum. Going <b>left</b> from here writes a 0, going <b>right</b> writes a 1.</p><p>Why always the two smallest? They'll end up deepest, paying the most bits each, so you want the cheapest symbols down there. This greedy choice is provably optimal.</p>" } });
      if (n.kids) n.kids.forEach((c, i) => {
        W.line(`l${n.id}_${i}`, n.id, c.id, { color: i ? "c3" : "c5" });
      });
      return x;
    }
    forest.forEach((t) => { place(t, 0); slot += 0.6; });
    W.camera({ target: [0, Math.max(...forest.map(height)) * 0.55 + 0.4, 0], dist: 10 + total * 0.55 });
  }
  function status() {
    const n = text.length, k = new Set(text).size, fixed = Math.max(1, Math.ceil(Math.log2(k)));
    let line = `message: "${text}"\n${n} characters, ${k} different symbols\nASCII: 8 bits each = ${8 * n} bits\nfixed-length: ${fixed} bits each = ${fixed * n} bits`;
    if (forest.length === 1) {
      const c = codes(), bits = [...text].reduce((a, ch) => a + c[ch].length, 0);
      line += `\nHuffman: ${bits} bits (${(bits / n).toFixed(2)} per symbol)\ncodes: ${Object.entries(c).sort((a, b) => a[1].length - b[1].length).map(([ch, code]) => `${show(ch)}=${code}`).join(" ")}`;
      return bits;
    }
    api.status(line + `\ntrees left to merge: ${forest.length}`);
    return null;
  }
  function finish() {
    const c = codes(), n = text.length, k = new Set(text).size, fixed = Math.max(1, Math.ceil(Math.log2(k)));
    const bits = [...text].reduce((a, ch) => a + c[ch].length, 0);
    api.status(`message: "${text}"\nASCII: ${8 * n} bits   fixed-length: ${fixed * n} bits   Huffman: ${bits} bits\ncodes: ${Object.entries(c).sort((a, b) => a[1].length - b[1].length).map(([ch, code]) => `${show(ch)}=${code}`).join(" ")}`);
    const best = Object.entries(c).sort((a, b) => a[1].length - b[1].length)[0];
    api.explain("One tree: read off the codes", `<p>Each symbol's code is the path from the root: 0 for left (grey), 1 for right (green). The commonest symbol '<b>${show(best[0])}</b>' got the short code <code>${best[1]}</code>.</p><p>Total: <b>${bits} bits</b>, against ${fixed * n} with the best fixed-length code and ${8 * n} in plain ASCII. And no code is the start of another (they're all leaves), so a decoder can read the bits back with no separators.</p>`);
    api.done("You built a Huffman tree and beat fixed-length codes");
  }
  async function mergeOnce() {
    if (forest.length < 2) return false;
    const [a, b] = forest;
    draw([a.id, b.id]);
    api.explain("Merge the two smallest", `<p>The two lightest trees weigh ${a.w} and ${b.w}. Join them under a new parent weighing ${a.w + b.w}, then put it back in the sorted list.</p>`);
    await api.sleep(550);
    const parent = { id: "n" + uid++, w: a.w + b.w, kids: [a, b] };
    forest = forest.slice(2);
    let i = 0;
    while (i < forest.length && forest[i].w <= parent.w) i++;
    forest.splice(i, 0, parent);
    merges++;
    draw([parent.id]);
    if (forest.length === 1) finish(); else status();
    return true;
  }
  async function step() { if (busy) return; busy = true; await mergeOnce(); busy = false; }
  async function all() { if (busy) return; busy = true; while (await mergeOnce()) await api.sleep(200); busy = false; }
  api.seg(Object.entries(MESSAGES).map(([k, v]) => ({ label: v.length > 18 ? v.slice(0, 16) + "…" : v, value: k })), pick, (v) => { if (busy) return; pick = v; reset(); });
  api.button("Merge two smallest", step, { primary: true });
  api.button("Build the whole tree", all);
  api.button("Reset", () => { if (!busy) reset(); });
  W.camera({ target: [0, 0.6, 0], dist: 14, theta: 0, phi: 1.38, instant: true });
  api.hud("blue = a symbol and its count · red = merged · click anything to ask why");
  reset();
  api.explain("How to read this", "<p>Every different character in the message is a block, labelled with how many times it appears. Press <b>Merge</b>: the two rarest get joined under a parent. Keep going until one tree is left, then read each letter's code off the path from the top.</p>");
});
