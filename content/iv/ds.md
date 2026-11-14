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

```interview
id: closest
title: The closest pair
fn: closest_sum
ch: 7
decoys: 3, 9, 15, 28
bigo: O(n)
---prompt
A lab has weights sorted from lightest to heaviest. You need two **different** weights whose total is as close as possible to a target `t`.

Write `closest_sum(a, t)`: `a` is sorted in ascending order. Return the smallest possible `abs(a[i] + a[j] - t)` over pairs `i < j`.

`closest_sum([1, 3, 4, 7, 10], 15)` is `1`: 4 + 10 = 14, which is 1 away. `closest_sum([2, 5, 9], 7)` is `0`: 2 + 5.
---examples
assert closest_sum([1, 3, 4, 7, 10], 15) == 1
assert closest_sum([2, 5, 9], 7) == 0
---clarify
+ tiny | What if there are fewer than two weights? | Then there's no pair. Return None.
+ dups | Can two weights be equal? | Yes, and two equal weights are still two different weights.
+ neg | Can weights or the target be negative? | Yes, they're offsets from a reference weight. Any whole numbers.
- | Is the list really sorted? | Yes, smallest first.
- | Do I need to return which pair it was? | No, just the distance.
- | Is there a time limit? | Aim for the best you can. We'll talk about cost before you code.
---test tiny
assert closest_sum([], 4) is None
assert closest_sum([3], 4) is None
---test dups
assert closest_sum([5, 5], 10) == 0
assert closest_sum([1, 4, 4, 9], 8) == 0
---test neg
assert closest_sum([-8, -3, 1, 6], -10) == 1
assert closest_sum([-5, -1], 0) == 6
---test big
import random
random.seed(3)
big = sorted(random.sample(range(-10**9, 10**9), 200000))
r, secs = timed(closest_sum, big, 123456789)
import bisect
best = None
for i, v in enumerate(big):
    k = bisect.bisect_left(big, 123456789 - v, i + 1)
    for j in (k - 1, k):
        if i < j < len(big):
            d = abs(v + big[j] - 123456789)
            best = d if best is None else min(best, d)
assert r == best
assert secs < 1.5, f"{secs:.2f} s for 200,000 weights: trying every pair is too slow"
---starter
def closest_sum(a, t):
    pass
---solution
def closest_sum(a, t):
    if len(a) < 2:
        return None
    i, j = 0, len(a) - 1
    best = abs(a[i] + a[j] - t)
    while i < j:
        s = a[i] + a[j]
        best = min(best, abs(s - t))
        if s < t:
            i += 1
        elif s > t:
            j -= 1
        else:
            return 0
    return best
---brute
def closest_sum(a, t):
    n = len(a)
    if n < 2:
        return None
    return min(abs(a[i] + a[j] - t) for i in range(n) for j in range(i + 1, n))
---approach
Put one finger on each end. If the pair is too small, only moving the left finger right can make it bigger; if too big, move the right finger left. Every step throws away one weight for good, so it's one pass, O(n).
---hint
The list is sorted. What does that tell you about `a[0] + a[-1]` compared with `a[1] + a[-1]`?
---hint
Start with `i = 0` and `j = len(a) - 1`. If `a[i] + a[j]` is below `t`, no pair using `a[i]` with anything left of `j` can be closer, so move `i`.
---hint
Loop while `i < j`: record `abs(s - t)`, then `i += 1` if `s < t`, `j -= 1` if `s > t`, and return 0 if it's exact.
---twist
Nice. Now the weights arrive **unsorted**, straight off the scale. Change `closest_sum(a, t)` so it works for any order. What does that cost now?
---twisttests
assert closest_sum([10, 1, 7, 4, 3], 15) == 1
assert closest_sum([9, 2, 5], 7) == 0
assert closest_sum([6, -8, 1, -3], -10) == 1
assert closest_sum([4], 4) is None
---twistsolution
def closest_sum(a, t):
    a = sorted(a)
    if len(a) < 2:
        return None
    i, j = 0, len(a) - 1
    best = abs(a[i] + a[j] - t)
    while i < j:
        s = a[i] + a[j]
        best = min(best, abs(s - t))
        if s < t:
            i += 1
        elif s > t:
            j -= 1
        else:
            return 0
    return best
```

