/* Build your own X, chapter 22: a blockchain.
   A row of blocks. Each block stores some data, the hash of the block before it, and a nonce; its own
   hash must start with enough zeros (proof of work). Click a block to tamper with its data: its hash
   changes, so it stops being valid, and the next block's "previous hash" no longer matches. Mining
   repairs a block by searching nonces, one hash at a time.
   The "why": linking each block to the previous one's hash means changing old data forces you to
   redo the work for every block after it. Without the links, a forger only re-mines one block. */
VIZ.register("bx-chain", async (api) => {
  const W = await api.world3d();
  const DATA = ["genesis", "Ana→Ben 5", "Ben→Cy 2", "Cy→Dee 1", "Dee→Ana 3"];
  const EVIL = { 1: "Ana→Ben 500", 2: "Ben→Eve 2", 3: "Cy→Eve 9", 4: "Dee→Eve 3" };
  // A toy 32-bit hash (FNV-1a, mixed twice), shown as 8 hex digits. Real chains use SHA-256.
  function hash(s) {
    let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
    for (let i = 0; i < s.length; i++) { a = Math.imul(a ^ s.charCodeAt(i), 16777619); b = Math.imul(b ^ a, 2246822519); }
    a ^= b >>> 15; a = Math.imul(a, 2654435761); a ^= a >>> 13;
    return (a >>> 0).toString(16).padStart(8, "0");
  }
  let linked = true, diff = 2, work = 0, tampered = false, reached = false;
  let blocks = [], mining = null;
  const content = (b, i) => (linked ? `${i}|${b.prev}|${b.data}|${b.nonce}` : `${i}|${b.data}|${b.nonce}`);
  const okHash = (b) => b.hash.startsWith("0".repeat(diff));
  const okLink = (i) => !linked || i === 0 || blocks[i].prev === blocks[i - 1].hash;
  const valid = (i) => okHash(blocks[i]) && okLink(i);
  function rehash(i) { blocks[i].hash = hash(content(blocks[i], i)); }
  function mineNow(i) {
    const b = blocks[i];
    b.prev = i ? blocks[i - 1].hash : "00000000";
    for (b.nonce = 0; ; b.nonce++) { rehash(i); if (okHash(b)) return; }
  }
  function reset() {
    blocks = DATA.map((data) => ({ data, prev: "", nonce: 0, hash: "" }));
    blocks.forEach((_, i) => mineNow(i));
    work = 0; tampered = false; mining = null;
  }
  const X = (i) => (i - (DATA.length - 1) / 2) * 2.05;
  function draw() {
    blocks.forEach((b, i) => {
      const v = valid(i), busy = mining && mining.i === i;
      W.box("b" + i, { x: X(i), y: 0.9, z: 0, sx: 1.6, sy: 1.3, sz: 0.8, color: busy ? "c4" : v ? "c3" : "bad", glow: busy ? 0.5 : 0,
        label: `#${i}\n${b.data}\nnonce ${b.nonce}`, labelSize: 0.235, labelUp: 0.2,
        info: { title: `Block ${i}: ${v ? "valid" : "broken"}`, html: `<p>Data: <b>${b.data}</b>. ${linked ? `Previous hash: <code>${b.prev}</code>. ` : ""}Nonce: ${b.nonce}.</p><p>Its hash is the hash of all of that${linked ? ", <b>including the previous block's hash</b>" : ""}. ${!okHash(b) ? `Right now it doesn't start with ${diff} zeros, so this block shows no proof of work.` : !okLink(i) ? "Its own hash is fine, but the previous hash it stores no longer matches the block before it: that block was changed." : "Everything checks out."}</p><p><b>Click it</b> (the block itself) to tamper with its data.</p>` } });
      W.box("h" + i, { x: X(i), y: -0.15, z: 0, sx: 1.5, sy: 0.4, sz: 0.5, color: okHash(b) ? "c2" : "bad", opacity: 0.9,
        label: b.hash, labelSize: 0.25, labelUp: -0.55,
        info: { title: `Hash of block ${i}: ${b.hash}`, html: `<p>A hash turns any text into a short fingerprint. Change one letter of the input and the output changes completely, in a way nobody can predict.</p><p><b>Proof of work:</b> the hash must start with ${diff} zero${diff > 1 ? "s" : ""}. The only way to find one is to try nonce after nonce, about 16<sup>${diff}</sup> = ${16 ** diff} tries on average.</p>` } });
      if (i > 0) {
        const ok = okLink(i);
        W.line("l" + i, "h" + (i - 1), "b" + i, { color: linked ? (ok ? "c3" : "bad") : "line", opacity: linked ? 0.9 : 0.25 });
      }
    });
    const bad = blocks.map((_, i) => i).filter((i) => !valid(i));
    api.status(`${linked ? "linked chain" : "unlinked blocks"} · difficulty ${diff} zeros (~${16 ** diff} tries per block)\n` +
      (mining ? `mining block ${mining.i}… nonce ${blocks[mining.i].nonce}` : bad.length ? `broken: ${bad.map((i) => "#" + i).join(", ")}` : "every block valid") +
      `   ·   hashes tried since reset: ${work}`);
    if (linked && tampered && !bad.length && !mining && !reached) {
      reached = true;
      api.explain("You rewrote history", `<p>To change one old block you had to redo the proof of work for it <b>and every block after it</b>: ${work} hashes. On a real network, honest miners keep adding blocks while you do this, so you'd need more computing power than all of them together to catch up.</p><p>Try <b>unlinked blocks</b>: there, a forger re-mines only the block they changed.</p>`);
      api.done("You tampered with a block and re-mined the chain");
    }
  }
  function startMine(i) { blocks[i].prev = i && linked ? blocks[i - 1].hash : linked ? "00000000" : ""; blocks[i].nonce = 0; mining = { i }; }
  function nextBroken() { return blocks.findIndex((_, i) => !valid(i)); }
  api.loop(() => {
    if (!mining) return;
    const b = blocks[mining.i];
    for (let k = 0; k < 60; k++) {
      rehash(mining.i); work++;
      if (okHash(b)) { W.flash("b" + mining.i); mining = null; break; }
      b.nonce++;
    }
    draw();
  });
  function tamper(i) {
    blocks[i].data = blocks[i].data === EVIL[i] ? DATA[i] : EVIL[i];
    rehash(i); tampered = true; draw();
    api.explain(`You changed block ${i}`, `<p>Its data now says <b>${blocks[i].data}</b>. Its hash changed completely, so it no longer starts with ${diff} zeros${linked && i < blocks.length - 1 ? `, and block ${i + 1} still points at the old hash` : ""}.</p><p>Press <b>Mine next broken block</b> to repair the chain.</p>`);
  }
  W.onPick((key) => {
    const m = /^b(\d)$/.exec(key);
    if (!m || mining) return;
    const i = +m[1];
    if (i === 0) { api.explain("The genesis block", "<p>The first block has no block before it. Try tampering with a later one.</p>"); return false; }
    tamper(i);
    return false;
  });
  api.button("Mine next broken block", () => { if (mining) return; const i = nextBroken(); if (i >= 0) startMine(i); draw(); }, { primary: true });
  api.button("Tamper with block 1", () => { if (!mining && blocks[1].data !== EVIL[1]) tamper(1); });
  api.button("Reset", () => { reset(); draw(); });
  api.seg([{ label: "linked chain", value: true }, { label: "unlinked blocks", value: false }], linked, (v) => { linked = v; reset(); reached = false; draw(); });
  api.slider("Difficulty (leading zeros)", { min: 1, max: 3, step: 1, value: diff, format: (v) => `${v} (~${16 ** v} tries)` }, (v) => { diff = v; reset(); draw(); });
  W.camera({ target: [0, 0.4, 0], dist: 14.6, theta: 0, phi: 1.42, instant: true });
  api.hud("click a block to tamper with it · green = valid · red = broken");
  reset(); draw();
  api.explain("How to read this", "<p>Each block's fingerprint (blue, its <b>hash</b>) depends on its data, a <b>nonce</b>, and the previous block's hash. A block counts only if its hash starts with zeros, which takes many tries to find.</p><p>Tamper with block 1 and see what breaks.</p>");
});
