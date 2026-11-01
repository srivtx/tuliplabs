/* Build your own X, chapter 18: a search engine.
   Left: six documents, one row of word blocks each. Right: the inverted index, one block per word,
   which knows the documents that word appears in. Bars show each document's score.
   Two engines: scan every word of every document and count matches, or look the query words up in
   the index and rank by TF-IDF.
   The "why": scanning costs the size of the whole collection per query; the index costs only the
   length of the posting lists. And raw counts reward filler words like "the"; IDF discounts them. */
VIZ.register("bx-search", async (api) => {
  const W = await api.world3d();
  const DOCS = [
    "the cat sat on the mat",
    "the dog chased the cat",
    "a cat and a dog are friends",
    "the mat is red",
    "the dogs and cats and more dogs",
    "the end of the story",
  ];
  const toks = DOCS.map((d) => d.split(" "));
  const vocab = [...new Set(toks.flat())].sort();
  const index = Object.fromEntries(vocab.map((w) => [w, DOCS.map((_, i) => i).filter((i) => toks[i].includes(w))]));
  const N = DOCS.length;
  const idf = (w) => (index[w] ? Math.log(N / index[w].length) : 0);
  const RY = (i) => 4.4 - i * 1.0, WX = (j) => -6.4 + j * 1.0;
  const IX = (k) => 5.0 + (k % 2) * 1.55, IY = (k) => 4.6 - Math.floor(k / 2) * 0.52;
  let mode = "scan", query = "the cat", busy = false;
  const runs = {};
  function base() {
    W.clear();
    toks.forEach((ws, i) => {
      W.label("dl" + i, `doc ${i + 1}`, [WX(-1) + 0.1, RY(i), 0], { color: "muted", size: 0.26 });
      ws.forEach((w, j) => W.box(`w${i}_${j}`, { x: WX(j), y: RY(i), z: 0, sx: 0.92, sy: 0.5, sz: 0.4, color: "c5", opacity: 0.6, label: w, labelSize: 0.3, labelUp: -0.25, instant: true,
        info: { title: `"${w}" in document ${i + 1}`, html: "<p>A word (a <b>token</b>) in a document. Real engines also lower-case words and cut them to a stem, so <i>dogs</i> and <i>dog</i> match. Ours doesn't, which is why a search for <i>dog</i> misses document 5.</p>" } }));
    });
    vocab.forEach((w, k) => W.box("ix" + w, { x: IX(k), y: IY(k), z: 0, sx: 1.45, sy: 0.42, sz: 0.4, color: "c2", opacity: 0.55, label: `${w} → ${index[w].map((d) => d + 1).join(",")}`, labelSize: 0.26, labelUp: -0.21, instant: true,
      info: { title: `Index entry for "${w}"`, html: `<p>The <b>posting list</b>: the documents containing this word (${index[w].map((d) => d + 1).join(", ")}). Built once, ahead of time. A query only reads the lists for its own words, never the documents themselves.</p><p>IDF = log(${N} / ${index[w].length}) = <b>${idf(w).toFixed(2)}</b>: the rarer the word, the more it counts.</p>` } }));
    W.label("ixl", "inverted index (word → documents)", [5.8, 5.3, 0], { color: "muted", size: 0.26 });
  }
  function bars(scores, fmt) {
    const mx = Math.max(...scores, 1e-9);
    scores.forEach((s, i) => {
      const w = Math.max(0.05, (s / mx) * 2.2);
      W.box("bar" + i, { x: 1.2 + w / 2, y: RY(i), z: 0, sx: w, sy: 0.4, sz: 0.4, color: s > 0 ? "c3" : "c5", opacity: s > 0 ? 1 : 0.3, label: fmt(s), labelSize: 0.3, labelUp: -0.2,
        info: { title: `Score for document ${i + 1}: ${fmt(s)}`, html: mode === "scan" ? "<p>Just a count of how many times the query's words appear. A document stuffed with <i>the</i> scores high whether or not it's about your topic.</p>" : "<p>TF-IDF: for each query word, (times it appears here) × (how rare it is across all documents). Common words add almost nothing, so documents win by containing the <i>distinctive</i> words.</p>" } });
    });
  }
  async function search() {
    if (busy) return;
    const q = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!q.length) return;
    busy = true;
    base();
    let work = 0;
    const scores = DOCS.map(() => 0);
    if (mode === "scan") {
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < toks[i].length; j++) {
          work += q.length;
          const hit = q.includes(toks[i][j]);
          if (hit) scores[i]++;
          W.box(`w${i}_${j}`, { color: hit ? "c4" : "c1", opacity: hit ? 1 : 0.8, glow: hit ? 0.6 : 0 });
          await api.sleep(45);
          if (!hit) W.box(`w${i}_${j}`, { color: "c5", opacity: 0.6 });
        }
      }
      bars(scores, (s) => String(s));
    } else {
      for (const w of q) {
        if (!index[w]) continue;
        W.box("ix" + w, { color: "c4", opacity: 1, glow: 0.6 });
        for (const d of index[w]) {
          work++;
          const tf = toks[d].filter((x) => x === w).length;
          scores[d] += tf * idf(w);
          W.line(`p${w}_${d}`, "ix" + w, `w${d}_${toks[d].indexOf(w)}`, { color: "c4" });
          toks[d].forEach((x, j) => { if (x === w) W.box(`w${d}_${j}`, { color: "c4", opacity: 1, glow: 0.5 }); });
          await api.sleep(260);
        }
      }
      bars(scores, (s) => s.toFixed(2));
    }
    const total = toks.flat().length;
    const order = scores.map((s, i) => [s, i]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]);
    runs[query + "|" + mode] = work;
    api.status(`query: "${q.join(" ")}"   engine: ${mode === "scan" ? "scan everything, count matches" : "inverted index + TF-IDF"}\nwork: ${work} ${mode === "scan" ? `word comparisons (${total} words × ${q.length} query words)` : "posting-list entries read"}\nranking: ${order.map(([s, i]) => `doc ${i + 1} (${mode === "scan" ? s : s.toFixed(2)})`).join(", ") || "no matches"}\n${q.filter((w) => index[w]).map((w) => `idf(${w}) = ${idf(w).toFixed(2)}`).join("   ")}`);
    const other = runs[query + "|" + (mode === "scan" ? "index" : "scan")];
    if (mode === "scan") api.explain("Scanning everything", `<p>${work} comparisons: every word of every document, for every query word. Double the documents and you double the work. Google has hundreds of billions of pages.</p><p>And look at the ranking: ${q.includes("the") ? "documents full of <i>the</i> win, even if they're about something else." : "pure counts, so a long document that repeats a word wins."} Switch to the <b>index</b> engine and search again.</p>`);
    else {
      api.explain("Looking it up", `<p>Only ${work} posting-list entries read. The documents themselves were never opened. The index was built once, ahead of time, so each query costs the length of its words' lists, not the size of the collection.</p><p>${q.includes("the") && q.length > 1 ? `And <i>the</i> barely matters now: it's in ${index.the.length} of ${N} documents, so its IDF is ${idf("the").toFixed(2)}, against ${q.filter((w) => w !== "the" && index[w]).map((w) => `${idf(w).toFixed(2)} for <i>${w}</i>`).join(", ")}.` : "Every query word is weighted by how rare it is: rare words tell documents apart; common ones don't."}</p>`);
      if (other !== undefined && q.length > 1) api.done("You compared a scan with an index, and saw IDF at work");
    }
    busy = false;
  }
  api.seg([{ label: "scan + count", value: "scan" }, { label: "index + TF-IDF", value: "index" }], mode, (v) => { if (!busy) { mode = v; base(); } });
  const presets = ["the cat", "dog mat", "cat"];
  api.seg(presets.map((p) => ({ label: `"${p}"`, value: p })), query, (v) => { query = v; box.set(v); });
  const box = api.text("Query", query, (v) => { query = v.trim() || query; search(); }, { placeholder: "words to search for" });
  api.button("Search", search, { primary: true });
  W.camera({ target: [0.1, 2.0, 0], dist: 20.5, theta: 0, phi: 1.45, instant: true });
  api.hud("click a word or an index entry to ask why");
  base();
  api.explain("How to read this", "<p>Six tiny documents on the left, one row each. On the right, the <b>inverted index</b>: for every word, the documents that contain it.</p><p>Search <i>the cat</i> with the scanning engine, then with the index engine. Compare the work done, and which documents come out on top.</p>");
});
