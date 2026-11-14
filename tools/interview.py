"""Builds the DSA interview mode's problems, content/ds-interview.json, from content/iv/*.md, and proves them.

An interview is one problem you haven't seen, in five stages: clarify, plan, code, test, twist (learn/interview.js).
Each problem is an ```interview block:

  id, title, fn, ch (the chapter whose pattern solves it), decoys (four other chapters to offer as patterns),
  bigo (the right cost), bigos (optional: the costs to offer, the right one among them)
  ---prompt      the problem, in Markdown
  ---examples    asserts the learner can run while coding (the ones in the prompt)
  ---clarify     one question per line:  + tag | question | answer   (a question worth asking: hidden test `tag`
                                         -     | question | answer   is about it)   or a question that changes nothing
  ---test tag    a hidden test group; `big` is the one that only a fast enough solution passes
  ---starter     what the editor opens with
  ---solution    a reference solution
  ---brute       a correct but slow solution: it must pass every group but `big`, and fail `big`
  ---approach    the model approach, a sentence or two
  ---hint        three of them, gentlest first
  ---twist       the follow-up question, in Markdown
  ---twisttests  its tests (the starter is the learner's own code)
  ---twistsolution

  python3 tools/interview.py            build content/ds-interview.json
  python3 tools/interview.py --verify   build, then prove every problem in real Python:
      the starter fails the examples; the solution passes the examples and every hidden group;
      the brute force passes everything except `big`, and fails `big` (or runs out of time);
      every + question has its hidden group; the twist solution passes the twist tests, and the
      first solution doesn't (so the twist really changes the problem); the reference is fast
      enough that the page's slower Python still clears `big`."""
import glob
import json
import os
import re
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from build import md  # noqa: E402

SRC = os.path.join(ROOT, "content", "iv")
OUT = os.path.join(ROOT, "content", "ds-interview.json")
PRELUDE = '''import time

def timed(fn, *args):
    """Run fn(*args) and return (result, seconds)."""
    t = time.perf_counter()
    out = fn(*args)
    return out, time.perf_counter() - t'''
BIGOS = ["O(log n)", "O(n)", "O(n log n)", "O(n²)", "O(2ⁿ)"]
MULTI = {"hint", "test"}


def parse_block(raw, where):
    head, parts, name, buf = {}, [], None, []
    for line in raw.split("\n"):
        m = re.match(r"^---([a-z]+)(?: +([a-z0-9-]+))?\s*$", line)
        if m:
            if name:
                parts.append((name, "\n".join(buf).strip("\n")))
            name, buf = (m.group(1), m.group(2)), []
        elif name:
            buf.append(line)
        elif line.strip():
            k, _, v = line.partition(":")
            head[k.strip()] = v.strip()
    if name:
        parts.append((name, "\n".join(buf).strip("\n")))
    p = {"id": head["id"], "title": head["title"], "fn": head["fn"], "ch": int(head["ch"]),
         "decoys": [int(x) for x in head["decoys"].split(",")], "bigo": head["bigo"],
         "hints": [], "tests": [], "clarify": []}
    p["bigos"] = [x.strip() for x in head["bigos"].split(";")] if "bigos" in head else BIGOS
    for (key, arg), text in parts:
        if key == "hint":
            p["hints"].append(md(text))
        elif key == "test":
            p["tests"].append({"tag": arg, "code": text})
        elif key == "clarify":
            for line in text.split("\n"):
                if not line.strip():
                    continue
                sign, rest = line[0], line[1:]
                tag, q, a = [x.strip() for x in rest.split("|")]
                assert sign in "+-", f"{where}: clarify lines start with + or -"
                p["clarify"].append({"q": q, "a": a, "tag": tag if sign == "+" else None})
        elif key in ("prompt", "twist", "approach"):
            p[key] = md(text)
        else:
            p[key] = text
    for k in ("prompt", "examples", "starter", "solution", "brute", "approach", "twist", "twisttests", "twistsolution"):
        assert p.get(k), f"{where}: needs ---{k}"
    assert len(p["hints"]) == 3, f"{where}: needs three ---hint"
    assert p["bigo"] in p["bigos"], f"{where}: bigo {p['bigo']} isn't among the costs offered"
    assert len(p["decoys"]) == 4 and p["ch"] not in p["decoys"], f"{where}: four decoy chapters, not the right one"
    return p


