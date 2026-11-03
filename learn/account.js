/* Sign in and sync. Guests come first: nobody has to sign in to learn, and progress always lives in
   this browser (vnl-code-v1, vnl-progress). Signing in only carries that progress between devices.
   Supabase holds one row per person (see docs/supabase.sql); row-level security lets each person
   read and write only their own row, so the public key below can't reach anyone else's.

   The key below is Supabase's publishable key: it's meant to be in the page. */
(() => {
  const CFG = { url: "https://gjnhyidkikiiiasntbeh.supabase.co", key: "sb_publishable_IeyIP2JxwDPeRmFAif2asg_IGwAMYKh" };
  const KEYS = ["vnl-code-v1", "vnl-progress"];
  const LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.min.js";
  let preview = false;
  try {
    if (/[?&]signin\b/.test(location.search)) localStorage.setItem("tl-auth-preview", "1");
    preview = !!localStorage.getItem("tl-auth-preview");
  } catch (e) {}
  const on = !!(CFG.url && CFG.key);
  const top = document.querySelector(".top");
  if ((!on && !preview) || !top) return;

  // ---------------------------------------------------------------- merge --
  // Two devices, one person: keep everything either of them finished.
  // Counters keep the larger number, lists are combined, dates keep the later one,
  // and anything else (like code you typed) keeps this browser's copy.
  const ISO = /^\d{4}-\d{2}-\d{2}/;
  function merge(a, b) {
    if (a === undefined) return b;
    if (b === undefined) return a;
    if (Array.isArray(a) && Array.isArray(b)) {
      const seen = new Set(a.map((x) => JSON.stringify(x)));
      return a.concat(b.filter((x) => !seen.has(JSON.stringify(x))));
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
      const o = { ...a };
      for (const k in b) o[k] = merge(a[k], b[k]);
      return o;
    }
    if (typeof a === "number" && typeof b === "number") return Math.max(a, b);
    if (typeof a === "boolean" && typeof b === "boolean") return a || b;
    if (typeof a === "string" && typeof b === "string" && ISO.test(a) && ISO.test(b)) return a > b ? a : b;
    return a;
  }
  const read = () => { const o = {}; for (const k of KEYS) { try { o[k] = JSON.parse(localStorage.getItem(k) || "{}"); } catch (e) { o[k] = {}; } } return o; };

  // ---------------------------------------------------------------- sheet --
  const root = document.querySelector(".top .brand")?.getAttribute("href") || "../";
  // The pixel tulip, the same 7×7 mark as the favicon.
  const C = { p: "#ff6fb5", D: "#d23f87", Y: "#ffd21f", g: "#3faa52", G: "#24803c" };
  const tulip = `<svg class="as-tulip" viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true">${".p.p.p.,ppDpDpp,ppYYYpp,.ppYpp.,g..G..g,gg.G.gg,.ggGgg."
    .split(",").map((r, y) => [...r].map((c, x) => (C[c] ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${C[c]}"/>` : "")).join("")).join("")}</svg>`;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "acct";
  btn.textContent = "Sign in";
  top.append(btn);

  const dlg = document.createElement("dialog");
  dlg.className = "acct-sheet";
  document.body.append(dlg);
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  const G = `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M15.5 8.2c0-.6-.1-1.1-.2-1.6H8v3h4.2a3.6 3.6 0 0 1-1.6 2.4v2h2.6c1.5-1.4 2.3-3.4 2.3-5.8ZM8 16c2.2 0 4-.7 5.3-2l-2.6-2a4.8 4.8 0 0 1-7.2-2.5H.8v2A8 8 0 0 0 8 16Zm-4.5-6.5a4.8 4.8 0 0 1 0-3V4.4H.8a8 8 0 0 0 0 7.2l2.7-2.1ZM8 3.2c1.2 0 2.3.4 3.2 1.2l2.3-2.3A8 8 0 0 0 .8 4.4l2.7 2.1A4.8 4.8 0 0 1 8 3.2Z"/></svg>`;
  const H = `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0a8 8 0 0 0-2.5 15.6c.4 0 .5-.2.5-.4v-1.5c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.3 1.9.9 2.4.7 0-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-4 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.5 7.5 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.1 0 3.1-1.9 3.8-3.7 4 .3.3.6.8.6 1.5v2.2c0 .2.1.5.6.4A8 8 0 0 0 8 0Z"/></svg>`;

  const oops = (e) => (e?.status === 429 ? "Too many tries. Wait a few minutes, then try again." : "Something went wrong. Please try again.");
  function sheetOut() {
    dlg.innerHTML = `<form method="dialog" class="as-x"><button aria-label="Close">×</button></form>
      <div class="as-head">${tulip}<h2>Sign in to <i>Tulip Labs</i></h2><p>Pick up where you left off, on any device.</p></div>
      <div class="as-btns"><button type="button" data-p="google">${G}Continue with Google</button><button type="button" data-p="github">${H}Continue with GitHub</button></div>
      <div class="as-or"><span>or</span></div>
      <form class="as-mail"><label for="as-email">Email</label><div><input id="as-email" type="email" required autocomplete="email" placeholder="you@example.com"><button>Email me a link</button></div></form>
      <p class="as-msg" role="status"></p>
      <p class="as-fine">By continuing you agree to the <a href="${root}terms/">terms</a> and <a href="${root}privacy/">privacy policy</a>.</p>`;
    const msg = dlg.querySelector(".as-msg");
    const say = (t) => (msg.textContent = t);
    dlg.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", async () => {
      if (!on) return say("Sign-in isn't switched on yet. This is a preview.");
      const sb = await client();
      const { error } = await sb.auth.signInWithOAuth({ provider: b.dataset.p, options: { redirectTo: location.href.split("#")[0] } });
      if (error) say(oops(error));
    }));
    dlg.querySelector(".as-mail").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!on) return say("Sign-in isn't switched on yet. This is a preview.");
      const email = dlg.querySelector("#as-email").value.trim();
      const sb = await client();
      say("Sending…");
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split("#")[0] } });
      say(error ? oops(error) : `Check ${email} for a sign-in link.`);
    });
  }

  const esc = (t) => String(t).replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
  // Faces: your initials, a pixel character drawn in the lab's own palette, or a picture you upload.
  // Saved on your profile as null, "px:<name>", "provider" (your Google or GitHub photo) or "img:<url>".
  const PAL = { k: "#1d1b17", w: "#fbf7ee", p: "#ff6fb5", D: "#d23f87", Y: "#ffd21f", a: "#e6a21a", o: "#ee6a4c", g: "#3faa52", G: "#24803c",
    t: "#2fb38f", b: "#3d8fe0", B: "#2a5fa8", c: "#7cc8ef", v: "#9a6be0" };
  const FACES = {
    tulip: ["#ffe1ef", ".p.p.p.,ppDpDpp,ppYYYpp,.ppYpp.,g..G..g,gg.G.gg,.ggGgg."],
    sprout: ["#e2f3dc", ".......,.gg.gg.,gGg.gGg,..gGg..,...G...,.aaaaa.,..aaa.."],
    cactus: ["#e6f1d8", "...g...,.g.g...,.g.g.g.,.ggg.g.,...ggg.,...g...,.ooooo."],
    bee: ["#fff3c4", "..w.w..,.wwkww.,.YkYkY.,kYkYkYk,.YkYkY.,..kkk..,......."],
    cat: ["#fde9c8", "a.....a,aa...aa,aaaaaaa,akaaaka,aaapaaa,.aaaaa.,......."],
    frog: ["#dff3e2", ".ww.ww.,.wk.kw.,ggggggg,gGgggGg,ggDDDgg,.ggggg.,gg...gg"],
    owl: ["#ece3fb", "v.....v,vvvvvvv,vwkvkwv,vvvYvvv,.vwwwv.,.vwwwv.,..Y.Y.."],
    mushroom: ["#fde2da", "..ooo..,.owooo.,ooooowo,ooooooo,..www..,..wkw..,..www.."],
    robot: ["#d9f2ec", "...Y...,...t...,ttttttt,tkttwkt,ttttttt,twwwwwt,.t...t."],
    cube: ["#dcebfb", "..ccc..,ccccccc,bbbcBBB,bbbbBBB,bbbbBBB,bbbbBBB,.bbbBB."],
    star: ["#fff5cc", "...Y...,..YYY..,YYYYYYY,.YYYYY.,.YYYYY.,.YY.YY.,Y.....Y"],
    heart: ["#ffe1ef", ".......,.pp.pp.,ppppppp,ppppppp,.ppppp.,..ppp..,...p..."],
  };
  function sprite(name) {
    const f = FACES[name];
    if (!f) return "";
    const px = f[1].split(",").map((r, y) => [...r].map((c, x) => (PAL[c] ? `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${PAL[c]}"/>` : "")).join("")).join("");
    return `<svg viewBox="-1.5 -1.5 10 10" shape-rendering="crispEdges" aria-hidden="true" style="background:${f[0]}">${px}</svg>`;
  }
  const photo = (user) => user?.user_metadata?.avatar_url || user?.user_metadata?.picture || "";
  const initials = (t) => (String(t || "").replace("@", "").match(/\b\w/g) || ["·"]).slice(0, 2).join("").toUpperCase();
  // The face as HTML: fills whatever round box it's put in.
  function face(profile, user) {
    const a = profile?.avatar || "";
    if (a.startsWith("px:") && FACES[a.slice(3)]) return sprite(a.slice(3));
    const m = user?.user_metadata || {};
    const ini = esc(initials(profile?.display_name || m.full_name || m.name || profile?.username || user?.email || ""));
    // A picture that fails to load falls back to your initials.
    const img = (src) => `<img src="${esc(src)}" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML='<span>${ini}</span>'">`;
    if (a.startsWith("img:")) return img(a.slice(4));
    if (a === "provider" && photo(user)) return img(photo(user));
    return `<span>${ini}</span>`;
  }

  // First sign-in: pick a username. It's checked as you type and saved to your profile.
  const RULE = /^[a-z0-9_]{3,20}$/;
  function suggest(user) {
    const m = user.user_metadata || {};
    let u = (m.user_name || m.full_name || m.name || (user.email || "").split("@")[0] || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 20);
    return u.length >= 3 ? u : (u + "_tulip").slice(0, 20);
  }
  function sheetName(user) {
    const m = user.user_metadata || {};
    dlg.innerHTML = `<form method="dialog" class="as-x"><button aria-label="Close">×</button></form>
      <div class="as-head">${tulip}<h2>Pick your <i>username</i></h2><p>You can change it any time.</p></div>
      <form class="as-name">
        <label for="as-user">Username</label><div class="as-at"><span>@</span><input id="as-user" required maxlength="20" autocomplete="username" spellcheck="false" autocapitalize="none" value="${esc(suggest(user))}"></div>
        <p class="as-hint" role="status"></p>
        <label for="as-disp">Name</label><input id="as-disp" maxlength="50" autocomplete="name" value="${esc(m.full_name || m.name || "")}" placeholder="What should we call you?">
        <button>Continue</button>
      </form>`;
    const f = dlg.querySelector(".as-name"), u = f.querySelector("#as-user"), hint = f.querySelector(".as-hint"), go = f.querySelector("button");
    let ok = false, t = 0;
    const tell = (txt, good) => { hint.textContent = txt; hint.className = "as-hint" + (good ? " ok" : txt ? " no" : ""); ok = !!good; go.disabled = !good; };
    async function check() {
      const v = u.value.trim().toLowerCase();
      if (!RULE.test(v)) return tell(v.length < 3 ? "At least 3 characters" : "Letters, numbers and _ only", false);
      tell("Checking…", false);
      const { data } = await sb.from("profiles").select("user_id").eq("username", v).maybeSingle();
      if (u.value.trim().toLowerCase() !== v) return;
      data && data.user_id !== uid ? tell(`@${v} is taken`, false) : tell(`@${v} is yours`, true);
    }
    u.addEventListener("input", () => { u.value = u.value.toLowerCase().replace(/[^a-z0-9_]/g, ""); clearTimeout(t); t = setTimeout(check, 300); });
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!ok) return;
      go.textContent = "Saving…";
      const row = { user_id: uid, username: u.value.trim(), display_name: f.querySelector("#as-disp").value.trim() || null };
      const { data, error } = await sb.from("profiles").upsert(row).select().single();
      go.textContent = "Continue";
      if (error) return tell(error.code === "23505" ? `@${row.username} is taken` : error.code === "23514" ? "That username isn't allowed" : "Couldn't save. Please try again.", false);
      A.profile = data;
      changed();
      dlg.close();
    });
    check();
    if (!dlg.open) dlg.showModal();
  }

  // Show only the providers switched on in the Supabase dashboard. Nothing shows until we know,
  // so a switched-off button never flashes; the last answer is remembered so the sheet opens right.
  let asked = false;
  function show(ext) {
    dlg.querySelectorAll("[data-p]").forEach((b) => (b.hidden = !ext[b.dataset.p]));
    const none = !dlg.querySelector("[data-p]:not([hidden])");
    dlg.querySelector(".as-btns").hidden = none;
    dlg.querySelector(".as-or").hidden = none || !ext.email;
    dlg.querySelector(".as-mail").hidden = !ext.email;
  }
  function providers() {
    if (!dlg.querySelector("[data-p]")) return;
    let known = null;
    try { known = JSON.parse(localStorage.getItem("tl-providers") || "null"); } catch (e) {}
    show(known || {});
    if (asked || !on) return;
    asked = true;
    fetch(CFG.url + "/auth/v1/settings", { headers: { apikey: CFG.key } }).then((r) => r.json()).then((s) => {
      const ext = s.external || {};
      try { localStorage.setItem("tl-providers", JSON.stringify({ google: ext.google, github: ext.github, email: ext.email })); } catch (e) {}
      if (dlg.querySelector("[data-p]")) show(ext);
    }).catch(() => show({ google: true, github: true, email: true }));
  }
  const open = () => { if (!dlg.open) { sheetOut(); dlg.showModal(); providers(); } };
  btn.addEventListener("click", () => (uid ? (location.href = root + "account/") : open()));
  sheetOut();

  // The account page reads and drives the session through this, and hears about changes on "tl-account".
  const A = (window.TLA = { ready: false, user: null, profile: null, open, read, face, FACES: Object.keys(FACES), sprite, photo });
  // Whenever the account changes, repaint the top-bar face and tell the page.
  const changed = () => {
    if (A.user) btn.innerHTML = face(A.profile, A.user);
    A.ready = true;
    dispatchEvent(new CustomEvent("tl-account", { detail: A }));
  };
  A.changed = changed;
  if (!on) return changed();

  // ----------------------------------------------------------------- sync --
  let sb = null;
  function client() {
    if (sb) return Promise.resolve(sb);
    return new Promise((ok, bad) => {
      const s = document.createElement("script");
      s.src = LIB;
      s.onload = () => ok((sb = window.supabase.createClient(CFG.url, CFG.key)));
      s.onerror = bad;
      document.head.append(s);
    });
  }

  let uid = null, pushT = 0;
  async function push() {
    clearTimeout(pushT);
    pushT = 0;
    if (!uid) return;
    const at = new Date().toISOString();
    const { error } = await sb.from("progress").upsert({ user_id: uid, data: read(), updated_at: at });
    if (!error) { A.synced = at; changed(); }
  }
  const soon = () => { clearTimeout(pushT); pushT = setTimeout(push, 3000); };

  // Every save the pages make goes through localStorage.setItem; watch ours and push a few seconds later.
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { set.call(this, k, v); if (this === localStorage && KEYS.includes(k)) soon(); };
  addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && pushT) push(); });

  async function pull() {
    const { data, error } = await sb.from("progress").select("data").eq("user_id", uid).maybeSingle();
    if (error) return;
    const here = read(), there = data?.data || {};
    const both = {};
    let changed = false;
    for (const k of KEYS) {
      both[k] = merge(here[k], there[k] || {});
      if (JSON.stringify(both[k]) !== JSON.stringify(here[k])) { set.call(localStorage, k, JSON.stringify(both[k])); changed = true; }
    }
    await push();
    // The page read its progress when it loaded, so show the merged copy once.
    if (changed && !sessionStorage.getItem("tl-synced")) { sessionStorage.setItem("tl-synced", "1"); location.reload(); }
  }

  // Your profile: username and name. No row yet means a first sign-in, so ask for a username.
  async function profile(user) {
    const { data, error } = await sb.from("profiles").select("*").eq("user_id", uid).maybeSingle();
    if (error) return changed(); // the profiles table isn't set up yet
    A.profile = data;
    changed();
    if (!data) sheetName(user);
  }
  async function signOut() {
    await push().catch(() => {});
    await sb.auth.signOut();
  }

  // Signed in, the button shows your face (initials until your profile loads) and leads to your account page.
  function signedIn(user) {
    if (uid === user.id) return;
    uid = user.id;
    btn.innerHTML = face(null, user);
    btn.classList.add("in");
    btn.title = "Your account";
    btn.setAttribute("aria-label", "Your account");
    Object.assign(A, { user, client: sb, push, signOut, sb });
    if (dlg.open) dlg.close();
    pull().then(() => profile(user));
  }
  function signedOut() {
    uid = null;
    btn.textContent = "Sign in";
    btn.classList.remove("in");
    btn.removeAttribute("title");
    btn.removeAttribute("aria-label");
    Object.assign(A, { user: null, profile: null });
    sheetOut();
    changed();
  }

  // Guests never load the library: only someone with a saved session, or coming back from a sign-in link, does.
  let back = false;
  try { back = Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k)); } catch (e) {}
  if (!back && !/access_token=|[?&]code=/.test(location.href)) return signedOut();
  client().then((c) => {
    c.auth.getSession().then(({ data }) => (data.session ? signedIn(data.session.user) : signedOut()));
    c.auth.onAuthStateChange((ev, session) => {
      if (ev === "SIGNED_IN" && session && session.user.id !== uid) signedIn(session.user);
      if (ev === "SIGNED_OUT") signedOut();
    });
  });
})();
