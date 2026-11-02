#!/usr/bin/env python3
"""Build the code-track lessons and prove every exercise works.

    python3 tools/build.py            # build content/*.json
    python3 tools/build.py --verify   # build, then run every block in CPython
    python3 tools/build.py --verify tc03 ms11   # only some chapters

Lesson source lives in content/<track>/chNN.md. See content/FORMAT.md.
"""
import html
import json
import multiprocessing as mp
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, "content")
TRACKS = {
    "tc": "Think Complexity",
    "ms": "Modeling and Simulation in Python",
    "bx": "Build your own X",
    "ps": "Probability and Statistics",
    "ds": "Data Structures & Algorithms",
    "od": "Open Data Structures",
}


# ---------------------------------------------------------------- markdown --
def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r"`([^`]+)`", lambda m: "<code>" + m.group(1) + "</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"(?<![\w*])\*([^*\n]+)\*(?![\w*])", r"<i>\1</i>", s)
    s = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", r'<a href="\2">\1</a>', s)
    return s


def md(text):
    """A small Markdown subset: paragraphs, ### headings, lists, tables, > notes."""
    out, para, lst, table = [], [], None, []

    def flush():
        nonlocal para, lst, table
        if para:
            out.append("<p>" + inline(" ".join(para)) + "</p>")
            para = []
        if lst:
            tag, items = lst
            out.append(f"<{tag}>" + "".join(f"<li>{inline(i)}</li>" for i in items) + f"</{tag}>")
            lst = None
        if table:
            rows = [[c.strip() for c in r.strip().strip("|").split("|")] for r in table]
            rows = [r for r in rows if not all(re.fullmatch(r":?-{2,}:?", c) for c in r)]
            h = "<tr>" + "".join(f"<th>{inline(c)}</th>" for c in rows[0]) + "</tr>"
            b = "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in rows[1:])
            out.append(f'<div class="tw"><table><thead>{h}</thead><tbody>{b}</tbody></table></div>')
            table = []

    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip():
            flush()
            continue
        if line.startswith("|"):
            if para or lst:
                flush()
            table.append(line)
            continue
        if table:
            flush()
        m = re.match(r"^(#{3,4})\s+(.*)", line)
        if m:
            flush()
            lvl = len(m.group(1))
            out.append(f"<h{lvl}>{inline(m.group(2))}</h{lvl}>")
            continue
        m = re.match(r"^>\s?(.*)", line)
        if m:
            flush()
            if out and out[-1].startswith('<div class="note">'):
                out[-1] = out[-1][:-6] + " " + inline(m.group(1)) + "</div>"
            else:
                out.append('<div class="note">' + inline(m.group(1)) + "</div>")
            continue
        m = re.match(r"^\s*([-*]|\d+\.)\s+(.*)", line)
        if m:
            if para:
                flush()
            tag = "ol" if m.group(1)[0].isdigit() else "ul"
            if lst and lst[0] == tag:
                lst[1].append(m.group(2))
            else:
                flush()
                lst = (tag, [m.group(2)])
            continue
        if lst and raw.startswith("  "):
            lst[1][-1] += " " + line.strip()
            continue
        if lst:
            flush()
        para.append(line.strip())
    flush()
    return "\n".join(out)


# ------------------------------------------------------------------ parser --
def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40] or "x"


def split_parts(body, first):
    """Split a fenced block on '---name' lines. Text before the first marker is `first`."""
    parts, name, buf = {}, first, []
    for line in body.split("\n"):
        m = re.match(r"^---([a-z]+)\s*$", line)
        if m:
            parts.setdefault(name, []).append("\n".join(buf).strip("\n"))
            name, buf = m.group(1), []
        else:
            buf.append(line)
    parts.setdefault(name, []).append("\n".join(buf).strip("\n"))
    # Text before the first marker is only kept if it says something.
    if first in parts and len(parts[first]) > 1 and not parts[first][0].strip():
        parts[first] = parts[first][1:]
    return parts


def header_fields(text):
    """Leading `key: value` lines of a block, then the rest."""
    fields, lines = {}, text.split("\n")
    i = 0
    while i < len(lines) and re.match(r"^[a-z]+:\s", lines[i]):
        k, v = lines[i].split(":", 1)
        fields[k] = v.strip()
        i += 1
    return fields, "\n".join(lines[i:]).strip("\n")


