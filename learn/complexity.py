"""Small helpers shared by the Think Complexity lessons.

Everything a chapter teaches is written out in that chapter. This file only
holds plumbing that isn't the point of any lesson: drawing grids, labelling
plots, and a base class for 2-D cellular automata like the book's Cell2D.
"""
import numpy as np
import matplotlib.pyplot as plt


def decorate(**options):
    """Set title, xlabel, xscale, ... on the current axes in one call."""
    ax = plt.gca()
    for key, value in options.items():
        getattr(ax, "set_" + key)(value)
    if ax.get_legend_handles_labels()[1]:
        ax.legend()


def draw_array(array, cmap="Blues", **options):
    """Show a 2-D array as a grid of coloured cells."""
    plt.figure(figsize=options.pop("figsize", (4, 4)))
    plt.imshow(array, cmap=cmap, interpolation="none", **options)
    plt.xticks([])
    plt.yticks([])


class Cell2D:
    """Base class for 2-D cellular automata (like the book's Cell2D)."""

    def __init__(self, n, m=None):
        m = n if m is None else m
        self.array = np.zeros((n, m), np.uint8)

    def add_cells(self, row, col, *strings):
        """Paste a pattern like '010', '001', '111' with its top-left at (row, col)."""
        for i, s in enumerate(strings):
            self.array[row + i, col:col + len(s)] = np.array([int(b) for b in s])

    def loop(self, iters=1):
        for _ in range(iters):
            self.step()

    def draw(self, **options):
        draw_array(self.array, **options)
