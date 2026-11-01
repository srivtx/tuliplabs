"""A small, readable stand-in for the ModSim library used in
*Modeling and Simulation in Python* (Allen B. Downey, 3rd edition).

It keeps the book's names and call signatures, so code from the book runs as
printed, but it's short enough to read in one sitting. Two simplifications:
there are no Pint units (numbers are plain floats), and `State`/`System`
are simple attribute bags rather than pandas Series.
"""
from types import SimpleNamespace

import numpy as np
import pandas as pd
import matplotlib
import matplotlib.pyplot as plt
from numpy import sqrt, exp, log, log10, pi, sin, cos, tan, arctan2, array, linspace as _np_linspace  # noqa: F401

# ------------------------------------------------------------------ randomness
def flip(p=0.5):
    """True with probability p."""
    return np.random.random() < p


# ---------------------------------------------------------------------- ranges
def linspace(start, stop, num=50, **options):
    """`num` evenly spaced values from start to stop, inclusive."""
    return np.linspace(start, stop, num, **options)


def linrange(start=0, stop=None, step=1, endpoint=False):
    """Like range, but works with floats. Excludes stop unless endpoint=True."""
    if stop is None:
        start, stop = 0, start
    n = int(round((stop - start) / step))
    if endpoint:
        n += 1
    arr = start + step * np.arange(n)
    if all(float(v).is_integer() for v in (start, step)):
        arr = arr.astype(int)
    return arr


# -------------------------------------------------------------- state objects
class _Bag:
    """Named values you can read as attributes, index by name, and unpack."""

    def __init__(self, **kwargs):
        object.__setattr__(self, "_d", dict(kwargs))

    def __getattr__(self, name):
        try:
            return self._d[name]
        except KeyError:
            raise AttributeError(f"{type(self).__name__} has no variable named {name!r}") from None

    def __setattr__(self, name, value):
        self._d[name] = value

    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self._d.values())[key]
        return self._d[key]

    def __setitem__(self, key, value):
        self._d[key] = value

    def __iter__(self):
        return iter(self._d.values())

    def __len__(self):
        return len(self._d)

    def __contains__(self, key):
        return key in self._d

    def __eq__(self, other):
        return isinstance(other, _Bag) and self._d == other._d

    @property
    def index(self):
        return list(self._d)

    def items(self):
        return self._d.items()

    def keys(self):
        return self._d.keys()

    def copy(self):
        return type(self)(**self._d)

    def set(self, **kwargs):
        """Copy with some values replaced."""
        new = self.copy()
        new._d.update(kwargs)
        return new

    def __repr__(self):
        width = max((len(k) for k in self._d), default=0)
        rows = "\n".join(f"  {k:<{width}}  {v!r}" for k, v in self._d.items())
        return f"{type(self).__name__}:\n{rows}"


class State(_Bag):
    """The state variables of a system, the things that change over time."""


class System(_Bag):
    """Parameters and initial conditions: the things that stay fixed during a run."""

    def __init__(self, *args, **kwargs):
        d = {}
        for a in args:
            d.update(a._d if isinstance(a, _Bag) else a)
        d.update(kwargs)
        super().__init__(**d)


class Params(System):
    """Values you may want to vary between runs."""


# ------------------------------------------------------------- series/frames
class TimeSeries(pd.Series):
    """A pandas Series that maps times to values."""

    @property
    def _constructor(self):
        return TimeSeries

    def __init__(self, *args, **kwargs):
        if not args and "dtype" not in kwargs:
            kwargs["dtype"] = float
        super().__init__(*args, **kwargs)
        if not self.index.name:
            self.index.name = "Time"

    def extract(self, attr):
        """Pull one component (e.g. 'x') out of a series of Vectors."""
        return TimeSeries({t: getattr(v, attr) for t, v in self.items()})


class SweepSeries(TimeSeries):
    """Maps parameter values to results."""

    @property
    def _constructor(self):
        return SweepSeries

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.index.name = "Parameter"


class _RowSetter:
    def __init__(self, frame):
        self.frame = frame

    def __getitem__(self, t):
        row = self.frame.loc[t]
        return State(**{k: row[k] for k in self.frame.columns})

    def __setitem__(self, t, state):
        values = dict(state.items()) if isinstance(state, _Bag) else dict(state)
        self.frame.loc[t, list(values)] = list(values.values())


