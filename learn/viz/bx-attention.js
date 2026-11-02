/* Build your own X, chapter 21: attention, the heart of a GPT.
   A sentence as a row of word blocks. Under each word, its key: four numbers (one cube each) that
   describe it. Pick a word: its query (four numbers too, at the left) is compared with the key of
   every earlier word by a dot product, the scores go through a softmax, and the bars show where
   that word "looks". Two modes: average every earlier word equally, or attention.
   The "why": a word's meaning depends on other words, often far away ("it" means the cat). Averaging
   blurs everything together; attention lets each word pick which earlier words matter to it, with
   weights it computes from the data, in parallel for every word. */
VIZ.register("bx-attention", async (api) => {
  const W = await api.world3d();
  const DIMS = ["animal", "describes", "action", "subject"];
  const WORDS = [
    // word, key, query (what this word looks for)
    ["the", [0, 0, 0, 0.2], [0, 0, 0, 0]],
    ["cat", [1, 0, 0, 1], [0, 0, 1, 0]],
    ["chased", [0, 0, 1, 0], [1, 0, 0, 1]],
    ["the", [0, 0, 0, 0.2], [0, 0, 0, 0]],
    ["mouse", [1, 0, 0, 0.2], [0, 0, 2, 0]],
    ["because", [0, 0, 0, 0], [0, 0, 1, 0]],
    ["it", [0.5, 0, 0, 0.5], [2, 0, 0, 2]],
    ["was", [0, 0, 1, 0], [0, 0, 0, 2]],
    ["hungry", [0, 1, 0, 0], [1, 0, 0, 1]],
  ];
  const n = WORDS.length, X = (i) => (i - (n - 1) / 2) * 1.2;
  let mode = "attn", sharp = 0.5, sel = 6, reached = false;
  const dot = (a, b) => a.reduce((s, v, k) => s + v * b[k], 0);
  function weights() {
    const q = WORDS[sel][2];
    const scores = WORDS.slice(0, sel + 1).map((w) => dot(q, w[1]));
    if (mode === "avg") return { scores, w: scores.map(() => 1 / scores.length) };
    const m = Math.max(...scores), e = scores.map((s) => Math.exp(sharp * (s - m))), z = e.reduce((a, b) => a + b, 0);
    return { scores, w: e.map((v) => v / z) };
  }
  function vec(prefix, v, x, y0, what) {
    v.forEach((val, k) => W.box(`${prefix}${k}`, { x, y: y0 - k * 0.42, z: 0, s: 0.34, color: val > 0 ? "c2" : "c5", opacity: val > 0 ? Math.min(1, 0.25 + val * 0.5) : 0.15,
      label: val ? String(val) : "", labelSize: 0.2, labelUp: -0.17,
      info: { title: `${what}: ${DIMS[k]} = ${val}`, html: `<p>One of four numbers. Here they have names (${DIMS.join(", ")}) so you can read them. In a real model they're learned, there are hundreds of them, and nobody chose what each one means.</p>` } }));
  }
  function draw() {
    const { scores, w } = weights();
    WORDS.forEach(([word, key], i) => {
      const on = i <= sel, me = i === sel;
      W.box("w" + i, { x: X(i), y: 0, z: 0, sx: 1.1, sy: 0.6, sz: 0.5, color: me ? "c4" : on ? "c2" : "c5", opacity: on ? 1 : 0.35, glow: me ? 0.4 : 0,
        label: word, labelSize: 0.28, labelUp: -0.3,
        info: { title: `"${word}"${me ? " (the query word)" : ""}`, html: `<p><b>Click a word</b> to make it the one doing the looking.</p><p>${i > sel ? "This word comes <b>later</b> in the sentence. A GPT only lets each word look backwards (a <b>causal mask</b>), because when it writes text, later words don't exist yet." : "Its <b>key</b> (the cubes below) says what it offers; the query word's <b>query</b> says what it's looking for. Their dot product is the score."}</p>` } });
      vec(`k${i}_`, key, X(i), -0.75, `Key of "${word}"`);
      const wt = on ? w[i] : 0, hgt = Math.max(0.03, wt * 3);
      W.box("b" + i, { x: X(i), y: 0.45 + hgt / 2, z: 0, sx: 0.7, sy: hgt, sz: 0.3, color: "c4", opacity: on ? 0.9 : 0, label: on ? `${Math.round(wt * 100)}%` : "", labelSize: 0.28, labelUp: 0.15,
        info: { title: `"${WORDS[sel][0]}" pays ${Math.round(wt * 100)}% attention to "${word}"`, html: mode === "avg" ? "<p>Averaging: every earlier word gets the same share, whatever it is. The word ends up with a blurry mix of its whole past.</p>" : `<p>Score = query · key = ${on ? scores[i].toFixed(1) : "-"}. The softmax turns scores into weights that add up to 100%: e<sup>sharpness × score</sup>, divided by the total. A bigger score gets an exponentially bigger share.</p>` } });
    });
    vec("q", WORDS[sel][2], X(-1) - 0.3, -0.75, `Query of "${WORDS[sel][0]}"`);
    DIMS.forEach((d, k) => W.label("dl" + k, d, [X(-1) - 1.5, -0.75 - k * 0.42, 0], { color: "muted", size: 0.25 }));
    W.label("ql", "query", [X(-1) - 0.3, -0.25, 0], { color: "muted", size: 0.25 });
    const best = w.indexOf(Math.max(...w));
    api.status(`query word: "${WORDS[sel][0]}"   mode: ${mode === "avg" ? "average everything before" : `attention, sharpness ${sharp.toFixed(2)}`}\n` +
      WORDS.slice(0, sel + 1).map(([word], i) => `${word.padEnd(8)} score ${scores[i].toFixed(1).padStart(4)}  weight ${(w[i] * 100).toFixed(0).padStart(3)}%`).join("\n"));
    if (mode === "attn" && WORDS[sel][0] === "it" && w[best] > 0.6 && !reached) {
      reached = true;
      api.explain(`"it" looks at "${WORDS[best][0]}"`, `<p>${Math.round(w[best] * 100)}% of its attention goes to <b>${WORDS[best][0]}</b>: its query asks for an <i>animal</i> that is the <i>subject</i>, and the cat's key matches on both. <i>mouse</i> matches only on <i>animal</i>.</p><p>The output for "it" is now mostly the cat's information (its <b>value</b>), so the next layer knows what "it" means. A GPT does this for every word at once, with many such heads, in dozens of layers.</p>`);
      api.done("You made a word attend to the right earlier word");
    }
  }
  W.onPick((key) => {
    if (/^w\d$/.test(key)) {
      sel = +key[1];
      draw();
      const [word, , q] = WORDS[sel];
      api.explain(`"${word}" is looking`, `<p>Its query is [${q.join(", ")}]: it looks for ${q.some(Boolean) ? q.map((v, k) => (v ? DIMS[k] : null)).filter(Boolean).join(" + ") : "nothing in particular, so it spreads its attention evenly"}. Each earlier word scores query · key, and the softmax turns the scores into the bars.</p>`);
      return false;
    }
  });
  api.seg([{ label: "average the past", value: "avg" }, { label: "attention", value: "attn" }], mode, (v) => { mode = v; draw(); });
  api.slider("Sharpness (1 / temperature)", { min: 0, max: 3, step: 0.1, value: sharp, format: (v) => v.toFixed(1) }, (v) => { sharp = v; draw(); });
  WORDS.forEach(([word], i) => { if (word === "it" || word === "hungry" || word === "was") api.button(`look from "${word}"`, () => { sel = i; draw(); }); });
  W.camera({ target: [-1.3, 0.9, 0], dist: 18, theta: 0, phi: 1.5, instant: true });
  api.hud("click a word to make it the query · bars = where it looks · cubes = key numbers");
  draw();
  api.explain("How to read this", "<p>To predict the next word after <i>…because it was</i>, a model has to know what <b>it</b> refers to. Attention is how a word gathers information from earlier words.</p><p>The yellow bars show where the selected word looks. Try <b>average the past</b>, then <b>attention</b>, and raise the sharpness.</p>");
});
