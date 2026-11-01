/* Build your own X, chapter 8: git from scratch.
   Commits (top) point at trees (middle) which point at blobs (bottom). Every object is named by
   a hash of its content, so unchanged files are shared between snapshots instead of copied.
   The "why": compare against "copy every file into every commit" and watch the object count. */
VIZ.register("bx-git", async (api) => {
  const W = await api.world3d();
  W.camera({ target: [1.5, 0.6, -1], dist: 17, theta: 0.35, phi: 1.12, instant: true });

  const FILES = ["a.txt", "b.txt", "c.txt"];
  const BASE = { "a.txt": "apple", "b.txt": "banana", "c.txt": "cherry" };
  const LANE = { main: 0, feature: -3.2 };
  const SP = 2.8; // x spacing between commits

  // A short demo hash (FNV-1a). Real git uses SHA-1 (40 hex characters): same idea, longer name.
  function hash(kind, body) {
    const s = `${kind} ${body.length}\0${body}`;
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    let g = 0x12345678;
    for (let i = s.length - 1; i >= 0; i--) { g ^= s.charCodeAt(i); g = Math.imul(g, 0x01000193) >>> 0; }
    return (h.toString(16).padStart(8, "0") + g.toString(16).padStart(8, "0")).slice(0, 7);
  }

  let objs, refs, head, work, commits, ver, mode = "share", didMerge = false, lastNew = [];
  function put(kind, body, extra) {
    const oid = hash(kind, body);
    const fresh = !objs[oid];
    if (fresh) objs[oid] = Object.assign({ kind, body }, extra);
    return { oid, fresh };
  }
  function writeTree(files) {
    const made = [];
    const entries = {};
    for (const n of FILES) if (files[n] != null) {
      const b = put("blob", files[n]);
      entries[n] = b.oid;
      if (b.fresh) made.push("blob " + n);
    }
    const body = Object.keys(entries).sort().map((n) => `${n} ${entries[n]}`).join("\n");
    const t = put("tree", body, { entries });
    if (t.fresh) made.push("tree");
    return { oid: t.oid, made };
  }
  const filesOf = (c) => { if (!c) return {}; const e = objs[objs[c].tree].entries, out = {}; for (const n in e) out[n] = objs[e[n]].body; return out; };
  const same = (a, b) => FILES.every((n) => (a[n] ?? null) === (b[n] ?? null));
  const dirty = () => !same(work, filesOf(refs[head]));

  function makeCommit(message, parents, files) {
    const t = writeTree(files);
    const body = `tree ${t.oid}\n` + parents.map((p) => `parent ${p}\n`).join("") + `\n${message}`;
    const c = put("commit", body, { tree: t.oid, parents, message });
    commits.push({ oid: c.oid, z: LANE[head] });
    refs[head] = c.oid;
    lastNew = [...t.made, "commit"];
    return c.oid;
  }
  function ancestors(c) { const seen = new Set(), st = [c]; while (st.length) { const x = st.pop(); if (x && !seen.has(x)) { seen.add(x); st.push(...objs[x].parents); } } return seen; }
  function mergeBase(a, b) {
    const A = ancestors(a), q = [b], vis = new Set();
    while (q.length) { const x = q.shift(); if (A.has(x)) return x; if (!vis.has(x)) { vis.add(x); q.push(...objs[x].parents); } }
    return null;
  }

  // ---- drawing (a full redraw; blocks that are new this time drop in from above)
  let shown = new Set();
  function draw() {
    const before = shown;
    shown = new Set();
    W.clear();
    const B = (key, o) => { if (!before.has(key)) o.fromY = o.y + 2.5; shown.add(key); W.box(key, o); };
    const placed = new Map(), usage = {};
    commits.forEach((c) => { for (const b of Object.values(objs[objs[c.oid].tree].entries)) usage[b] = (usage[b] || 0) + 1; });
    const ckey = (oid) => "c:" + oid;
    commits.forEach((c, i) => {
      const o = objs[c.oid], x = i * SP, z = c.z;
      const pl = o.parents.map((p) => p.slice(0, 7)).join(", ") || "none (first commit)";
      B(ckey(c.oid), { x, y: 2.4, z, s: 0.9, color: "c1", label: c.oid.slice(0, 5) + "\n" + o.message, labelSize: 0.3,
        info: { title: `Commit ${c.oid}`, html: `<p><b>tree</b> ${o.tree}<br><b>parent</b> ${pl}<br><b>message</b> “${o.message}”</p><p>A commit is a tiny text object. Its id is the hash of that text, and the text contains the <b>parent's id</b>. So this id depends on the whole history behind it: change any old commit and every id after it changes. That's why history is tamper-evident.</p>${o.parents.length === 2 ? "<p>This is a <b>merge commit</b>: it has <b>two</b> parents, one from each branch.</p>" : ""}` } });
      const tk = mode === "share" ? "t:" + o.tree : "t:" + o.tree + ":" + i;
      if (!placed.has(tk)) {
        placed.set(tk, i);
        const lines = Object.entries(objs[o.tree].entries).map(([n, b]) => `${n} → ${b}`).join("<br>");
        B(tk, { x, y: 0.9, z, s: 0.75, color: "c3", label: "tree " + o.tree.slice(0, 4), labelSize: 0.26,
          info: { title: `Tree ${o.tree}`, html: `<p>${lines}</p><p>A tree is a folder: a sorted list of <b>name → blob id</b>. The name lives here, not in the blob, so two files with the same content share one blob.</p><p>Why a separate object? If nothing in a folder changed, its tree id is the same, and the new commit can reuse the <i>whole folder</i> with one id.</p>` } });
      }
      W.line("lt" + i, ckey(c.oid), tk, { color: "c3" });
      o.parents.forEach((p, k) => W.line(`lp${i}_${k}`, ckey(c.oid), ckey(p), { color: k ? "c4" : "c1" }));
      FILES.forEach((n, fi) => {
        const b = objs[o.tree].entries[n];
        if (!b) return;
        const bk = mode === "share" ? "b:" + b : "b:" + b + ":" + i;
        const shared = placed.has(bk);
        if (!shared) {
          placed.set(bk, i);
          const conflict = objs[b].body.startsWith("<<<");
          B(bk, { x: x + (fi - 1) * 0.8, y: -0.6, z, s: 0.6, color: conflict ? "bad" : "c2", label: conflict ? n + "\nCONFLICT" : objs[b].body, labelSize: 0.24,
            info: { title: `Blob ${b} (${n})`, html: `<p>Content: <code>${objs[b].body.replace(/</g, "&lt;")}</code></p><p>A blob is just the file's bytes, named by their hash. ${mode === "share" ? `This one is used by <b>${usage[b]}</b> commit(s) but stored <b>once</b>: same content → same id → same dictionary key.` : `In <b>copy</b> mode every commit stores its own copy, even when the content is identical. Count the boxes: that's the waste hashing avoids.`}</p>${conflict ? "<p>Both branches changed this file differently since the merge base, so a three-way merge can't decide. Git writes conflict markers and asks you.</p>" : ""}` } });
        }
        W.line(`lb${i}_${fi}`, tk, bk, { color: shared ? "muted" : "c2", opacity: shared ? 0.55 : 0.9 });
      });
    });
    // branch labels
    const byCommit = {};
    for (const [name, c] of Object.entries(refs)) (byCommit[c] = byCommit[c] || []).push((name === head ? "HEAD→" : "") + name);
    for (const [c, names] of Object.entries(byCommit)) {
      const i = commits.findIndex((k) => k.oid === c), p = [i * SP, 3.75, commits[i].z];
      W.label("ref" + c, names.join("  "), p, { color: names.some((s) => s.startsWith("HEAD")) ? "c4" : "muted", size: 0.38 });
    }
    // working folder
    const hf = filesOf(refs[head]);
    FILES.forEach((n, fi) => {
      const ch = work[n] !== hf[n];
      B("w:" + n, { x: -3.6 + (fi - 1) * 0.8, y: -0.6, z: LANE[head], s: 0.6, color: ch ? "c4" : "c5", glow: ch ? 0.4 : 0, label: n + "\n" + work[n], labelSize: 0.22,
        info: { title: `Working file ${n}`, html: `<p>This is the file on your disk right now: <code>${work[n]}</code>.</p><p>${ch ? "It's <b>amber</b> because it differs from the commit HEAD points at. Commit to snapshot it." : "Grey means it matches HEAD's commit exactly."}</p><p>Git doesn't track edits as you type. It only looks when you commit: hash every file, and any hash it already has costs nothing.</p>` } });
    });
    W.label("wd", "your folder\n(" + head + ")", [-3.6, 1.0, LANE[head]], { color: "muted", size: 0.3 });
    const xs = commits.map((_, i) => i * SP);
    const mid = (Math.min(-3.6, ...xs) + Math.max(...xs)) / 2, width = Math.max(...xs) + 4.5;
    W.camera({ target: [mid, 0.6, -1.4], dist: Math.max(15, width * 1.05 + 5) });
    const naive = commits.length * (FILES.length + 2);
    api.hud(`objects stored: <b>${mode === "share" ? Object.keys(objs).length : naive}</b>` + (mode === "share" ? ` · copying every file would need ${naive}` : ` (copy mode) · hashing needs only ${Object.keys(objs).length}`));
  }

  function reset() {
    objs = {}; refs = {}; head = "main"; commits = []; ver = { "a.txt": 1, "b.txt": 1, "c.txt": 1 }; didMerge = false; shown = new Set();
    work = { ...BASE };
    makeCommit("start", [], work);
    work = { ...work, "a.txt": "apple 2" }; ver["a.txt"] = 2;
    makeCommit("edit a", [refs.main], work);
    draw();
    api.status("Two commits on main. Pick a file, Edit it, then Commit.");
  }

  // ---- controls
  let file = "b.txt";
  api.seg(FILES.map((f) => ({ label: f, value: f })), file, (v) => { file = v; });
  api.button("Edit file", () => {
    ver[file]++;
    work = { ...work, [file]: BASE[file] + " " + ver[file] };
    draw(); W.flash("w:" + file);
    api.status(`${file} is now “${work[file]}” on disk (amber = not committed yet).`);
  });
  api.button("Commit", () => {
    if (!dirty()) { api.status("Nothing to commit: every file matches HEAD. Edit a file first."); return; }
    const c = makeCommit("edit " + FILES.filter((n) => work[n] !== filesOf(refs[head])[n]).map((n) => n[0]).join("+"), [refs[head]], work);
    draw(); W.flash("c:" + c);
    const reused = FILES.length - lastNew.filter((s) => s.startsWith("blob")).length;
    api.status(`commit ${c} on ${head}\nnew objects: ${lastNew.join(", ")}\nreused: ${reused} blob(s), drawn as grey lines back to old blocks`);
  }, { primary: true });
  api.button("Branch", () => {
    if (refs.feature) { api.status("The branch 'feature' already exists. Checkout switches between main and feature."); return; }
    refs.feature = refs[head];
    draw();
    api.status(`Created 'feature' at ${refs.feature}. That's ONE new pointer, not a copy of any file.\nNow press Checkout to switch to it.`);
  });
  api.button("Checkout", () => {
    if (!refs.feature) { api.status("Only 'main' exists. Press Branch first."); return; }
    if (dirty()) { api.status("You have uncommitted edits (amber). Commit them first, or they'd be lost."); return; }
    head = head === "main" ? "feature" : "main";
    work = filesOf(refs[head]);
    draw();
    api.status(`HEAD → ${head}. Your folder now holds that commit's files. Checkout = read a tree back out.`);
  });
  api.button("Merge", async () => {
    const other = head === "main" ? "feature" : "main";
    if (!refs[other]) { api.status("Make a branch and commit on it first."); return; }
    if (dirty()) { api.status("Commit your edits before merging."); return; }
    const base = mergeBase(refs[head], refs[other]);
    W.flash("c:" + base);
    if (base === refs[other]) { api.status(`'${other}' has nothing new: it's already part of ${head}'s history.`); return; }
    if (base === refs[head]) {
      refs[head] = refs[other]; work = filesOf(refs[head]); draw();
      api.status(`Fast-forward: ${head} had no commits of its own since ${base}, so git just moves the pointer.\nNo merge commit needed. Commit on BOTH branches to see a real merge.`);
      return;
    }
    const b = filesOf(base), o = filesOf(refs[head]), t = filesOf(refs[other]), out = {}, conflicts = [];
    for (const n of FILES) {
      const [bb, oo, tt] = [b[n], o[n], t[n]];
      let r;
      if (oo === tt) r = oo; else if (oo === bb) r = tt; else if (tt === bb) r = oo;
      else { r = `<<< ${oo} | ${tt} >>>`; conflicts.push(n); }
      if (r != null) out[n] = r;
    }
    api.status(`merge base = ${base} (the newest commit both branches share)\nthree-way merge, file by file…`);
    await api.sleep(700);
    work = out;
    const c = makeCommit("merge " + other, [refs[head], refs[other]], out);
    draw(); W.flash("c:" + c);
    const lines = FILES.map((n) => `  ${n}: base “${b[n]}” · ours “${o[n]}” · theirs “${t[n]}” → ${conflicts.includes(n) ? "CONFLICT" : "“" + out[n] + "”"}`);
    api.status(`merge commit ${c} has TWO parents\n` + lines.join("\n"));
    api.explain(conflicts.length ? "Merged, with a conflict" : "A clean three-way merge", `<p>For each file the merge asked: who changed it since the <b>merge base</b>? Only one side → take that side. Neither → keep it. Both, differently → <b>conflict</b>.</p><p>Without the base (just comparing ours vs theirs) every difference would look like a conflict, because you couldn't tell <i>who</i> changed it.</p>${conflicts.length ? `<p>${conflicts.join(", ")} changed on both branches. Real git stops here and asks you to fix it; we kept both sides with markers so you can see it.</p>` : ""}`);
    if (!didMerge) { didMerge = true; api.done("Branch, commit on both sides, merge: that's the whole git workflow"); }
  });
  api.seg([{ label: "share by hash", value: "share" }, { label: "naive: copy every file", value: "copy" }], "share", (v) => { mode = v; shown = new Set(); draw(); api.status(v === "copy" ? "Copy mode: every commit stores every file again. Look at the object count in the corner." : "Share mode: same content → same id → stored once."); });
  api.button("Reset", reset);
  api.explain("How to read this", "<p><b>Red</b> = commits, <b>green</b> = trees (folders), <b>blue</b> = blobs (file contents). The grey-and-amber blocks on the left are the files on your disk.</p><p>Edit a file and Commit: only one blob, one tree and one commit are new. Grey lines reach back to blobs an earlier commit already stored.</p>");
  reset();
});
