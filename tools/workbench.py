"""Workbench projects: parse content/wb/pNN.md into content/wb.json, and prove every ticket works.

A project is front matter (id, num, title, kind, tagline, main, prompt, files, minutes, map) then
Markdown intro, then ```ticket blocks. A ticket's parts:

    ---brief / ---why            Markdown
    ---picture                   a monospaced diagram, shown as is
    ---todo                      a "- " checklist
    ---starter <file>            scaffold for a file this ticket CREATES (existing files carry over)
    ---solution <file>           the reference version of a file after this ticket
    ---tests                     asserts, with run(line), restart(), disk(name), tear(name) and every module
    ---session                   a terminal transcript: "<prompt>cmd" lines then the reply; "!restart" restarts
    ---hint                      any number, from gentle to nearly the answer

--verify proves, for every ticket in order:
  * the starting point (the previous ticket's solution plus this ticket's starters) fails its tests,
  * the solution passes its tests AND every earlier ticket's tests,
  * every session transcript replays exactly against the solution.
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOLDER = os.path.join(ROOT, "content", "wb")
PARTS = ("brief", "why", "picture", "todo", "starter", "solution", "tests", "session", "hint")


def _split(body):
    head, parts, cur = [], [], None
    for line in body.split("\n"):
        m = re.match(r"^---([a-z]+)(?:\s+(\S+))?\s*$", line)
        if m and m.group(1) in PARTS:
            cur = [m.group(1), m.group(2), []]
            parts.append(cur)
        elif cur is None:
            head.append(line)
        else:
            cur[2].append(line)
    fields = dict(re.match(r"^(\w+):\s*(.*)$", l).groups() for l in head if re.match(r"^\w+:", l))
    return fields, [(k, arg, "\n".join(lines).strip("\n")) for k, arg, lines in parts]


def _meta(text, path):
    m = re.match(r"(?s)^---\n(.*?)\n---\n(.*)$", text)
    assert m, f"{path}: missing front matter"
    meta, key = {}, None
    for line in m.group(1).split("\n"):
        if line.startswith("- ") and key:
            if not isinstance(meta.get(key), list):
                meta[key] = []
            meta[key].append(line[2:].strip())
        elif ":" in line:
            key, v = line.split(":", 1)
            key = key.strip()
            # the prompt keeps its trailing space
            meta[key] = v[1:] if key == "prompt" else v.strip()
    return meta, m.group(2)


def parse_project(path, md, inline):
    text = open(path, encoding="utf-8").read()
    meta, body = _meta(text, path)
    files = [f.strip() for f in meta["files"].split(",")]
    proj = {
        "id": meta["id"], "num": int(meta["num"]), "title": meta["title"], "kind": meta.get("kind", ""),
        "tagline": meta.get("tagline", ""), "main": meta["main"], "prompt": meta.get("prompt", "> "),
        "files": files, "minutes": int(meta.get("minutes", 60)), "map": [], "tickets": [],
    }
    for row in meta.get("map", []):
        name, file, tid, what = [c.strip() for c in row.split("|")]
        proj["map"].append({"name": name, "file": file, "ticket": tid, "what": inline(what)})
    intro, i, lines = [], 0, body.split("\n")
    while i < len(lines):
        if lines[i].startswith("```ticket"):
            j = i + 1
            while not lines[j].startswith("```"):
                j += 1
            proj["tickets"].append(_ticket("\n".join(lines[i + 1:j]), proj, path, md, inline))
            i = j + 1
            continue
        if not proj["tickets"]:
            intro.append(lines[i])
        i += 1
    proj["intro"] = md("\n".join(intro))
    ids = [t["id"] for t in proj["tickets"]]
    assert len(set(ids)) == len(ids), f"{path}: duplicate ticket ids"
    for row in proj["map"]:
        assert row["file"] in files, f"{path}: map part {row['name']} names unknown file {row['file']}"
    # Each ticket starts from the previous solution; a starter may only create a file.
    have = {}
    for t in proj["tickets"]:
        for f in list(t["starter"]) + list(t["solution"]):
            assert f in files, f"{path} {t['id']}: unknown file {f}"
        for f in t["starter"]:
            assert f not in have, f"{path} {t['id']}: starter for {f}, which already exists (only new files get starters)"
        t["start"] = {**have, **t["starter"]}
        have = {**have, **t["solution"]}
        t["after"] = dict(have)
        assert proj["main"] + ".py" in t["after"], f"{path} {t['id']}: {proj['main']}.py doesn't exist yet"
    return proj


def _ticket(raw, proj, path, md, inline):
    fields, parts = _split(raw)
    where = f"{path} ticket {fields.get('id', '?')}"
    assert fields.get("id") and fields.get("title"), f"{where}: needs id: and title:"
    t = {"id": fields["id"], "title": fields["title"], "touches": [f.strip() for f in fields.get("files", "").split(",") if f.strip()],
         "brief": "", "why": "", "picture": "", "todo": [], "starter": {}, "solution": {}, "tests": "",
         "session": "", "hints": []}
    for kind, arg, text in parts:
        if kind in ("brief", "why"):
            t[kind] = md(text)
        elif kind == "picture":
            t["picture"] = text
        elif kind == "todo":
            t["todo"] = [inline(l[2:].strip()) for l in text.splitlines() if l.startswith("- ")]
        elif kind in ("starter", "solution"):
            assert arg, f"{where}: ---{kind} needs a file name"
            t[kind][arg] = text + "\n"
        elif kind == "tests":
            t["tests"] = text
        elif kind == "session":
            t["session"] = text
        elif kind == "hint":
            t["hints"].append(md(text))
    assert t["brief"] and t["tests"] and t["solution"], f"{where}: needs ---brief, ---tests and a ---solution"
    return t


def build(md, inline):
    out = []
    if not os.path.isdir(FOLDER):
        return out
    for fn in sorted(os.listdir(FOLDER)):
        if fn.endswith(".md"):
            out.append(parse_project(os.path.join(FOLDER, fn), md, inline))
    out.sort(key=lambda p: p["num"])
    return out


def verify_project(proj):
    """Returns (id, checks, problems). Runs in CPython with the same harness the page uses."""
    import sys
    import tempfile
    sys.path.insert(0, os.path.join(ROOT, "learn"))
    os.environ["WB_DISK"] = tempfile.mkdtemp(prefix="wb-verify-")
    import harness
    problems, count, done = [], 0, []
    main = proj["main"]
    for t in proj["tickets"]:
        mine = [[t["title"], t["tests"]]]
        bad = harness.project_check(proj["id"] + ":" + t["id"] + ":start", t["start"], main, mine)
        if bad["passed"]:
            problems.append(f"{t['id']}: the starting point already passes its tests")
        good = harness.project_check(proj["id"] + ":" + t["id"], t["after"], main, done + mine)
        if not good["passed"]:
            last = good["tickets"][-1] if good["tickets"] else {}
            problems.append(f"{t['id']}: SOLUTION fails in '{last.get('title')}': {good.get('error') or last.get('failed')}\n  -> {last.get('message')}")
        count += 2
        if t["session"]:
            diff = harness.project_session(proj["id"] + ":" + t["id"] + ":session", t["after"], main, t["session"], proj["prompt"])
            if diff:
                problems.append(f"{t['id']}: session doesn't replay:\n  {diff}")
            count += 1
        done = done + mine
    return proj["id"], count, problems
