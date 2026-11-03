/* Sign in and sync. Guests come first: nobody has to sign in to learn, and progress always lives in
   this browser (vnl-code-v1, vnl-progress). Signing in only carries that progress between devices.
   Supabase holds one row per person (see docs/supabase.sql); row-level security lets each person
   read and write only their own row, so the public key below can't reach anyone else's.

   Off until CFG is filled in. To preview the sheet before then: add ?signin to any URL. */
(() => {
  const CFG = { url: "", key: "" };
  const KEYS = ["vnl-code-v1", "vnl-progress"];
  const LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";
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

  function sheetOut() {
    dlg.innerHTML = `<form method="dialog" class="as-x"><button aria-label="Close">×</button></form>
      <div class="as-head">${tulip}<h2>Sign in to <i>Tulip Labs</i></h2><p>Your progress in this browser comes with you.</p></div>
      <div class="as-btns"><button type="button" data-p="google">${G}Continue with Google</button><button type="button" data-p="github">${H}Continue with GitHub</button></div>
      <div class="as-or"><span>or</span></div>
      <form class="as-mail"><label for="as-email">Email</label><div><input id="as-email" type="email" required autocomplete="email" placeholder="you@example.com"><button>Email me a link</button></div></form>
      <p class="as-msg" role="status"></p>
      <p class="as-fine">No passwords. Learning never needs an account.</p>`;
    const msg = dlg.querySelector(".as-msg");
    const say = (t) => (msg.textContent = t);
    dlg.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", async () => {
      if (!on) return say("Sign-in isn't switched on yet. This is a preview.");
      const sb = await client();
      const { error } = await sb.auth.signInWithOAuth({ provider: b.dataset.p, options: { redirectTo: location.href.split("#")[0] } });
      if (error) say(error.message);
    }));
    dlg.querySelector(".as-mail").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!on) return say("Sign-in isn't switched on yet. This is a preview.");
      const email = dlg.querySelector("#as-email").value.trim();
      const sb = await client();
      say("Sending…");
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split("#")[0] } });
      say(error ? error.message : `Check ${email} for a sign-in link.`);
    });
  }

  function sheetIn(user) {
    const who = user.email || user.user_metadata?.user_name || "you";
    dlg.innerHTML = `<form method="dialog" class="as-x"><button aria-label="Close">×</button></form>
      <div class="as-head">${tulip}<h2>Signed in</h2><p>${who.replace(/[<>&]/g, "")}</p></div>
      <ul class="as-list"><li><i class="as-dot"></i>Sync is on. Your progress saves a few seconds after each change.</li></ul>
      <div class="as-btns"><button type="button" data-a="export">Export my progress</button><button type="button" data-a="out">Sign out</button></div>
      <p class="as-fine">Signing out keeps your progress in this browser.</p>`;
    dlg.querySelector("[data-a=export]").addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(read(), null, 2)], { type: "application/json" }));
      a.download = "tulip-labs-progress.json";
      a.click();
    });
    dlg.querySelector("[data-a=out]").addEventListener("click", async () => { await (await client()).auth.signOut(); dlg.close(); });
  }

  btn.addEventListener("click", () => { if (!dlg.open) dlg.showModal(); });
  sheetOut();
  if (!on) return;

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
    if (!uid) return;
    await sb.from("progress").upsert({ user_id: uid, data: read(), updated_at: new Date().toISOString() });
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

  function signedIn(user) {
    uid = user.id;
    const name = user.user_metadata?.full_name || user.user_metadata?.user_name || user.email || "";
    btn.textContent = (name.match(/\b\w/g) || ["·"]).slice(0, 2).join("").toUpperCase();
    btn.classList.add("in");
    btn.title = "Signed in: sync is on";
    sheetIn(user);
    pull();
  }
  function signedOut() {
    uid = null;
    btn.textContent = "Sign in";
    btn.classList.remove("in");
    btn.removeAttribute("title");
    sheetOut();
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