def parse_quiz(body):
    q, opts, expl = [], [], []
    for line in body.split("\n"):
        if line.startswith("* "):
            opts.append({"t": inline(line[2:]), "ok": True})
        elif line.startswith("- "):
            opts.append({"t": inline(line[2:]), "ok": False})
        elif line.startswith("> "):
            expl.append(line[2:])
        elif line.strip():
            q.append(line.strip())
    assert sum(o["ok"] for o in opts) == 1, f"quiz needs exactly one * answer: {body[:60]}"
    return {"q": md("\n".join(q)), "opts": opts, "why": md("\n".join(expl))}


def parse_recall(body):
    m = re.match(r"(?s)\s*Q:\s*(.*?)\nA:\s*(.*)", body)
    assert m, f"recall needs Q: and A: lines: {body[:60]}"
    return {"q": md(m.group(1).strip()), "a": md(m.group(2).strip())}


def parse_chapter(path, track):
    text = open(path, encoding="utf-8").read()
    m = re.match(r"(?s)^---\n(.*?)\n---\n(.*)$", text)
    assert m, f"{path}: missing front matter"
    meta = {}
    key = None
    for line in m.group(1).split("\n"):
        if line.startswith("- ") and key:
            meta.setdefault(key, [])
            if not isinstance(meta[key], list):
                meta[key] = []
            meta[key].append(line[2:].strip())
        elif ":" in line:
            key, v = line.split(":", 1)
            key = key.strip()
            meta[key] = v.strip()
    ch = {
        "id": meta["id"], "track": track, "num": int(meta["num"]), "title": meta["title"],
        "tagline": meta.get("tagline", ""), "world": meta.get("world", ""),
        "minutes": int(meta.get("minutes", 40)), "book": meta.get("book", ""),
        "part": meta.get("part", ""),
        "goals": [inline(g) for g in meta.get("goals", [])],
        "prelude": "", "sections": [],
    }
    body = m.group(2)
    section = None
    seen_ids = set()

    def new_section(title):
        nonlocal section
        section = {"title": title, "id": slug(title), "blocks": []}
        ch["sections"].append(section)

    def add(block):
        if section is None:
            new_section("Start")
        n = len(section["blocks"]) + 1
        bid = block.pop("id", None) or f"{ch['id']}-{section['id']}-{n}"
        assert bid not in seen_ids, f"{path}: duplicate block id {bid}"
        seen_ids.add(bid)
        block["id"] = bid
        section["blocks"].append(block)

    prose = []

    def flush_prose():
        if prose and "".join(prose).strip():
            add({"type": "md", "html": md("\n".join(prose))})
        prose.clear()

    lines = body.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        fm = re.match(r"^```([a-z]+)\s*(.*)$", line)
        if line.startswith("## "):
            flush_prose()
            new_section(line[3:].strip())
        elif fm:
            flush_prose()
            kind = fm.group(1)
            j = i + 1
            buf = []
            while j < len(lines) and lines[j] != "```":
                buf.append(lines[j])
                j += 1
            assert j < len(lines), f"{path}:{i+1}: unclosed fence"
            raw = "\n".join(buf)
            i = j
            if kind == "prelude":
                ch["prelude"] = raw
            elif kind in ("run", "predict"):
                f, code = header_fields(raw)
                blk = {"type": kind, "code": code}
                if "title" in f:
                    blk["title"] = f["title"]
                if "id" in f:
                    blk["id"] = f"{ch['id']}-{f['id']}"
                add(blk)
            elif kind in ("exercise", "parsons"):
                f, rest = header_fields(raw)
                parts = split_parts(rest, "starter" if kind == "exercise" else "lines")
                blk = {"type": kind, "title": f.get("title", ""), "kind": f.get("kind", "write"),
                       "prompt": md(parts.get("prompt", [""])[0]),
                       "setup": parts.get("setup", [""])[0],
                       "tests": parts.get("tests", [""])[0],
                       "show": parts.get("show", [""])[0],
                       "hints": [md(h) for h in parts.get("hint", []) if h.strip()]}
                if kind == "exercise":
                    blk["starter"] = parts["starter"][0]
                    blk["solution"] = parts["solution"][0]
                    assert blk["tests"], f"{path}: exercise '{blk['title']}' has no tests"
                else:
                    good, bad = [], []
                    for ln in parts["lines"][0].split("\n"):
                        if not ln.strip():
                            continue
                        (bad if ln.lstrip().startswith("?? ") else good).append(ln.replace("?? ", "", 1))
                    blk["lines"], blk["distractors"] = good, bad
                if "id" in f:
                    blk["id"] = f"{ch['id']}-{f['id']}"
                elif blk["title"]:
                    blk["id"] = f"{ch['id']}-{slug(blk['title'])}"
                add(blk)
            elif kind == "quiz":
                add({"type": "quiz", **parse_quiz(raw)})
            elif kind == "recall":
                add({"type": "recall", **parse_recall(raw)})
            elif kind == "bridge":
                add({"type": "bridge", "html": md(raw)})
            elif kind == "viz":
                f, intro = header_fields(raw)
                assert "name" in f, f"{path}:{i+1}: viz needs a name: line"
                assert os.path.exists(os.path.join(ROOT, "learn", "viz", f["name"] + ".js")), f"{path}: learn/viz/{f['name']}.js is missing"
                blk = {"type": "viz", "name": f["name"], "title": f.get("title", ""), "goal": inline(f.get("goal", "")),
                       "height": int(f.get("height", 380)), "intro": md(intro) if intro.strip() else ""}
                blk["id"] = f"{ch['id']}-viz-{f.get('id', f['name'])}"
                add(blk)
            elif kind == "project":
                f, rest = header_fields(raw)
                parts = split_parts(rest, "brief")
                items = lambda k: [inline(re.sub(r"^\s*[-*]\s+", "", x)) for x in "\n".join(parts.get(k, [""])).split("\n") if x.strip()]
                blk = {"type": "project", "title": f.get("title", "Project"), "client": inline(f.get("client", "")),
                       "brief": md(parts.get("brief", [""])[0]), "why": md(parts.get("why", [""])[0]),
                       "skills": [inline(x.strip()) for x in f.get("skills", "").split(",") if x.strip()],
                       "milestones": items("milestones"), "stretch": items("stretch")}
                assert blk["milestones"], f"{path}: project '{blk['title']}' has no ---milestones"
                blk["id"] = f"{ch['id']}-proj-{slug(blk['title'])}"
                add(blk)
            else:
                raise AssertionError(f"{path}:{i+1}: unknown block {kind}")
        else:
            prose.append(line)
        i += 1
    flush_prose()
    return ch


