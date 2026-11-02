/* Build your own X, chapter 25: a distributed cache.
   Forty cached keys (small cubes) placed around a ring by their hash, and a few cache servers (tall
   blocks). Each key's colour is the server that stores it. Add or remove a server and count how many
   keys move: every moved key is a cache miss, which means a trip to the slow database.
   The "why": the obvious rule, server = hash(key) mod N, reshuffles almost every key when N changes,
   so adding one server empties the whole cache at once. Consistent hashing puts servers on the same
   ring as the keys and gives each key to the next server clockwise: a new server takes keys only
   from its neighbour, about 1/N of them. Virtual nodes (several points per server) even out the load. */
VIZ.register("bx-ring", async (api) => {
  const W = await api.world3d();
  const COLORS = ["c1", "c2", "c3", "c4", "ink"], NK = 40, R = 5;
  const hash = (s) => { let a = 0x811c9dc5; for (let i = 0; i < s.length; i++) a = Math.imul(a ^ s.charCodeAt(i), 16777619); a ^= a >>> 15; a = Math.imul(a, 2246822519); a ^= a >>> 13; return (a >>> 0) / 4294967296; };
  const KEYS = Array.from({ length: NK }, (_, i) => ({ name: `user:${100 + i * 7}`, h: hash(`user:${100 + i * 7}`) }));
  let mode = "mod", vnodes = 1, servers = [0, 1, 2], owner = {}, tried = { mod: null, ring: null }, reached = false, lastMoved = null;
  const points = () => servers.flatMap((s) => Array.from({ length: vnodes }, (_, v) => ({ s, h: hash(`cache-${s}#${v}`) }))).sort((a, b) => a.h - b.h);
  function assign() {
    const o = {};
    if (mode === "mod") KEYS.forEach((k) => (o[k.name] = servers[Math.floor(k.h * 4294967296) % servers.length]));
    else { const P = points(); KEYS.forEach((k) => (o[k.name] = (P.find((p) => p.h >= k.h) || P[0]).s)); }
    return o;
  }
  const at = (h, r) => ({ x: r * Math.cos(h * 2 * Math.PI), z: r * Math.sin(h * 2 * Math.PI) });
  function draw(moved = new Set()) {
    for (let s = 0; s < COLORS.length; s++) for (let v = 0; v < 10; v++) W.remove(`s${s}_${v}`);
    const seen = {};
    if (mode === "ring") points().forEach((p) => {
      seen[p.s] = (seen[p.s] || 0) + 1;
      const key = `s${p.s}_${seen[p.s] - 1}`, { x, z } = at(p.h, R);
      W.box(key, { x, y: vnodes > 1 ? 0.4 : 0.6, z, sx: vnodes > 1 ? 0.3 : 0.5, sy: vnodes > 1 ? 1.1 : 1.6, sz: vnodes > 1 ? 0.3 : 0.5, color: COLORS[p.s], glow: 0.2, label: vnodes === 1 ? `cache ${p.s}` : "", labelSize: 0.32,
        info: { title: `Cache server ${p.s}${vnodes > 1 ? " (one of its virtual nodes)" : ""}`, html: `<p>It stores every key from the previous server point up to here, going clockwise.${vnodes > 1 ? ` It has ${vnodes} points on the ring, so its share is the sum of ${vnodes} arcs, which evens out the luck.` : ""}</p>` } });
    });
    else servers.forEach((s, i) => W.box(`s${s}_0`, { x: -3 + i * 1.5, y: 0.6, z: 0, sx: 0.8, sy: 1.6, sz: 0.8, color: COLORS[s], glow: 0.2, label: `cache ${s}`, labelSize: 0.32,
      info: { title: `Cache server ${s}: slot ${i} of ${servers.length}`, html: `<p>With <b>hash mod N</b> a key goes to slot <code>hash(key) % ${servers.length}</code>. Positions on the ring don't matter, only N does. Change N and nearly every key's slot changes.</p>` } }));
    const count = {};
    KEYS.forEach((k) => {
      const s = owner[k.name], { x, z } = at(k.h, R + 0.9), m = moved.has(k.name);
      count[s] = (count[s] || 0) + 1;
      W.box("k" + k.name, { x, y: m ? 0.9 : 0, z, s: 0.36, color: COLORS[s], glow: m ? 0.6 : 0,
        info: { title: `${k.name} → cache ${s}`, html: `<p>Its hash puts it at ${(k.h * 360).toFixed(0)}° on the ring. ${mode === "ring" ? "It belongs to the first server point clockwise from there." : `With hash mod ${servers.length}, it goes to cache ${s}.`}</p>${m ? "<p>It <b>moved</b> in the last change: the new server doesn't have it yet, so the next request for it is a <b>miss</b> and goes to the database.</p>" : ""}` } });
    });
    const loads = servers.map((s) => count[s] || 0), avg = NK / servers.length;
    api.status(`${mode === "mod" ? "hash mod N" : `consistent hashing, ${vnodes} point${vnodes > 1 ? "s" : ""} per server`} · ${servers.length} servers\n` +
      `keys per server: ${loads.join(" / ")} (busiest ${(Math.max(...loads) / avg).toFixed(2)}× the average)` +
      (lastMoved !== null ? `\nlast change moved ${lastMoved} of ${NK} keys (${Math.round((lastMoved / NK) * 100)}%)` : ""));
  }
  function change(fn, what) {
    const before = owner;
    fn(); owner = assign();
    const moved = new Set(KEYS.filter((k) => before[k.name] !== owner[k.name]).map((k) => k.name));
    lastMoved = moved.size;
    draw(moved);
    if (what === "add") tried[mode] = moved.size;
    const ideal = Math.round(NK / servers.length);
    api.explain(`${what === "add" ? "Added" : "Removed"} a server: ${moved.size} of ${NK} keys moved`, mode === "mod"
      ? `<p>With <b>hash mod N</b>, changing N from ${what === "add" ? servers.length - 1 : servers.length + 1} to ${servers.length} gives most keys a new slot. Every moved key is a cache miss, so the database suddenly gets most of the traffic: a <b>thundering herd</b>.</p><p>Try the same in <b>consistent hashing</b>.</p>`
      : `<p>Only keys in the arc${vnodes > 1 ? "s" : ""} next to the ${what === "add" ? "new" : "removed"} server moved. The ideal is about 1/N of them (≈ ${ideal}); everything else stays where it was cached.</p>`);
    if (tried.mod !== null && tried.ring !== null && tried.ring < tried.mod && !reached) {
      reached = true;
      api.done("You saw consistent hashing move far fewer keys");
    }
  }
  api.button("Add a server", () => { if (servers.length >= COLORS.length) return; const s = [0, 1, 2, 3, 4].find((x) => !servers.includes(x)); change(() => servers.push(s), "add"); }, { primary: true });
  api.button("Remove a server", () => { if (servers.length <= 2) return; change(() => servers.splice(1, 1), "remove"); });
  api.seg([{ label: "hash mod N", value: "mod" }, { label: "consistent hashing", value: "ring" }], mode, (m) => { mode = m; servers = [0, 1, 2]; lastMoved = null; owner = assign(); draw(); });
  api.slider("Virtual nodes per server (ring only)", { min: 1, max: 10, step: 1, value: 1 }, (v) => { vnodes = v; lastMoved = null; owner = assign(); draw(); });
  W.camera({ target: [0, 0, 0], dist: 21, theta: Math.PI / 2, phi: 0.62, instant: true });
  api.hud("cubes = cached keys, coloured by the server that stores them");
  owner = assign(); draw();
  api.explain("How to read this", "<p>Forty keys sit around the ring at the angle their hash gives them. Each key's colour is the cache server that stores it.</p><p>Press <b>Add a server</b> and count the keys that move, then switch to <b>consistent hashing</b> and do it again.</p>");
});