class TimeFrame(pd.DataFrame):
    """A DataFrame with one row per time step and one column per state variable."""
    _metadata = []

    @property
    def _constructor(self):
        return TimeFrame

    @property
    def _constructor_sliced(self):
        return TimeSeries

    @property
    def row(self):
        """frame.row[t] = state stores a State as one row."""
        return _RowSetter(self)


class SweepFrame(TimeFrame):
    """Rows and columns are two swept parameters."""

    @property
    def _constructor(self):
        return SweepFrame


def get_first_label(series):
    return series.index[0]


def get_last_label(series):
    return series.index[-1]


def get_first_value(series):
    return series.iloc[0]


def get_last_value(series):
    return series.iloc[-1]


def gradient(series, **options):
    """Numerical derivative of a series with respect to its index."""
    return TimeSeries(np.gradient(series.values, series.index.values, **options), index=series.index)


def crossings(series, value):
    """Times (by linear interpolation) where a series passes through value."""
    t, y = np.asarray(series.index, float), np.asarray(series.values, float) - value
    out = []
    for i in range(len(y) - 1):
        if y[i] == 0:
            out.append(t[i])
        elif y[i] * y[i + 1] < 0:
            out.append(t[i] - y[i] * (t[i + 1] - t[i]) / (y[i + 1] - y[i]))
    if len(y) and y[-1] == 0:
        out.append(t[-1])
    return np.array(out)


def interpolate(series, **options):
    """A function that interpolates between the points of a series."""
    from scipy.interpolate import interp1d
    options.setdefault("fill_value", "extrapolate")
    return interp1d(series.index, series.values, **options)


def interp_inverse(series, **options):
    """A function that maps values back to labels."""
    from scipy.interpolate import interp1d
    options.setdefault("fill_value", "extrapolate")
    return interp1d(series.values, series.index, **options)


# --------------------------------------------------------------- plotting
def plot(*args, **options):
    """Plot a Series against its index, or anything plt.plot accepts."""
    if args and isinstance(args[0], pd.Series):
        s = args[0]
        return plt.plot(s.index, s.values, *args[1:], **options)
    return plt.plot(*args, **options)


def decorate(**options):
    """Set labels, limits, and a legend on the current axes in one call."""
    ax = plt.gca()
    legend = options.pop("legend", None)
    for key, value in options.items():
        getattr(ax, "set_" + key)(value)
    handles, labels = ax.get_legend_handles_labels()
    if (legend is None and labels) or legend:
        ax.legend(loc="best")


def contour(df, **options):
    """Contour plot of a SweepFrame (rows on y, columns on x)."""
    x, y = df.columns.values, df.index.values
    cs = plt.contour(x, y, df.values.astype(float), **options)
    plt.clabel(cs, inline=1, fontsize=9)
    return cs


# ------------------------------------------------------------------ vectors
class Vector(np.ndarray):
    """A 2-D or 3-D vector with .x, .y, .mag, .angle and .hat()."""

    def __new__(cls, *components):
        if len(components) == 1:
            components = tuple(components[0])
        return np.asarray(components, dtype=float).view(cls)

    x = property(lambda self: float(self[0]))
    y = property(lambda self: float(self[1]))
    z = property(lambda self: float(self[2]))
    mag = property(lambda self: float(np.sqrt(np.sum(np.asarray(self) ** 2))))
    angle = property(lambda self: float(np.arctan2(self[1], self[0])))

    def hat(self):
        m = self.mag
        return self / m if m else self * 0

    def perp(self):
        return Vector(-self[1], self[0])

    def __repr__(self):
        return "Vector(" + ", ".join(f"{float(c):g}" for c in self) + ")"

    __str__ = __repr__


def vector_mag(v):
    return Vector(v).mag


def vector_hat(v):
    return Vector(v).hat()


def pol2cart(theta, rho):
    """Polar to Cartesian; theta in radians."""
    return rho * np.cos(theta), rho * np.sin(theta)


def cart2pol(x, y):
    return np.arctan2(y, x), np.hypot(x, y)