def build(only=None):
    built = {}
    for track, name in TRACKS.items():
        folder = os.path.join(CONTENT, track)
        if not os.path.isdir(folder):
            continue
        chapters = []
        for fn in sorted(os.listdir(folder)):
            if fn.endswith(".md"):
                chapters.append(parse_chapter(os.path.join(folder, fn), track))
        chapters.sort(key=lambda c: c["num"])
        data = {"track": track, "book": name, "chapters": chapters}
        with open(os.path.join(CONTENT, f"{track}.json"), "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
        built[track] = chapters
        nblocks = sum(len(s["blocks"]) for c in chapters for s in c["sections"])
        print(f"built {track}.json: {len(chapters)} chapters, {nblocks} blocks")
    # A tiny index for the home page: chapter ids, titles and block counts per track, so it can show
    # live counts and the reader's progress without downloading every lesson.
    summary = {t: [[c["id"], c["title"], sum(len(s["blocks"]) for s in c["sections"])] for c in chs] for t, chs in built.items()}
    # the design studio keeps its levels in design/levels.js; each level is one thing to finish
    with open(os.path.join(ROOT, "design", "levels.js"), encoding="utf-8") as fh:
        src = fh.read()
    titles = dict(re.findall(r'id: "(dz\d+)", title: "([^"]+)"', src))
    order = re.findall(r'"(dz\d+)"', src[src.index("courses:"):src.index("levels:")])  # course order, as the studio shows them
    summary["dz"] = [[i, titles[i], 1] for i in order]
    with open(os.path.join(CONTENT, "summary.json"), "w", encoding="utf-8") as fh:
        json.dump(summary, fh, ensure_ascii=False, separators=(",", ":"))
    return built


# ------------------------------------------------------------------ verify --
def _verify_chapter(ch):
    os.environ["MPLBACKEND"] = "Agg"
    sys.path.insert(0, os.path.join(ROOT, "learn"))
    os.chdir(os.path.join(ROOT, "learn"))
    import harness
    import random
    problems, count = [], 0
    outputs = []
    skipped = []
    for rep in range(2):
        harness.reset(ch["id"])
        # Seed so we can tell deterministic predict blocks from random ones.
        random.seed(rep)
        try:
            import numpy as np
            np.random.seed(rep)
        except ImportError:
            pass
        outs = []
        for sec in ch["sections"]:
            for b in sec["blocks"]:
                if b["type"] in ("run", "predict"):
                    if "sympy" in b["code"] and not _has("sympy"):
                        if rep == 0:
                            skipped.append(b["id"])
                        continue
                    nsid = ch["id"]
                    if b["type"] == "predict":
                        # The page runs predictions in their own namespace, so each
                        # one must work with only the prelude.
                        nsid = ch["id"] + ":predict"
                        harness.reset(nsid)
                    r = harness.cell(nsid, ch["prelude"], b["code"])
                    if r["error"] and rep == 0:
                        problems.append(f"{b['id']}: {b['type']} raised\n{r['error']}")
                    if b["type"] == "predict":
                        outs.append((b["id"], r["stdout"]))
                        if rep == 0 and not r["stdout"].strip():
                            problems.append(f"{b['id']}: predict block prints nothing")
                    count += 1
        outputs.append(outs)
    for (bid, a), (_, b) in zip(*outputs):
        if a != b:
            problems.append(f"{bid}: predict output is not deterministic")
    for sec in ch["sections"]:
        for b in sec["blocks"]:
            if b["type"] == "exercise":
                good = harness.check(ch["prelude"], b["setup"], b["solution"], b["tests"], b.get("show", ""))
                if not good["passed"]:
                    problems.append(f"{b['id']}: SOLUTION fails: {good.get('error') or good.get('failed')} -> {good.get('message')}")
                elif good.get("show", {}).get("error"):
                    problems.append(f"{b['id']}: show block raised\n{good['show']['error']}")
                bad = harness.check(ch["prelude"], b["setup"], b["starter"], b["tests"])
                if bad["passed"]:
                    problems.append(f"{b['id']}: starter already passes the tests")
                count += 2
            elif b["type"] == "parsons":
                code = "\n".join(b["lines"])
                if b["tests"]:
                    r = harness.check(ch["prelude"], b["setup"], code, b["tests"])
                    if not r["passed"]:
                        problems.append(f"{b['id']}: parsons answer fails: {r.get('error') or r.get('failed')} {r.get('message','')}")
                else:
                    r = harness.check(ch["prelude"], b["setup"], code, "")
                    if r.get("error"):
                        problems.append(f"{b['id']}: parsons answer raises: {r['error']}")
                if len(b["lines"]) < 3:
                    problems.append(f"{b['id']}: parsons needs at least 3 lines")
                count += 1
    if skipped:
        print(f"  {ch['id']}: SKIPPED (sympy not installed here; runs in the browser): {', '.join(skipped)}")
    return ch["id"], count, problems


def _has(module):
    import importlib.util
    return importlib.util.find_spec(module) is not None


def verify(built, only):
    chapters = [c for cs in built.values() for c in cs if not only or c["id"] in only]
    ctx = mp.get_context("spawn")
    bad = 0
    with ctx.Pool(min(4, os.cpu_count() or 1)) as pool:
        for cid, count, problems in pool.imap(_verify_chapter, chapters):
            status = "ok" if not problems else f"{len(problems)} problem(s)"
            print(f"  {cid}: {count} checks, {status}")
            for p in problems:
                print("     - " + p.replace("\n", "\n       "))
            bad += len(problems)
    print("ALL GOOD" if not bad else f"{bad} PROBLEM(S)")
    return bad == 0


if __name__ == "__main__":
    args = sys.argv[1:]
    do_verify = "--verify" in args
    only = [a for a in args if not a.startswith("--")]
    built = build()
    if do_verify:
        sys.exit(0 if verify(built, only) else 1)
