/* Voxel Network Lab: live simulations for the code tracks.
   A lesson's ```viz block names a file in this folder (learn/viz/<name>.js). That file calls
   VIZ.register(name, setup) and setup(api) builds the simulation. See learn/viz/README.md. */
(function () {
  "use strict";
  const BASE = (document.currentScript && document.currentScript.src || "").replace(/core\.js(\?.*)?$/, "");
  const THREE_URL = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
  const REG = {};
  const loading = {};
  const REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Load a script once. A flaky network or a deploy in progress can fail a load, so try a
  // few times (with a cache-busting query after the first) before giving up, and forget a
  // failure so a later mount can try again.
  function script(src) {
    if (!loading[src]) {
      const once = (url) => new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = url;
        s.onload = res;
        s.onerror = () => { s.remove(); rej(new Error("could not load " + src)); };
        document.head.append(s);
      });
      loading[src] = (async () => {
        for (let i = 0; ; i++) {
          try { return await once(i ? src + (src.includes("?") ? "&" : "?") + "retry=" + Date.now() : src); }
          catch (e) { if (i >= 2) throw e; await new Promise((r) => setTimeout(r, 600 * (i + 1))); }
        }
      })().catch((e) => { delete loading[src]; throw e; });
    }
    return loading[src];
  }
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  function cssColor(name) {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--" + name).trim();
    return v || name;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, REDUCED ? 0 : ms));

  // --------------------------------------------------------------- 3D world --
  async function makeWorld(api) {
    await script(THREE_URL);
    const T = window.THREE;
    const view = api.view;
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    view.prepend(renderer.domElement);
    const scene = new T.Scene();
    const cam = new T.PerspectiveCamera(40, 1, 0.1, 2000);
    scene.add(new T.AmbientLight(0xffffff, 0.62));
    const sun = new T.DirectionalLight(0xffffff, 0.62);
    sun.position.set(6, 12, 9);
    scene.add(sun);
    const back = new T.DirectionalLight(0xffffff, 0.22);
    back.position.set(-8, 4, -6);
    scene.add(back);

    const orbit = { target: new T.Vector3(0, 0, 0), dist: 18, theta: 0.7, phi: 1.05, goal: null };
    function placeCam() {
      const o = orbit;
      if (o.goal) {
        o.target.lerp(o.goal.target, 0.12);
        o.dist += (o.goal.dist - o.dist) * 0.12;
        if (o.target.distanceTo(o.goal.target) < 0.01 && Math.abs(o.goal.dist - o.dist) < 0.01) o.goal = null;
      }
      cam.position.set(
        o.target.x + o.dist * Math.sin(o.phi) * Math.sin(o.theta),
        o.target.y + o.dist * Math.cos(o.phi),
        o.target.z + o.dist * Math.sin(o.phi) * Math.cos(o.theta));
      cam.lookAt(o.target);
    }
    function resize() {
      const w = view.clientWidth, hh = view.clientHeight;
      renderer.setSize(w, hh, false);
      cam.aspect = w / Math.max(1, hh);
      cam.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(view);
    resize();

    const geo = new T.BoxGeometry(1, 1, 1);
    const edges = new T.EdgesGeometry(geo);
    const mats = new Map();
    function mat(color, opacity, glow) {
      const k = color + "|" + opacity + "|" + (glow || 0);
      if (!mats.has(k)) {
        const c = new T.Color(cssColor(color));
        mats.set(k, new T.MeshLambertMaterial({ color: c, transparent: opacity < 1, opacity, emissive: c.clone().multiplyScalar(glow || 0) }));
      }
      return mats.get(k);
    }
    const edgeMat = new T.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 });
    const items = new Map();   // key -> {mesh, target, scale, info}
    const lines = new Map();   // key -> {line, a, b}
    const labels = new Map();  // key -> sprite
    const frames = [];
    let pickFn = null;

    function textSprite(text, color, size) {
      const lines_ = String(text).split("\n");
      const fs = 48;
      const c = document.createElement("canvas");
      const g = c.getContext("2d");
      g.font = `600 ${fs}px "IBM Plex Mono", monospace`;
      const w = Math.max(...lines_.map((l) => g.measureText(l).width)) + 24;
      c.width = Math.ceil(w); c.height = fs * 1.25 * lines_.length + 12;
      g.font = `600 ${fs}px "IBM Plex Mono", monospace`;
      g.fillStyle = cssColor("card");
      g.globalAlpha = 0.82;
      const r = 14;
      g.beginPath(); g.moveTo(r, 0); g.arcTo(c.width, 0, c.width, c.height, r); g.arcTo(c.width, c.height, 0, c.height, r); g.arcTo(0, c.height, 0, 0, r); g.arcTo(0, 0, c.width, 0, r); g.fill();
      g.globalAlpha = 1;
      g.fillStyle = cssColor(color || "ink");
      g.textBaseline = "top";
      lines_.forEach((l, i) => g.fillText(l, 12, 6 + i * fs * 1.25));
      const tex = new T.CanvasTexture(c);
      tex.minFilter = T.LinearFilter;
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      const k = (size || 0.5) / fs;
      sp.scale.set(c.width * k, c.height * k, 1);
      sp.renderOrder = 10;
      return sp;
    }

    const W = {
      THREE: T, scene, camera: cam,
      /* Create or update a voxel. Moving an existing key glides it to the new spot. */
      box(key, o = {}) {
        let it = items.get(key);
        // An update that doesn't mention size keeps the box's current size.
        const sx = o.sx ?? o.s ?? it?.scale.x ?? 1, sy = o.sy ?? o.s ?? it?.scale.y ?? 1, sz = o.sz ?? o.s ?? it?.scale.z ?? 1;
        const color = o.color || "c2", opacity = o.opacity ?? 1;
        if (!it) {
          const mesh = new T.Mesh(geo, mat(color, opacity, o.glow));
          mesh.add(new T.LineSegments(edges, edgeMat));
          mesh.position.set(o.fromX ?? o.x ?? 0, o.fromY ?? o.y ?? 0, o.fromZ ?? o.z ?? 0);
          mesh.scale.set(sx, sy, sz);
          mesh.userData.key = key;
          scene.add(mesh);
          it = { mesh, target: new T.Vector3(), scale: new T.Vector3(sx, sy, sz), pulse: 0 };
          items.set(key, it);
        }
        it.target.set(o.x ?? it.target.x, o.y ?? it.target.y, o.z ?? it.target.z);
        it.scale.set(sx, sy, sz);
        it.mesh.material = mat(color, opacity, o.glow);
        it.mesh.visible = o.visible !== false;
        if (o.info !== undefined) it.info = o.info;
        if (o.label !== undefined) {
          if (it.label) { it.mesh.remove(it.label); it.label.material.map.dispose(); it.label = null; }
          if (o.label !== "" && o.label != null) {
            it.label = textSprite(o.label, o.labelColor, o.labelSize);
            it.labelUp = o.labelUp ?? 0.42;
            it.mesh.add(it.label);
          }
        }
        if (o.instant || REDUCED) it.mesh.position.copy(it.target);
        return W;
      },
      has: (key) => items.has(key),
      pos(key) { const it = items.get(key); return it ? it.target.clone() : null; },
      remove(key) {
        const it = items.get(key);
        if (it) { scene.remove(it.mesh); items.delete(key); }
        for (const [lk, l] of lines) if (l.a === key || l.b === key) { scene.remove(l.line); lines.delete(lk); }
        return W;
      },
      /* A line between two voxel keys (or [x,y,z] points); it follows moving voxels. */
      line(key, a, b, o = {}) {
        let l = lines.get(key);
        if (!l) {
          const g = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]);
          const line = new T.Line(g, new T.LineBasicMaterial({ color: new T.Color(cssColor(o.color || "muted")), transparent: true, opacity: o.opacity ?? 0.9 }));
          scene.add(line);
          l = { line };
          lines.set(key, l);
        } else if (o.color) l.line.material.color = new T.Color(cssColor(o.color));
        l.a = a; l.b = b;
        return W;
      },
      unline(key) { const l = lines.get(key); if (l) { scene.remove(l.line); lines.delete(key); } return W; },
      /* Floating text at a point. */
      label(key, text, p, o = {}) {
        const old = labels.get(key);
        if (old) { scene.remove(old); old.material.map.dispose(); }
        if (text == null || text === "") { labels.delete(key); return W; }
        const sp = textSprite(text, o.color, o.size);
        sp.position.set(p[0], p[1], p[2]);
        scene.add(sp);
        labels.set(key, sp);
        return W;
      },
      flash(key) { const it = items.get(key); if (it) it.pulse = 1; return W; },
      clear() {
        for (const k of [...items.keys()]) W.remove(k);
        for (const k of [...lines.keys()]) W.unline(k);
        for (const k of [...labels.keys()]) W.label(k, null);
        return W;
      },
      /* Point the camera: {target:[x,y,z], dist, theta, phi}. Glides unless instant. */
      camera(o) {
        if (o.theta != null) orbit.theta = o.theta;
        if (o.phi != null) orbit.phi = o.phi;
        const goal = { target: o.target ? new T.Vector3(...o.target) : orbit.target.clone(), dist: o.dist ?? orbit.dist };
        if (o.instant || REDUCED) { orbit.target.copy(goal.target); orbit.dist = goal.dist; orbit.goal = null; }
        else orbit.goal = goal;
        return W;
      },
      onPick(fn) { pickFn = fn; return W; },
      frame(fn) { frames.push(fn); return W; },
      info(key) { return items.get(key)?.info; },
    };

    // --- orbit with drag, wheel and pinch; a click (no drag) picks a voxel
    const ptrs = new Map();
    let moved = 0, pinch0 = 0;
    const el = renderer.domElement;
    el.addEventListener("pointerdown", (e) => { el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
    el.addEventListener("pointermove", (e) => {
      if (!ptrs.has(e.pointerId)) return;
      const p = ptrs.get(e.pointerId), dx = e.clientX - p[0], dy = e.clientY - p[1];
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      moved += Math.abs(dx) + Math.abs(dy);
      if (ptrs.size === 1) {
        orbit.theta -= dx * 0.008;
        orbit.phi = Math.min(Math.PI - 0.12, Math.max(0.12, orbit.phi - dy * 0.008));
      } else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch0) orbit.dist = Math.min(400, Math.max(3, orbit.dist * pinch0 / d));
        pinch0 = d;
      }
      orbit.goal = null;
    });
    const up = (e) => {
      if (ptrs.size === 1 && moved < 6) pick(e);
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch0 = 0;
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", (e) => ptrs.delete(e.pointerId));
    el.addEventListener("wheel", (e) => { e.preventDefault(); orbit.dist = Math.min(400, Math.max(3, orbit.dist * (1 + Math.sign(e.deltaY) * 0.08))); orbit.goal = null; }, { passive: false });
    const ray = new T.Raycaster();
    function pick(e) {
      const r = el.getBoundingClientRect();
      ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cam);
      const hit = ray.intersectObjects([...items.values()].filter((i) => i.mesh.visible).map((i) => i.mesh), false)[0];
      if (!hit) return;
      const key = hit.object.userData.key, it = items.get(key);
      W.flash(key);
      if (pickFn && pickFn(key, it.info) === false) return;
      if (it.info) api.explain(it.info.title || key, it.info.html || "");
    }

    // --- render loop, only while the simulation is on screen
    const tmpA = new T.Vector3(), tmpB = new T.Vector3();
    const endpoint = (x, v) => { if (Array.isArray(x)) return v.set(x[0], x[1], x[2]); const it = items.get(x); return it ? v.copy(it.mesh.position) : null; };
    let last = performance.now();
    api.loop((dt) => {
      for (const it of items.values()) {
        it.mesh.position.lerp(it.target, Math.min(1, dt * 9));
        const p = it.pulse > 0 ? 1 + 0.35 * Math.sin(it.pulse * Math.PI) : 1;
        if (it.pulse > 0) it.pulse = Math.max(0, it.pulse - dt * 2.2);
        it.mesh.scale.set(it.scale.x * p, it.scale.y * p, it.scale.z * p);
        if (it.label) {
          it.label.position.set(0, 0.5 + it.labelUp / it.scale.y, 0);
          // sprites inherit the voxel's scale: undo it so labels keep their size
          if (!it.label.userData.base) it.label.userData.base = it.label.scale.clone();
          const b = it.label.userData.base;
          it.label.scale.set(b.x / it.mesh.scale.x, b.y / it.mesh.scale.y, 1);
        }
      }
      for (const l of lines.values()) {
        const a = endpoint(l.a, tmpA), b = endpoint(l.b, tmpB);
        if (!a || !b) { l.line.visible = false; continue; }
        l.line.visible = true;
        const pos = l.line.geometry.attributes.position;
        pos.setXYZ(0, a.x, a.y, a.z); pos.setXYZ(1, b.x, b.y, b.z); pos.needsUpdate = true;
        l.line.geometry.computeBoundingSphere();
      }
      for (const f of frames) f(dt);
      placeCam();
      renderer.render(scene, cam);
      last = performance.now();
    });
    api.tip("drag to spin · scroll to zoom · click a block to ask why");
    return W;
  }

  // ------------------------------------------------------------------ api --
  function makeApi(stage, opts) {
    stage.textContent = "";
    const view = h("div", { class: "vz-view", style: `height:${opts.height || 380}px` });
    const hud = h("div", { class: "vz-hud" });
    const tipEl = h("div", { class: "vz-tip" });
    view.append(hud, tipEl);
    const ctl = h("div", { class: "vz-ctl" });
    const explainEl = h("div", { class: "vz-explain", hidden: true });
    const statusEl = h("div", { class: "vz-status" });
    const side = h("div", { class: "vz-side" }, ctl, statusEl, explainEl);
    stage.append(h("div", { class: "vz" }, view, side));
    let row = null;
    const loops = [];
    let visible = true;
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(view);
    let prev = performance.now();
    function tick(now) {
      if (!document.body.contains(stage)) return; // the step was left: stop for good
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      if (visible) for (const f of loops) f(dt, now / 1000);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    const api = {
      root: stage, view, ctl, wasDone: !!opts.wasDone, key: opts.key, h, sleep, REDUCED,
      color: cssColor,
      done(msg) { opts.done && opts.done(msg); },
      row() { row = h("div", { class: "row" }); ctl.append(row); return row; },
      button(label, fn, o = {}) {
        const b = h("button", { class: "btn small" + (o.primary ? " primary" : "") }, label);
        b.onclick = () => fn(b);
        (o.row || row || api.row()).append(b);
        return b;
      },
      slider(label, o, fn) {
        const out = h("b", {}, String(o.value));
        const inp = h("input", { type: "range", min: o.min, max: o.max, step: o.step || 1, value: o.value });
        const fmt = o.format || ((v) => v);
        out.textContent = fmt(+inp.value);
        inp.oninput = () => { out.textContent = fmt(+inp.value); fn && fn(+inp.value); };
        const lab = h("label", {}, h("span", {}, label + ": ", out), inp);
        ctl.append(lab);
        row = null;
        return { el: inp, get: () => +inp.value, set(v) { inp.value = v; out.textContent = fmt(+v); } };
      },
      seg(options, value, fn) {
        const wrap = h("div", { class: "vz-seg", role: "group" });
        let cur = value;
        const btns = options.map((o) => {
          const op = typeof o === "object" ? o : { label: String(o), value: o };
          const b = h("button", { class: op.value === cur ? "on" : "" }, op.label);
          b.onclick = () => { cur = op.value; btns.forEach((x) => x.classList.toggle("on", x === b)); fn && fn(cur); };
          wrap.append(b);
          return b;
        });
        api.row().append(wrap);
        row = null;
        return { el: wrap, get: () => cur };
      },
      text(label, value, fn, o = {}) {
        const inp = h("input", { type: "text", value, spellcheck: "false", autocomplete: "off", placeholder: o.placeholder || "" });
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") fn(inp.value); });
        if (o.live) inp.addEventListener("input", () => fn(inp.value));
        const lab = h("label", {}, label, inp);
        ctl.append(lab);
        row = null;
        return { el: inp, get: () => inp.value, set(v) { inp.value = v; } };
      },
      explain(title, html) { explainEl.hidden = false; explainEl.innerHTML = ""; explainEl.append(h("h5", {}, title), h("div", { html })); },
      status(text) { statusEl.textContent = text == null ? "" : String(text); },
      statusHTML(html) { statusEl.innerHTML = html; },
      hud(html) { hud.innerHTML = html || ""; },
      tip(text) { tipEl.textContent = text || ""; },
      loop(fn) { loops.push(fn); return () => loops.splice(loops.indexOf(fn), 1); },
      world3d() { return makeWorld(api); },
      /* A crisp 2-D canvas filling the view. draw(g, w, h) is called on resize and by redraw(). */
      canvas2d(draw) {
        const c = h("canvas");
        view.prepend(c);
        view.style.cursor = "default";
        const g = c.getContext("2d");
        const cv = { canvas: c, g, w: 0, h: 0, redraw() { if (cv.w) { g.setTransform(cv.dpr, 0, 0, cv.dpr, 0, 0); g.clearRect(0, 0, cv.w, cv.h); draw && draw(g, cv.w, cv.h); } } };
        new ResizeObserver(() => {
          cv.dpr = Math.min(2, window.devicePixelRatio || 1);
          cv.w = view.clientWidth; cv.h = view.clientHeight;
          c.width = cv.w * cv.dpr; c.height = cv.h * cv.dpr;
          cv.redraw();
        }).observe(view);
        return cv;
      },
    };
    return api;
  }

  window.VIZ = {
    register(name, setup) { REG[name] = setup; },
    async mount(name, stage, opts = {}) {
      if (!REG[name]) await script(BASE + name + ".js");
      if (!REG[name]) throw new Error(`learn/viz/${name}.js did not call VIZ.register("${name}", …)`);
      const api = makeApi(stage, opts);
      await REG[name](api);
      return api;
    },
    cssColor, sleep,
  };
})();
