/* The section switcher in the top bar is a plain <details>, so it works without this file.
   This only closes it on Escape, on a click outside it, or after picking a link. */
(() => {
  const sw = document.querySelector(".sw");
  if (!sw) return;
  const close = () => { sw.open = false; };
  document.addEventListener("click", (e) => { if (sw.open && !sw.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sw.open) { close(); sw.querySelector("summary").focus(); } });
  sw.addEventListener("toggle", () => { if (sw.open) (sw.querySelector('.sw-menu a[aria-current="page"]') || sw.querySelector(".sw-menu a")).focus({ preventScroll: true }); });
})();
