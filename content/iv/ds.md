# DSA interview problems

Each block is one interview: built by `tools/interview.py` into `content/ds-interview.json`, proven with
`python3 tools/interview.py --verify`. Big tests allow 1.5 s, because Python in the page runs a few times
slower than on a laptop; the verifier checks each reference finishes with room to spare.

```interview
id: pairs
title: Pairs that hit the target
fn: count_pairs
ch: 3
decoys: 7, 6, 9, 28
bigo: O(n)
---prompt
A shop sells gift cards of different values. A customer wants to spend exactly `t` using **two different cards**.

Write `count_pairs(a, t)`: given the card values `a`, return how many pairs of positions `i < j` have `a[i] + a[j] == t`.

`count_pairs([1, 5, 3, 3, 4], 6)` is `2`: 1 + 5 and 3 + 3. `count_pairs([2, 4, 2], 6)` is also `2`, because each 2 pairs with the 4.
---examples
assert count_pairs([1, 5, 3, 3, 4], 6) == 2
assert count_pairs([2, 4, 2], 6) == 2
---clarify
+ tiny | Can the list be empty, or hold just one card? | Yes, both. With fewer than two cards there are no pairs, so return 0.
+ dups | Can two cards have the same value? | Yes, often. Count pairs of positions, so three 3s with t = 6 make 3 pairs.
+ neg | Can a value be negative or zero? | Yes: refunds show up as negative cards. Any whole number.
- | Is the list sorted? | No, it's in the order the cards were scanned.
- | Should I print the answer or return it? | Return it.
- | Which language should I use? | Whichever you're comfortable in. Python is fine.
---test tiny
assert count_pairs([], 5) == 0
assert count_pairs([5], 10) == 0
---test dups
assert count_pairs([3, 3, 3], 6) == 3
assert count_pairs([1, 1, 1, 1], 2) == 6
---test neg
assert count_pairs([-2, 7, 0, 5], 5) == 2
assert count_pairs([0, 0], 0) == 1
---test big
import random
random.seed(7)
big = [random.randint(-1000, 1000) for _ in range(200000)]
r, secs = timed(count_pairs, big, 17)
from collections import Counter
c = Counter(big)
assert r == sum(c[v] * c[17 - v] for v in c if v < 17 - v)
assert secs < 1.5, f"{secs:.2f} s for 200,000 cards: checking every pair is too slow"
---starter
def count_pairs(a, t):
    pass
---solution
def count_pairs(a, t):
    seen = {}
    pairs = 0
    for v in a:
        pairs += seen.get(t - v, 0)
        seen[v] = seen.get(v, 0) + 1
    return pairs
---brute
def count_pairs(a, t):
    n = len(a)
    return sum(1 for i in range(n) for j in range(i + 1, n) if a[i] + a[j] == t)
---approach
Walk the list once, keeping a count of every value seen so far. Each new value `v` pairs with every earlier `t - v`, so add that count, then record `v`. One pass, O(n).
---hint
Checking every pair is O(n²). For one card `v`, what value would its partner need to be?
---hint
Its partner is `t - v`. If you remember how many times each value has appeared *so far*, you know how many partners `v` has to its left.
---hint
Keep `seen = {}` of counts. For each `v`: add `seen.get(t - v, 0)` to the answer, then do `seen[v] += 1`. Adding before recording stops a card pairing with itself.
---twist
Good. Now the customer wants a **difference**, not a sum: count pairs `i < j` where `a[j] - a[i] == t` (the later card is worth exactly `t` more). Write `count_rises(a, t)`. For `[1, 4, 2, 5]` and `t = 3` that's `2`: 1 → 4 and 2 → 5.
---twisttests
assert count_rises([1, 4, 2, 5], 3) == 2
assert count_rises([5, 2], 3) == 0
assert count_rises([1, 1, 1], 0) == 3
assert count_rises([], 1) == 0
---twistsolution
def count_rises(a, t):
    seen = {}
    rises = 0
    for v in a:
        rises += seen.get(v - t, 0)
        seen[v] = seen.get(v, 0) + 1
    return rises
```
