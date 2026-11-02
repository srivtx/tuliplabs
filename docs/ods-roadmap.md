# Open Data Structures (Python), chapter by chapter

A section of its own (`ods/`, lessons in `content/od/`) that follows Pat Morin's *Open Data
Structures* in the book's order. Each chapter builds the book's structures in Python, shows them
working in a 3D simulation (with the naive alternative to compare against), turns the book's
exercises into graded ones, and adds more questions of our own.

| Chapter | What you build |
|---|---|
| 1 · Introduction | interfaces (Queue, Stack, Deque, List, USet, SSet), the maths you need (logs, factorials, Big-O, expected values), the model of computation |
| 2 · Array-based lists | ArrayStack (growing and shrinking), ArrayQueue (a circular array), ArrayDeque, DualArrayDeque (two stacks, rebalanced), RootishArrayStack |
| 3 · Linked lists | SLList, DLList with a dummy node, SEList (blocks of elements) |
| 4 · Skiplists | SkiplistSSet, SkiplistList, why the expected height is logarithmic |
| 5 · Hash tables | ChainedHashTable with multiplicative hashing, LinearHashTable (linear probing), tabulation hashing, hash codes for tuples and strings |
| 6 · Binary trees | BinaryTree and its traversals, BinarySearchTree (find, add, remove) |
| 7 · Random binary search trees | why random insertion order gives depth O(log n), the Treap |
| 8 · Scapegoat trees | partial rebuilding |
| 9 · Red-black trees | 2-4 trees, left-leaning red-black trees |
| 10 · Heaps | BinaryHeap (an implicit tree in an array), MeldableHeap |
| 11 · Sorting | merge sort, quicksort, heap sort, the n log n lower bound, counting sort, radix sort |
| 12 · Graphs | AdjacencyMatrix, AdjacencyLists, BFS, DFS |
| 13 · Data structures for integers | BinaryTrie, XFastTrie, YFastTrie |
| 14 · External memory | the block store, B-trees |
