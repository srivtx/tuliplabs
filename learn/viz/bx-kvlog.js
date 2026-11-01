/* Build your own X, chapter 6: a key-value database.
   An append-only log on "disk" (rows of record blocks, one row per segment) and a hash index in
   memory (blocks above, each pointing at its key's newest record). Compaction and crash recovery. */
VIZ.register("bx-kvlog", async (api) => {
  const W = await api.world3d();
  W.camera({ target: [0, 0.6, 1.6], dist: 17, theta: 0.15, phi: 1.05, instant: true });
  const SEG = 8;                       // records per segment file
  const KEYS = ["user", "cart", "theme", "lang", "city"];
  const COL = { user: "c2", cart: "c1", theme: "c3", lang: "c4", city: "c5" };
  const VALS = { user: ["ana", "bo", "cy"], cart: ["3", "5", "0"], theme: ["dark", "light"], lang: ["en", "hi", "fr"], city: ["pune", "goa", "delhi"] };
  const size = (r) => 8 + r.key.length + (r.del ? 0 : r.val.length); // 8-byte header: lengths + checksum

  let segs, index, nextId, wrote, read, mode, compacted, recovered, busy;
  function reset() {
    segs = [[]]; index = new Map(); nextId = 0; wrote = 0; read = 0; compacted = false; recovered = false; busy = false;
    W.clear();
    for (let i = 0; i < 6; i++) set(KEYS[i % KEYS.length], VALS[KEYS[i % KEYS.length]][0], true);
    draw();
    api.status("Six records written. Press SET a few times: the log only ever grows at the end.");
  }
  const live = () => {
    const m = new Map();
    for (const s of segs) for (const r of s) m.set(r.key, r);
    return [...m.values()].filter((r) => !r.del);
  };
  function set(key, val, quiet, del) {
    let cur = segs[segs.length - 1];
    if (cur.length >= SEG) { cur = []; segs.push(cur); }
    const r = { id: nextId++, key, val, del: !!del };
    cur.push(r);
    if (del) index.delete(key); else index.set(key, r);
    if (!quiet) {
      const naive = live().reduce((a, x) => a + size(x), 0);
      wrote += mode === "naive" ? naive : size(r);
    }
    return r;
  }
  function recPos(si, i) { return { x: (i - (SEG - 1) / 2) * 1.15, y: 0, z: si * 1.5 }; }
  function draw() {
    const newest = new Set([...index.values()].map((r) => r.id));
    const seen = new Set();
    segs.forEach((s, si) => {
      s.forEach((r, i) => {
        const k = "r" + r.id; seen.add(k);
        const p = recPos(si, i);
        const stale = !r.del && !newest.has(r.id);
        W.box(k, { ...p, s: 0.95, color: r.del ? "bad" : COL[r.key], opacity: stale ? 0.28 : 1, label: r.del ? `✕ ${r.key}` : `${r.key}\n${r.val}`, labelSize: 0.3,
          info: r.del
            ? { title: `Tombstone for "${r.key}"`, html: "<p>A delete can't erase bytes in an append-only file, so it <b>appends</b> a marker that says \"this key is gone\".</p><p>Readers who replay the log see the tombstone last and drop the key. Compaction finally throws both away.</p>" }
            : stale
              ? { title: `Stale record: ${r.key} = ${r.val}`, html: "<p>An <b>older</b> value. A newer record for the same key exists further along the log, so nothing points here any more.</p><p>It still takes disk space. That's the price of never rewriting: <b>compaction</b> reclaims it later.</p>" }
              : { title: `Live record: ${r.key} = ${r.val}`, html: `<p>The newest value for <code>${r.key}</code>. The index points straight at its byte offset, so a GET reads just this one record (${size(r)} bytes) instead of scanning the file.</p>` } });
      });
      W.label("seg" + si, `segment ${si}${s.length >= SEG ? " (closed)" : " (active)"}`, [(SEG / 2) * 1.15 + 1.9, 0, si * 1.5], { color: "muted", size: 0.32 });
    });
    for (let si = segs.length; si < 8; si++) W.label("seg" + si, null);
    // the index: one block per key, above the log, with a line to its record
    KEYS.forEach((key, i) => {
      const k = "i" + key, r = index.get(key);
      if (!r) { if (W.has(k)) W.remove(k); return; }
      W.box(k, { x: (i - 2) * 2.3, y: 3.2, z: 0, s: 0.8, color: COL[key], glow: 0.15, label: `${key} → #${r.id}`, labelSize: 0.3,
        info: { title: `Index entry: ${key}`, html: `<p>Lives in <b>memory</b> (a Python dict). It stores only where the newest <code>${key}</code> record starts on disk.</p><p>Why not keep the values in memory too? Because the index stays tiny even when values are huge: only keys and offsets.</p><p>Why is it safe to lose it? The log on disk has everything needed to rebuild it. Try <b>Crash</b>.</p>` } });
      W.line("l" + key, k, "r" + r.id, { color: COL[key], opacity: 0.7 });
    });
    for (const k of [...KEYS.map((x) => "l" + x)]) if (!index.has(k.slice(1))) W.unline(k);
    for (let id = 0; id < nextId; id++) if (!seen.has("r" + id) && W.has("r" + id)) W.remove("r" + id);
    const total = segs.reduce((a, s) => a + s.reduce((b, r) => b + size(r), 0), 0);
    const useful = live().reduce((a, r) => a + size(r), 0);
    api.hud(`<b>${mode === "naive" ? "naive: rewrite the whole file" : "append-only log"}</b> · on disk ${total} B (${useful} B useful) · written ${wrote} B · read ${read} B`);
    W.camera({ target: [0, 0.6, Math.max(1.6, (segs.length - 1) * 0.75)], dist: 15 + segs.length * 1.2 });
  }

  function doSet() {
    if (busy) return;
    const key = KEYS[Math.floor(Math.random() * KEYS.length)];
    const opts = VALS[key], old = index.get(key);
    const val = opts[(opts.indexOf(old ? old.val : opts[0]) + 1) % opts.length];
    const before = wrote;
    const r = set(key, val);
    draw(); W.flash("r" + r.id);
    api.status(`SET ${key} = ${val}\nwrote ${wrote - before} bytes ${mode === "naive" ? "(the WHOLE dataset, again)" : "(just this record, at the end)"}`);
    if (segs.length >= 3 && !compacted) api.explain("Disk is filling with old values", "<p>Look at the faded blocks: stale values nobody can read any more. Press <b>Compact</b> to rewrite the closed segments with only the newest value of each key.</p>");
  }
  function doGet() {
    const key = KEYS[Math.floor(Math.random() * KEYS.length)], r = index.get(key);
    if (!r) { api.status(`GET ${key}: not in the index, so it doesn't exist. 0 bytes read.`); return; }
    const scan = segs.reduce((a, s) => a + s.reduce((b, x) => b + size(x), 0), 0);
    read += size(r);
    W.flash("i" + key); W.flash("r" + r.id);
    draw();
    api.status(`GET ${key} → ${r.val}\nwith the index: jump to record #${r.id}, read ${size(r)} B\nwithout it: scan the whole log, ${scan} B, and keep the LAST match`);
  }
  function doDelete() {
    const keys = [...index.keys()];
    if (!keys.length) return;
    const key = keys[Math.floor(Math.random() * keys.length)];
    const r = set(key, "", false, true);
    draw(); W.flash("r" + r.id);
    api.status(`DELETE ${key}: appended a tombstone. The old value is still on disk, but the index forgets it.`);
  }
  async function compact() {
    if (busy) return;
    const closed = segs.filter((s) => s.length >= SEG);
    if (closed.length < 2) { api.status("Compaction merges closed segments. Fill at least two segments first (SET more)."); return; }
    busy = true;
    const keepFrom = segs.slice(0, closed.length);
    const newest = new Map();
    for (const s of keepFrom) for (const r of s) newest.set(r.key, r);
    const before = keepFrom.reduce((a, s) => a + s.reduce((b, r) => b + size(r), 0), 0);
    // fade everything that will be dropped first, so you can see what goes
    for (const s of keepFrom) for (const r of s) if (newest.get(r.key) !== r || r.del) W.box("r" + r.id, { opacity: 0.1, y: -1.2 });
    api.status("Compacting: keeping only the newest record of each key, dropping stale values and tombstones…");
    await api.sleep(900);
    // a key whose newest record lives in the active segment doesn't need its old copy at all
    const later = new Set(segs.slice(closed.length).flat().map((r) => r.key));
    const merged = [...newest.values()].filter((r) => !r.del && !later.has(r.key)).sort((a, b) => a.id - b.id);
    segs = [merged, ...segs.slice(closed.length)];
    for (const [k, r] of index) if (!segs.flat().includes(r)) index.delete(k);
    draw();
    const after = merged.reduce((b, r) => b + size(r), 0);
    api.status(`Compacted ${closed.length} segments: ${before} B → ${after} B.\nWrites never stopped: new SETs kept going to the active segment the whole time.`);
    api.explain("Why compact in the background?", "<p>Old segments are never modified, only read, so a background thread can merge them while new writes go to the active segment. When it's done, the index swaps to the new file in one step.</p><p>This is exactly what Bitcask (Riak), LevelDB, RocksDB and Cassandra do.</p>");
    compacted = true;
    busy = false;
    check();
  }
  async function crash() {
    if (busy) return;
    busy = true;
    index = new Map();
    draw();
    api.status("💥 Power cut! Memory is gone, so the index is gone. Disk survived. Replaying the log from the start…");
    await api.sleep(700);
    for (const s of segs) for (const r of s) {
      if (r.del) index.delete(r.key); else index.set(r.key, r);
      draw(); W.flash("r" + r.id);
      await api.sleep(170);
    }
    api.status(`Recovered: ${index.size} keys, every one pointing at its newest record.\nLater records overwrite earlier ones, so replaying in order always ends with the right answer.`);
    recovered = true;
    busy = false;
    check();
  }
  function check() {
    if (compacted && recovered) api.done("Log, index, compaction and recovery: that's a real storage engine");
  }

  api.button("SET", doSet, { primary: true });
  api.button("GET", doGet);
  api.button("DELETE", doDelete);
  api.button("SET ×6", async () => { for (let i = 0; i < 6; i++) { doSet(); await api.sleep(160); } });
  const r2 = api.row();
  api.button("Compact", compact, { row: r2 });
  api.button("💥 Crash", crash, { row: r2 });
  api.button("Reset", reset, { row: r2 });
  mode = "log";
  api.seg([{ label: "append-only log", value: "log" }, { label: "naive: rewrite file", value: "naive" }], "log", (v) => {
    mode = v; draw();
    api.explain(v === "naive" ? "Rewrite the whole file on every SET" : "Append one record per SET",
      v === "naive" ? "<p>The obvious way to save a dict: write all of it to disk after each change. Watch <b>written</b> in the top bar jump by the size of the <i>whole</i> dataset on every SET. With a million keys, one tiny change rewrites gigabytes.</p>"
        : "<p>Each SET writes only its own record, at the end of the file. Appending is the fastest thing a disk can do, and an old record is never touched, so a crash can't corrupt it.</p>");
  });
  api.explain("How to read this", "<p><b>Bottom rows:</b> the log on disk, one row per segment file. Each block is a record (key + value), coloured by key; faded blocks are stale. <b>Top row:</b> the in-memory index, with a line to each key's newest record.</p><p>Click any block to ask why it's there.</p>");
  reset();
});