# ----------------------------------------------------- solvers & optimizers
def _flatten(values):
    shapes, flat = [], []
    for v in values:
        a = np.atleast_1d(np.asarray(v, dtype=float))
        shapes.append(None if np.ndim(v) == 0 else len(a))
        flat.extend(a)
    return shapes, np.array(flat)


def _unflatten(y, names, shapes):
    out, i = {}, 0
    for name, shape in zip(names, shapes):
        if shape is None:
            out[name] = float(y[i])
            i += 1
        else:
            out[name] = Vector(*y[i:i + shape])
            i += shape
    return State(**out)


def run_ode_solver(system, slope_func, **options):
    """Solve the ODEs given by slope_func(state, t, system), starting at system.init.

    Returns (results, details). results is a TimeFrame evaluated at 101 evenly
    spaced times (or `t_eval`). Pass events=event_func to stop when
    event_func(state, t, system) crosses zero.
    """
    from scipy.integrate import solve_ivp
    init = system.init
    names = init.index
    shapes, y0 = _flatten(init)
    t_0 = getattr(system, "t_0", getattr(system, "t0", 0))
    t_end = system.t_end

    def f(t, y):
        slopes = slope_func(_unflatten(y, names, shapes), t, system)
        return _flatten(slopes)[1]

    events = options.pop("events", [])
    if callable(events):
        events = [events]
    wrapped = []
    for ev in events:
        def g(t, y, ev=ev):
            return ev(_unflatten(y, names, shapes), t, system)
        g.terminal = getattr(ev, "terminal", True)
        g.direction = getattr(ev, "direction", 0)
        wrapped.append(g)
    t_eval = options.pop("t_eval", None)
    sol = solve_ivp(f, [t_0, t_end], y0, events=wrapped or None, dense_output=True, **options)
    t_stop = sol.t[-1]
    if t_eval is None:
        t_eval = np.linspace(t_0, t_end, 101)
    t_eval = np.asarray([t for t in t_eval if t <= t_stop])
    if not len(t_eval) or t_eval[-1] < t_stop:
        t_eval = np.append(t_eval, t_stop)
    ys = sol.sol(t_eval)
    rows = [dict(_unflatten(ys[:, i], names, shapes).items()) for i in range(len(t_eval))]
    results = TimeFrame(rows, index=t_eval, columns=names)
    results.index.name = "Time"
    details = SimpleNamespace(success=sol.success, message=sol.message, t_events=sol.t_events, nfev=sol.nfev)
    return results, details


def root_bisect(func, bracket, *args, **options):
    """Find x in bracket where func(x, *args) == 0. Answer is in res.root."""
    from scipy.optimize import root_scalar
    res = root_scalar(func, bracket=bracket, args=args, method="bisect", **options)
    return SimpleNamespace(root=res.root, converged=res.converged, iterations=res.iterations)


def maximize(func, bracket, *args, **options):
    """Golden-section search for the x in bracket that maximizes func(x, *args).

    Returns an object with x (the best input) and fun (func at x).
    """
    from scipy.optimize import minimize_scalar
    res = minimize_scalar(lambda x: -func(x, *args), bounds=bracket, method="bounded", **options)
    return SimpleNamespace(x=res.x, fun=-res.fun, success=res.success)


def minimize(func, bracket, *args, **options):
    from scipy.optimize import minimize_scalar
    res = minimize_scalar(lambda x: func(x, *args), bounds=bracket, method="bounded", **options)
    return SimpleNamespace(x=res.x, fun=res.fun, success=res.success)


max_bounded = maximize
min_bounded = minimize


def fit_leastsq(error_func, params, data, **options):
    """Find params that minimize the sum of squared errors returned by error_func(params, data)."""
    from scipy.optimize import least_squares
    names = params.index if isinstance(params, _Bag) else None
    x0 = list(params) if names else np.atleast_1d(params)

    def resid(x):
        p = Params(**dict(zip(names, x))) if names else x
        return np.asarray(error_func(p, data), dtype=float)

    res = least_squares(resid, x0, **options)
    best = Params(**dict(zip(names, res.x))) if names else res.x
    return best, SimpleNamespace(success=res.success, cost=res.cost, fun=res.fun)


__all__ = [n for n in dir() if not n.startswith("_") and n not in ("SimpleNamespace", "matplotlib")]