def load():
    out = []
    for path in sorted(glob.glob(os.path.join(SRC, "*.md"))):
        text = open(path).read()
        for i, raw in enumerate(re.findall(r"(?ms)^```interview\n(.*?)^```", text)):
            out.append(parse_block(raw, f"{os.path.basename(path)} block {i + 1}"))
    return out


def build():
    probs = load()
    ids = [p["id"] for p in probs]
    assert len(ids) == len(set(ids)), "two problems share an id"
    data = {"track": "ds", "prelude": PRELUDE, "problems": probs}
    with open(OUT, "w") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=0)
    print(f"built ds-interview.json: {len(probs)} problems")
    return probs


# ------------------------------------------------------------------ verify --
RUN = r'''
import json, sys
sys.path.insert(0, %r)
import harness
req = json.load(sys.stdin)
r = harness.check(req["prelude"], "", req["code"], req["tests"])
print(json.dumps({"passed": r["passed"], "failed": r.get("failed"), "message": r.get("message"), "error": r.get("error")}))
'''


def check(code, tests, timeout=40):
    """Run code then tests in a fresh CPython; running out of time counts as failing."""
    t = time.time()
    try:
        out = subprocess.run([sys.executable, "-c", RUN % os.path.join(ROOT, "learn")], input=json.dumps(
            {"prelude": PRELUDE, "code": code, "tests": tests}), capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return {"passed": False, "message": f"ran past {timeout} s"}, time.time() - t
    try:
        return json.loads(out.stdout.strip().split("\n")[-1]), time.time() - t
    except (ValueError, IndexError):
        return {"passed": False, "message": out.stderr[-400:]}, time.time() - t


def verify(probs, only=None):
    bad = []
    for p in probs:
        if only and p["id"] not in only:
            continue
        say = lambda msg: bad.append(f"{p['id']}: {msg}")  # noqa: E731
        big_secs = 0.0
        groups = {g["tag"]: g["code"] for g in p["tests"]}
        if "big" not in groups:
            say("no big test")
        for c in p["clarify"]:
            if c["tag"] and c["tag"] not in groups:
                say(f"clarify tag {c['tag']} has no hidden test")
        r, _ = check(p["starter"], p["examples"])
        if r["passed"]:
            say("the starter passes the examples")
        for name, code in [("solution", p["solution"]), ("brute", p["brute"])]:
            r, _ = check(code, p["examples"])
            if not r["passed"]:
                say(f"{name} fails the examples: {r.get('failed')} {r.get('message') or r.get('error')}")
            for tag, tests in groups.items():
                r, secs = check(code, tests, timeout=12 if (name, tag) == ("brute", "big") else 40)
                if name == "solution" and not r["passed"]:
                    say(f"solution fails {tag}: {r.get('failed')} {r.get('message') or r.get('error')}")
                if name == "solution" and tag == "big":
                    big_secs = secs
                if name == "solution" and tag == "big" and secs > 3:
                    say(f"solution takes {secs:.1f} s on big: too close for the page")
                if name == "brute" and tag != "big" and not r["passed"]:
                    say(f"brute fails {tag}: {r.get('failed')} {r.get('message') or r.get('error')}")
                if name == "brute" and tag == "big" and r["passed"]:
                    say("brute force passes big: the big test doesn't need the pattern")
        r, _ = check(p["twistsolution"], p["twisttests"])
        if not r["passed"]:
            say(f"twist solution fails: {r.get('failed')} {r.get('message') or r.get('error')}")
        r, _ = check(p["solution"], p["twisttests"])
        if r["passed"]:
            say("the first solution already passes the twist")
        print(f"  {p['id']}: big in {big_secs:.2f} s, {'ok' if not any(b.startswith(p['id'] + ':') for b in bad) else 'PROBLEMS'}")
    for b in bad:
        print("  ✗", b)
    print("ALL GOOD" if not bad else f"{len(bad)} problem(s)")
    return not bad


if __name__ == "__main__":
    probs = build()
    if "--verify" in sys.argv:
        only = [a for a in sys.argv[1:] if not a.startswith("--")]
        sys.exit(0 if verify(probs, only) else 1)