```interview
id: distinct
title: Longest stretch with few kinds
fn: longest_k_kinds
ch: 8
decoys: 3, 7, 11, 31
bigo: O(n)
---prompt
A bird watcher logs one letter per bird they see, in order, like `"aabcbbd"`. They want the longest **unbroken** stretch of the log that has at most `k` different kinds of bird.

Write `longest_k_kinds(s, k)`: return the length of the longest substring of `s` with at most `k` distinct letters.

`longest_k_kinds("aabcbbd", 2)` is `4`: `"bcbb"`. `longest_k_kinds("abc", 3)` is `3`.
---examples
assert longest_k_kinds("aabcbbd", 2) == 4
assert longest_k_kinds("abc", 3) == 3
---clarify
+ empty | Can the log be empty? | Yes. Then the answer is 0.
+ kzero | Can k be 0? | Yes. No letters are allowed, so the answer is 0.
+ bigk | What if k is more than the number of kinds in the log? | Then the whole log counts.
- | Are the letters only lowercase? | Yes, a to z. It won't matter much.
- | Should I return the substring itself? | Just its length.
- | Can I use extra memory? | Yes, within reason.
---test empty
assert longest_k_kinds("", 2) == 0
---test kzero
assert longest_k_kinds("aaa", 0) == 0
---test bigk
assert longest_k_kinds("abcab", 10) == 5
assert longest_k_kinds("z", 1) == 1
---test big
import random
random.seed(11)
big = "".join("d" if i % 60000 == 59999 else random.choice("abc") for i in range(200000))
r, secs = timed(longest_k_kinds, big, 3)
from collections import Counter
c, i, want = Counter(), 0, 0
for j, ch in enumerate(big):
    c[ch] += 1
    while len(c) > 3:
        c[big[i]] -= 1
        if not c[big[i]]:
            del c[big[i]]
        i += 1
    want = max(want, j - i + 1)
assert r == want
assert secs < 1.5, f"{secs:.2f} s for 200,000 birds: restarting from every position is too slow"
---starter
def longest_k_kinds(s, k):
    pass
---solution
def longest_k_kinds(s, k):
    count = {}
    left = best = 0
    for right, ch in enumerate(s):
        count[ch] = count.get(ch, 0) + 1
        while len(count) > k:
            out = s[left]
            count[out] -= 1
            if count[out] == 0:
                del count[out]
            left += 1
        best = max(best, right - left + 1)
    return best
---brute
def longest_k_kinds(s, k):
    best = 0
    for i in range(len(s)):
        kinds = set()
        for j in range(i, len(s)):
            kinds.add(s[j])
            if len(kinds) > k:
                break
            best = max(best, j - i + 1)
    return best
---approach
Slide a window over the log. Grow it on the right one letter at a time, keeping a count per letter; whenever it holds more than `k` kinds, shrink it from the left until it's legal again. Each letter enters and leaves once: O(n).
---hint
If a stretch has too many kinds, any longer stretch containing it does too. So once it breaks, you never need to look further right with the same start.
---hint
Keep a window `s[left:right + 1]` and a dict of letter counts inside it. Move `right` every step; move `left` only when there are too many kinds.
---hint
After adding `s[right]`, `while len(count) > k:` take one off `count[s[left]]` (deleting it at zero) and step `left`. Then the window length `right - left + 1` is a candidate.
---twist
The watcher changes their mind: they want stretches with **exactly** `k` kinds. Write `longest_exactly_k(s, k)`, and return 0 if no stretch has exactly `k` kinds.
---twisttests
assert longest_exactly_k("aabcbbd", 2) == 4
assert longest_exactly_k("aab", 3) == 0
assert longest_exactly_k("abcab", 3) == 5
assert longest_exactly_k("", 1) == 0
assert longest_exactly_k("aaab", 1) == 3
---twistsolution
def longest_exactly_k(s, k):
    count = {}
    left = best = 0
    for right, ch in enumerate(s):
        count[ch] = count.get(ch, 0) + 1
        while len(count) > k:
            out = s[left]
            count[out] -= 1
            if count[out] == 0:
                del count[out]
            left += 1
        if len(count) == k:
            best = max(best, right - left + 1)
    return best
```
