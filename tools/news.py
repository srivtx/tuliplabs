#!/usr/bin/env python3
"""Write one real page per news story, from content/news.json.

    python3 tools/news.py      # writes news/<id>/index.html for every story

Each page borrows its head and top bar from news/index.html, so styles, theme and nav stay in one place.
Run it again after adding or editing a story.
"""
import html
import json
import os
import re
import shutil
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEWS = os.path.join(ROOT, "news")

# the same 7×7 glyphs as learn/news.js
G = {
    "tulip": [".#.#.#.", "###.###", "##...##", ".##.##.", "#..#..#", "##.#.##", ".#####."],
    "stairs": [".....##", ".....##", "...####", "...####", ".######", ".######", "......."],
    "bars": ["......#", "....#.#", "....#.#", "..#.#.#", "..#.#.#", "#.#.#.#", "#.#.#.#"],
    "sun": ["..###..", ".##.##.", "##...##", "##...##", "##...##", ".##.##.", "..###.."],
    "prompt": ["#......", ".#.....", "..#....", ".#.....", "#......", "...####", "......."],
    "grid": ["#.#.#.#", ".#.#.#.", "#.#.#.#", ".#.#.#.", "#.#.#.#", ".#.#.#.", "#.#.#.#"],
}
e = lambda s: html.escape(str(s), quote=True)


def glyph(k, fill="#fff"):
    rows = G.get(k, G["grid"])
    cells = "".join(f'<rect x="{x}" y="{y}" width="1" height="1"/>' for y, r in enumerate(rows) for x, c in enumerate(r) if c == "#")
    return f'<svg viewBox="0 0 7 7" shape-rendering="crispEdges" fill="{fill}" aria-hidden="true">{cells}</svg>'


def dust(seed):
    """A few loose squares on the deep half of the banner, the same for a story every time."""
    s, out = seed, []
    for _ in range(14):
        s = (s * 1664525 + 1013904223) % 2**32; x = s % 60
        s = (s * 1664525 + 1013904223) % 2**32; y = s % 24
        s = (s * 1664525 + 1013904223) % 2**32
        out.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{"#fff" if s % 2 else "#000"}" opacity="{".1" if s % 2 else ".14"}"/>')
    return f'<svg class="dust" viewBox="0 0 60 24" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges" aria-hidden="true">{"".join(out)}</svg>'


def day(d):
    return date.fromisoformat(d).strftime("%b %-d, %Y")


def page(n, newer, older, head, top):
    seed = sum(map(ord, n["id"])) * 97
    body = "".join(f"<p>{e(p)}</p>" for p in n.get("more") or [n["body"]])
    lst = "".join(f"<li>{e(li)}</li>" for li in n.get("list", []))
    nav = lambda m, cls, word: (f'<a class="{cls}" href="../{e(m["id"])}/"><small>{word}</small>{e(m["title"])}</a>' if m else f'<span class="{cls}"></span>')
    h = head
    h = h.replace("<title>News · Tulip Labs</title>", f'<title>{e(n["title"])} · Tulip Labs</title>')
    h = re.sub(r'<meta name="description" content="[^"]*">',
               f'<meta name="description" content="{e(n["body"])}">\n<meta property="og:type" content="article">\n'
               f'<meta property="og:title" content="{e(n["title"])}">\n<meta property="og:description" content="{e(n["body"])}">\n'
               f'<meta property="og:site_name" content="Tulip Labs">', h)
    h = h.replace('href="../learn/', 'href="../../learn/').replace('src="../learn/', 'src="../../learn/')
    h = h.replace('<script src="../../learn/news.js" defer></script>', '<link rel="stylesheet" href="../post.css">\n<script src="../../learn/news.js" defer></script>')
    style = f'--a:{n["a"]};--b:{n["b"]}' + (f';--c:{n["c"]}' if n.get("c") else "")
    return f"""{h}<body>
{top}
<main class="post">
  <a class="back" href="../">← All news</a>
  <header class="p-head">
    <p class="p-meta"><em>{e(n["kind"])}</em> · <time datetime="{e(n["date"])}">{day(n["date"])}</time></p>
    <h1>{e(n["title"])}</h1>
    <p class="p-lede">{e(n["body"])}</p>
  </header>
  <figure class="p-art" style="{style}"><span>{glyph(n["glyph"], n.get("g", "#fff"))}</span><b>{dust(seed)}<span>{e(n["card"])}</span></b></figure>
  <article class="p-body">
    {body}
    {f'<h2>What changed</h2><ul>{lst}</ul>' if lst else ""}
    <p class="p-cta"><a class="nw-go" href="../../{e(n["href"])}">{e(n.get("cta") or "Go see it")} →</a></p>
  </article>
  <nav class="p-nav" aria-label="More stories">{nav(newer, "newer", "← Newer")}{nav(older, "older", "Older →")}</nav>
  <section class="p-more">
    <h2>More <i>news.</i></h2>
    <div class="news" data-news="3" data-skip="{e(n["id"])}" data-base="../../"></div>
  </section>
</main>
</body>
</html>
"""


def main():
    with open(os.path.join(ROOT, "content", "news.json"), encoding="utf-8") as fh:
        items = json.load(fh)
    with open(os.path.join(NEWS, "index.html"), encoding="utf-8") as fh:
        src = fh.read()
    head = src[: src.index("<body>")]
    top = src[src.index('<header class="top">'): src.index("</header>") + len("</header>")]
    top = top.replace('href="../', 'href="../../')
    keep = {n["id"] for n in items}
    for name in os.listdir(NEWS):  # stories that were removed from news.json lose their page
        p = os.path.join(NEWS, name)
        if os.path.isdir(p) and name not in keep and os.path.exists(os.path.join(p, "index.html")):
            shutil.rmtree(p)
    for i, n in enumerate(items):
        os.makedirs(os.path.join(NEWS, n["id"]), exist_ok=True)
        out = page(n, items[i - 1] if i else None, items[i + 1] if i + 1 < len(items) else None, head, top)
        with open(os.path.join(NEWS, n["id"], "index.html"), "w", encoding="utf-8") as fh:
            fh.write(out)
    print(f"wrote {len(items)} story pages in news/")


if __name__ == "__main__":
    main()
