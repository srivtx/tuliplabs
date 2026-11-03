/* Build your own X, chapter 33: a container runtime.
   An image made of three layers (a base OS, Python, the app) and three containers started from it.
   The "why": giving every container its own full copy of the image costs the whole image again for
   each one, and starting means copying hundreds of megabytes. A layered filesystem stacks
   read-only layers that every container shares, and gives each container only a thin writable
   layer on top. Reading looks down through the stack; writing a file copies it up into the
   container's own layer first (copy-on-write); deleting leaves a "whiteout" marker. */
VIZ.register("bx-container", async (api) => {
  const W = await api.world3d();
  const LAYERS = [{ name: "base OS", mb: 80, color: "c5" }, { name: "python", mb: 50, color: "c2" }, { name: "app", mb: 5, color: "c3" }];
  const IMG = LAYERS.reduce((s, l) => s + l.mb, 0);
  let mode = "copy", gen = null, boxes = [], upper = [[], [], []], started = 0, disk = 0, copied = 0, running = false, ran = {}, reached = false, line = "";
  function* copyAll() {
    disk = IMG; yield `the image is on disk: ${IMG} MB in three layers`;
    for (let c = 0; c < 3; c++) { started = c + 1; disk += IMG; copied += IMG; yield `start container ${c + 1}: copy the whole image first, ${IMG} MB. Disk: ${disk} MB`; }
    upper[1].push("config.py"); yield `container 2 edits config.py in its own copy. Nothing else changes`;
    upper[2].push("✕ tests/"); yield `container 3 deletes tests/ from its own copy`;
    yield `${disk} MB on disk, ${copied} MB copied before anything could start`;
  }
  function* layered() {
    disk = IMG; yield `the image is on disk: ${IMG} MB in three read-only layers`;
    for (let c = 0; c < 3; c++) { started = c + 1; yield `start container ${c + 1}: stack an empty writable layer on the shared image. Nothing is copied`; }
    upper[1].push("config.py"); disk += 1; copied += 1;
    yield `container 2 writes config.py: it's found in the app layer, copied up into container 2's own layer (1 MB), then changed. The others still see the original`;
    upper[2].push("✕ tests/");
    yield `container 3 deletes tests/: the layers below are read-only, so it writes a whiteout marker that hides it, for container 3 only`;
    yield `${disk} MB on disk, ${copied} MB copied. Reading a file looks down through the stack, top first`;
  }
  function draw() {
    const cp = mode === "copy";
    // the image itself, bottom left
    LAYERS.forEach((l, i) => W.box("img" + i, { x: -2.8, y: -1.2 + i * 0.55, z: 0, sx: 1.6, sy: 0.45, sz: 0.6, color: l.color, opacity: 0.92, label: `${l.name} ${l.mb} MB`, labelSize: 0.14, labelUp: 0,
      info: { title: `Image layer: ${l.name}`, html: `<p>${l.mb} MB, read-only. ${cp ? "Copied whole into every container." : "Shared by every container."}</p>` } }));
    W.label("imgl", "image", [-2.8, 0.65, 0.2], { color: "muted", size: 0.16 });
    for (let c = 0; c < 3; c++) {
      const x = -0.75 + c * 1.6, on = c < started;
      LAYERS.forEach((l, i) => W.box(`c${c}l${i}`, { x, y: -1.2 + i * 0.55, z: 0, sx: 1.4, sy: 0.45, sz: 0.6, visible: on, color: l.color, opacity: cp ? 0.92 : 0.18,
        label: cp ? `copy of ${l.name}` : "", labelSize: 0.12, labelUp: 0, info: { title: cp ? `Container ${c + 1}'s copy of ${l.name}` : `Shared ${l.name}`, html: cp ? `<p>${l.mb} MB of disk, duplicated.</p>` : `<p>Not stored again: this container looks through to the shared image layer.</p>` } }));
      W.box(`c${c}up`, { x, y: -1.2 + 3 * 0.55, z: 0, sx: 1.4, sy: 0.45, sz: 0.6, visible: on, color: upper[c].length ? "c4" : "line", opacity: on ? 0.92 : 0, label: upper[c].length ? upper[c].join(" ") : cp ? "" : "writable (empty)", labelSize: 0.13, labelUp: 0,
        info: { title: `Container ${c + 1}'s writable layer`, html: `<p>${upper[c].length ? `Holds: ${upper[c].join(", ")}.` : "Empty until the container writes something."}</p>` } });
      W.label(`cl${c}`, on ? `container ${c + 1}` : "", [x, 1.05, 0.2], { color: "ink", size: 0.16 });
      if (!cp && on) LAYERS.forEach((_, i) => W.line(`ln${c}${i}`, "img" + i, `c${c}l${i}`, { color: "line" }));
      else LAYERS.forEach((_, i) => W.unline(`ln${c}${i}`));
    }
    W.label("disk", `disk: ${disk} MB · copied: ${copied} MB`, [0.6, -2.0, 0.2], { color: "ink", size: 0.2 });
  }
  function show() { api.status(`${mode === "copy" ? "full copy per container" : "shared layers + copy-on-write"} · ${disk} MB on disk\n${line}`); }
  function reset() { started = 0; upper = [[], [], []]; disk = 0; copied = 0; line = ""; gen = mode === "copy" ? copyAll() : layered(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = disk;
    if (mode === "copy") api.explain(`${disk} MB`, `<p>Three containers cost three more images, and each had to wait for a ${IMG} MB copy before starting.</p><p>Switch to <b>shared layers + copy-on-write</b> and run it.</p>`);
    else if (ran.copy !== undefined && !reached) { reached = true; api.explain("Share what doesn't change", `<p>${disk} MB against ${ran.copy}. Containers start instantly because nothing is copied, and only what a container changes is stored for it.</p><p>That's overlayfs, the filesystem under Docker. Isolation comes from namespaces, limits from cgroups.</p>`); api.done("You layered a filesystem"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(1000); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "full copy per container", value: "copy" }, { label: "shared layers + copy-on-write", value: "layers" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [-0.2, -0.2, 0], dist: 10.5, theta: 0, phi: 1.5, instant: true });
  api.hud("left: the image's three layers · right: three containers · amber = a container's own writable layer · faded = looking through to the shared layer");
  reset();
  api.explain("How to read this", `<p>Start three containers from one image. <b>Run all</b> with <b>full copy per container</b>, then with <b>shared layers + copy-on-write</b>.</p>`);
});
