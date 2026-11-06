/* Node in a box. A Workbench project's .js files run as CommonJS modules, with the parts of Node a backend
   needs: http (servers and fetch to them), events, fs (an in-memory disk), path, url, querystring, util,
   crypto and Buffer. Everything happens in memory, and the network is only your own servers on localhost.

   The same file runs in the browser (learn/js-worker.js) and in Node (tools/wb-node-check.js), so what the
   build verifies is exactly what learners run. The ops mirror learn/harness.py's Workbench ops:
     project_load, project_call, project_tear, project_check, project_session
   and answer in the same shapes, so the bench doesn't care which language a project is written in.

   Like real Node, an exception nobody catches kills the program: its servers close, its timers stop, and
   the next request is refused. That's the lesson error handling answers. */
(function (root) {
  "use strict";
  const PREFIX = "wb/";               // sourceURL of each file, so stack frames say wb/app.js:12:5
  const DISK_LIMIT = 4000;
  const CALL_LIMIT = 10000;           // a terminal line that takes longer than this is reported, not awaited
  const STATUS = {
    100: "Continue", 101: "Switching Protocols", 200: "OK", 201: "Created", 202: "Accepted", 204: "No Content",
    206: "Partial Content", 301: "Moved Permanently", 302: "Found", 303: "See Other", 304: "Not Modified",
    307: "Temporary Redirect", 308: "Permanent Redirect", 400: "Bad Request", 401: "Unauthorized",
    402: "Payment Required", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 406: "Not Acceptable",
    408: "Request Timeout", 409: "Conflict", 410: "Gone", 411: "Length Required", 412: "Precondition Failed",
    413: "Payload Too Large", 415: "Unsupported Media Type", 418: "I'm a Teapot", 422: "Unprocessable Entity",
    425: "Too Early", 428: "Precondition Required", 429: "Too Many Requests", 431: "Request Header Fields Too Large",
    500: "Internal Server Error", 501: "Not Implemented", 502: "Bad Gateway", 503: "Service Unavailable",
    504: "Gateway Timeout",
  };
  const METHODS = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"];
  const enc = new TextEncoder(), dec = new TextDecoder();
  const nodeErr = (Ctor, code, msg, extra) => Object.assign(new Ctor(msg), { code }, extra || {});

  // ------------------------------------------------------------- Buffer --
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  class Buffer extends Uint8Array {
    static from(x, encoding) {
      if (typeof x === "string") return Buffer._enc(x, encoding);
      if (x instanceof ArrayBuffer) return new Buffer(x.slice(0));
      if (x && x.type === "Buffer" && Array.isArray(x.data)) return new Buffer(x.data);
      return new Buffer(x);
    }
    static _enc(s, e = "utf8") {
      e = String(e).toLowerCase();
      if (e === "utf8" || e === "utf-8") return new Buffer(enc.encode(s));
      if (e === "hex") { const b = new Buffer(s.length >> 1); for (let i = 0; i < b.length; i++) b[i] = parseInt(s.substr(i * 2, 2), 16); return b; }
      if (e === "base64" || e === "base64url") {
        const t = s.replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+/]/g, "");
        const out = [];
        for (let i = 0; i < t.length; i += 4) {
          const n = [0, 1, 2, 3].map((k) => (i + k < t.length ? B64.indexOf(t[i + k]) : -1));
          out.push((n[0] << 2) | (n[1] >> 4));
          if (n[2] >= 0) out.push(((n[1] & 15) << 4) | (n[2] >> 2));
          if (n[3] >= 0) out.push(((n[2] & 3) << 6) | n[3]);
        }
        return new Buffer(out);
      }
      if (e === "latin1" || e === "binary" || e === "ascii") return new Buffer([...s].map((c) => c.charCodeAt(0) & 255));
      throw nodeErr(TypeError, "ERR_UNKNOWN_ENCODING", `Unknown encoding: ${e}`);
    }
    static alloc(n, fill = 0) { const b = new Buffer(n); b.fill(typeof fill === "string" ? fill.charCodeAt(0) : fill); return b; }
    static allocUnsafe(n) { return new Buffer(n); }
    static isBuffer(x) { return x instanceof Buffer; }
    static byteLength(s, e) { return typeof s === "string" ? Buffer._enc(s, e).length : s.byteLength; }
    static concat(list, total) {
      total = total ?? list.reduce((n, b) => n + b.length, 0);
      const out = new Buffer(total);
      let at = 0;
      for (const b of list) { out.set(b.subarray(0, Math.max(0, total - at)), at); at += b.length; if (at >= total) break; }
      return out;
    }
    toString(e = "utf8", start = 0, end = this.length) {
      const b = this.subarray(start, end);
      e = String(e).toLowerCase();
      if (e === "utf8" || e === "utf-8") return dec.decode(b);
      if (e === "hex") return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
      if (e === "base64" || e === "base64url") {
        let s = "";
        for (let i = 0; i < b.length; i += 3) {
          const n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
          s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < b.length ? B64[n & 63] : "=");
        }
        return e === "base64" ? s : s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      }
      if (e === "latin1" || e === "binary" || e === "ascii") return String.fromCharCode(...b);
      throw nodeErr(TypeError, "ERR_UNKNOWN_ENCODING", `Unknown encoding: ${e}`);
    }
    toJSON() { return { type: "Buffer", data: [...this] }; }
    equals(o) { return this.length === o.length && this.every((x, i) => x === o[i]); }
    write(s, offset = 0) { const b = Buffer.from(s); this.set(b.subarray(0, this.length - offset), offset); return Math.min(b.length, this.length - offset); }
  }
  const toBuf = (chunk, encoding) => {
    if (typeof chunk === "string") return Buffer.from(chunk, encoding);
    if (chunk instanceof Uint8Array) return Buffer.from(chunk);
    const got = chunk === null ? "null" : typeof chunk === "object" ? `an instance of ${chunk.constructor ? chunk.constructor.name : "Object"}` : `type ${typeof chunk} (${String(chunk)})`;
    throw nodeErr(TypeError, "ERR_INVALID_ARG_TYPE", `The "chunk" argument must be of type string or an instance of Buffer or Uint8Array. Received ${got}`);
  };

  // ------------------------------------------------------------- crypto --
  // SHA-256, SHA-1 and HMAC in plain JS: synchronous like Node's, so createHash(...).digest() needs no await.
  const K256 = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  function pad64(msg) {
    const l = msg.length, n = (((l + 8) >> 6) + 1) << 6, m = new Uint8Array(n);
    m.set(msg); m[l] = 0x80;
    const bits = l * 8;
    for (let i = 0; i < 4; i++) m[n - 1 - i] = (bits >>> (8 * i)) & 255;
    m[n - 5] = Math.floor(bits / 2 ** 32) & 255;
    return m;
  }
  function sha256(msg) {
    const m = pad64(msg), H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), W = new Uint32Array(64);
    const r = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < m.length; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) W[i] = (W[i - 16] + (r(W[i - 15], 7) ^ r(W[i - 15], 18) ^ (W[i - 15] >>> 3)) + W[i - 7] + (r(W[i - 2], 17) ^ r(W[i - 2], 19) ^ (W[i - 2] >>> 10))) | 0;
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + W[i]) | 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    const out = new Buffer(32);
    H.forEach((x, i) => { out[4 * i] = x >>> 24; out[4 * i + 1] = x >>> 16; out[4 * i + 2] = x >>> 8; out[4 * i + 3] = x; });
    return out;
  }
  function sha1(msg) {
    const m = pad64(msg), H = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]), W = new Uint32Array(80);
    const r = (x, n) => (x << n) | (x >>> (32 - n));
    for (let o = 0; o < m.length; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
      for (let i = 16; i < 80; i++) W[i] = r(W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16], 1);
      let [a, b, c, d, e] = H;
      for (let i = 0; i < 80; i++) {
        const f = i < 20 ? (b & c) | (~b & d) : i < 40 ? b ^ c ^ d : i < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
        const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
        const t = (r(a, 5) + f + e + k + W[i]) | 0;
        e = d; d = c; c = r(b, 30); b = a; a = t;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e;
    }
    const out = new Buffer(20);
    H.forEach((x, i) => { out[4 * i] = x >>> 24; out[4 * i + 1] = x >>> 16; out[4 * i + 2] = x >>> 8; out[4 * i + 3] = x; });
    return out;
  }
  const HASH = { sha256: [sha256, 64], sha1: [sha1, 64] };
  function hashFn(alg) {
    const h = HASH[String(alg).toLowerCase().replace("-", "")];
    if (!h) throw nodeErr(Error, "ERR_OSSL_EVP_UNSUPPORTED", `Digest method not supported: ${alg} (this sandbox has sha256 and sha1)`);
    return h;
  }
  function hmac(alg, key, msg) {
    const [fn, block] = hashFn(alg);
    let k = toBuf(key);
    if (k.length > block) k = fn(k);
    const kk = new Uint8Array(block); kk.set(k);
    const ipad = kk.map((x) => x ^ 0x36), opad = kk.map((x) => x ^ 0x5c);
    return fn(Buffer.concat([opad, fn(Buffer.concat([ipad, msg]))]));
  }
  class Hash {
    constructor(fn) { this.fn = fn; this.parts = []; }
    update(d, e) { this.parts.push(toBuf(d, e)); return this; }
    digest(e) { const out = this.fn(Buffer.concat(this.parts)); return e ? out.toString(e) : out; }
  }
  const randomBytes = (n) => { const b = new Buffer(n); for (let i = 0; i < n; i += 65536) globalThis.crypto.getRandomValues(b.subarray(i, i + 65536)); return b; };
  const cryptoMod = {
    createHash: (alg) => new Hash(hashFn(alg)[0]),
    createHmac: (alg, key) => new Hash((msg) => hmac(alg, key, msg)),
    randomBytes,
    randomUUID: () => globalThis.crypto.randomUUID(),
    randomInt: (a, b) => { if (b === undefined) { b = a; a = 0; } return a + Math.floor(Math.random() * (b - a)); },
    timingSafeEqual(a, b) {
      if (a.length !== b.length) throw nodeErr(RangeError, "ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH", "Input buffers must have the same byte length");
      let d = 0;
      for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
      return d === 0;
    },
    pbkdf2Sync(password, salt, iterations, keylen, digest) {
      const [, ] = hashFn(digest);
      const P = toBuf(password), S = toBuf(salt), out = [];
      let len = 0;
      for (let block = 1; len < keylen; block++) {
        let u = hmac(digest, P, Buffer.concat([S, Buffer.from([block >>> 24, (block >>> 16) & 255, (block >>> 8) & 255, block & 255])]));
        const t = Buffer.from(u);
        for (let i = 1; i < iterations; i++) { u = hmac(digest, P, u); for (let k = 0; k < t.length; k++) t[k] ^= u[k]; }
        out.push(t); len += t.length;
      }
      return Buffer.concat(out, keylen);
    },
  };
  cryptoMod.webcrypto = globalThis.crypto;

  // ------------------------------------------------------------- events --
  class EventEmitter {
    _evs() { return this.__ev || (this.__ev = Object.create(null)); }
    on(n, f) { (this._evs()[n] = this._evs()[n] || []).push(f); if (this._listening) this._listening(n); return this; }
    addListener(n, f) { return this.on(n, f); }
    prependListener(n, f) { (this._evs()[n] = this._evs()[n] || []).unshift(f); return this; }
    once(n, f) { const w = (...a) => { this.off(n, w); return f.apply(this, a); }; w.listener = f; return this.on(n, w); }
    off(n, f) { const l = this._evs()[n]; if (l) { const i = l.findIndex((x) => x === f || x.listener === f); if (i >= 0) l.splice(i, 1); } return this; }
    removeListener(n, f) { return this.off(n, f); }
    removeAllListeners(n) { if (n === undefined) this.__ev = Object.create(null); else delete this._evs()[n]; return this; }
    emit(n, ...a) {
      const l = this._evs()[n];
      if (!l || !l.length) { if (n === "error") throw a[0] instanceof Error ? a[0] : new Error("Unhandled error. (" + a[0] + ")"); return false; }
      for (const f of [...l]) f.apply(this, a);
      return true;
    }
    listenerCount(n) { return (this._evs()[n] || []).length; }
    listeners(n) { return (this._evs()[n] || []).map((f) => f.listener || f); }
    eventNames() { return Object.keys(this._evs()).filter((k) => this._evs()[k].length); }
    setMaxListeners() { return this; }
  }
  EventEmitter.EventEmitter = EventEmitter;
  EventEmitter.once = (em, n) => new Promise((res) => em.once(n, (...a) => res(a)));

  // --------------------------------------------------------------- util --
  function inspect(v, opts, depth = 0, seen = []) {
    const d = (opts && opts.depth != null) ? opts.depth : 2;
    if (v === null) return "null";
    if (v === undefined) return "undefined";
    if (typeof v === "string") return depth ? "'" + v.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n") + "'" : v;
    if (typeof v === "number" || typeof v === "boolean") return Object.is(v, -0) ? "-0" : String(v);
    if (typeof v === "bigint") return v + "n";
    if (typeof v === "symbol") return v.toString();
    if (typeof v === "function") return v.toString().startsWith("class") ? `[class ${v.name || "(anonymous)"}]` : `[Function: ${v.name || "(anonymous)"}]`;
    if (seen.includes(v)) return "[Circular *1]";
    if (v instanceof Error) return v.stack && depth === 0 ? cleanStack(v) : `[${v.name}: ${v.message}]`;
    if (v instanceof Date) return isNaN(v) ? "Invalid Date" : v.toISOString();
    if (v instanceof RegExp) return String(v);
    if (v instanceof Buffer) return `<Buffer ${[...v.subarray(0, 50)].map((x) => x.toString(16).padStart(2, "0")).join(" ")}${v.length > 50 ? ` ... ${v.length - 50} more bytes` : ""}>`;
    if (v instanceof Promise) return "Promise { <pending> }";
    const s2 = [...seen, v];
    const wrap = (open, items, close, name) => {
      if (!items.length) return (name ? name + " " : "") + open + close;
      const one = `${name ? name + " " : ""}${open} ${items.join(", ")} ${close}`;
      if (one.length <= 72 && !items.some((x) => x.includes("\n"))) return one;
      const pad = "  ".repeat(depth + 1);
      return `${name ? name + " " : ""}${open}\n${items.map((x) => pad + x).join(",\n")}\n${"  ".repeat(depth)}${close}`;
    };
    if (depth > d) return Array.isArray(v) ? "[Array]" : `[${(v.constructor && v.constructor.name) || "Object"}]`;
    if (Array.isArray(v)) {
      const items = v.slice(0, 100).map((x) => inspect(x, opts, depth + 1, s2));
      if (v.length > 100) items.push(`... ${v.length - 100} more items`);
      return wrap("[", items, "]");
    }
    if (v instanceof Map) return wrap("{", [...v].map(([k, x]) => `${inspect(k, opts, depth + 1, s2)} => ${inspect(x, opts, depth + 1, s2)}`), "}", `Map(${v.size})`);
    if (v instanceof Set) return wrap("{", [...v].map((x) => inspect(x, opts, depth + 1, s2)), "}", `Set(${v.size})`);
    const name = v.constructor && v.constructor !== Object && v.constructor.name ? v.constructor.name : Object.getPrototypeOf(v) === null ? "[Object: null prototype]" : "";
    const key = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : inspect(k, opts, 1));
    return wrap("{", Object.keys(v).map((k) => `${key(k)}: ${inspect(v[k], opts, depth + 1, s2)}`), "}", name);
  }
  function format(...args) {
    let out = [];
    if (typeof args[0] === "string" && /%[sdifjoO%]/.test(args[0])) {
      let i = 1;
      out.push(args[0].replace(/%([sdifjoO%])/g, (m, k) => {
        if (k === "%") return "%";
        if (i >= args.length) return m;
        const a = args[i++];
        if (k === "s") return typeof a === "string" ? a : inspect(a, { depth: 1 }, 1);
        if (k === "d" || k === "i") return String(k === "i" ? parseInt(a) : Number(a));
        if (k === "f") return String(parseFloat(a));
        if (k === "j") { try { return JSON.stringify(a); } catch (e) { return "[Circular]"; } }
        return inspect(a, null, 1);
      }));
      args = args.slice(i);
    }
    return out.concat(args.map((a) => (typeof a === "string" ? a : inspect(a)))).join(" ");
  }
  const util = {
    format, inspect,
    promisify: (fn) => (...a) => new Promise((res, rej) => fn(...a, (e, v) => (e ? rej(e) : res(v)))),
    isDeepStrictEqual: (a, b) => deepEqual(a, b),
    types: { isPromise: (x) => x instanceof Promise, isDate: (x) => x instanceof Date, isRegExp: (x) => x instanceof RegExp },
    TextEncoder, TextDecoder,
  };
  function deepEqual(a, b) {
    if (Object.is(a, b)) return true;
    if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
    if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
    if (a instanceof Date) return +a === +b;
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }

  // --------------------------------------------------------- path, url, qs --
  function normalize(p) {
    const abs = p.startsWith("/"), out = [];
    for (const s of p.split("/")) { if (!s || s === ".") continue; if (s === "..") { if (out.length && out[out.length - 1] !== "..") out.pop(); else if (!abs) out.push(".."); } else out.push(s); }
    return (abs ? "/" : "") + out.join("/") || (abs ? "/" : ".");
  }
  const path = {
    sep: "/", delimiter: ":",
    normalize, join: (...a) => normalize(a.filter((x) => x !== "").join("/")),
    resolve: (...a) => { let p = ""; for (const x of a) p = x.startsWith("/") ? x : p + "/" + x; return normalize(p.startsWith("/") ? p : "/app/" + p); },
    basename: (p, ext) => { const b = p.replace(/\/+$/, "").split("/").pop(); return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b; },
    dirname: (p) => { const i = p.replace(/\/+$/, "").lastIndexOf("/"); return i < 0 ? "." : i === 0 ? "/" : p.slice(0, i); },
    extname: (p) => { const b = path.basename(p), i = b.lastIndexOf("."); return i <= 0 ? "" : b.slice(i); },
    isAbsolute: (p) => p.startsWith("/"),
    relative: (a, b) => { const A = path.resolve(a).split("/").filter(Boolean), Bp = path.resolve(b).split("/").filter(Boolean); let i = 0; while (i < A.length && A[i] === Bp[i]) i++; return [...A.slice(i).map(() => ".."), ...Bp.slice(i)].join("/"); },
    parse: (p) => ({ root: p.startsWith("/") ? "/" : "", dir: path.dirname(p), base: path.basename(p), ext: path.extname(p), name: path.basename(p, path.extname(p)) }),
  };
  path.posix = path;
  const querystring = {
    parse(s) {
      const o = Object.create(null);
      for (const [k, v] of new URLSearchParams(s)) o[k] = k in o ? [].concat(o[k], v) : v;
      return o;
    },
    stringify: (o) => Object.entries(o).flatMap(([k, v]) => [].concat(v).map((x) => `${encodeURIComponent(k)}=${encodeURIComponent(x)}`)).join("&"),
    escape: encodeURIComponent, unescape: decodeURIComponent,
  };
  const urlMod = {
    URL, URLSearchParams,
    parse(s, q) {
      const u = new URL(s, "http://localhost");
      const abs = /^[a-z]+:\/\//i.test(s);
      return { protocol: abs ? u.protocol : null, host: abs ? u.host : null, hostname: abs ? u.hostname : null, port: abs ? u.port || null : null,
        pathname: u.pathname, search: u.search || null, query: q ? querystring.parse(u.search.slice(1)) : u.search.slice(1) || null, path: u.pathname + u.search, href: s };
    },
  };

  // ----------------------------------------------------------- the box --
  function create(host) {
    const compile = host.compile;              // (source, filename) -> the value of the source
    const disks = new Map();                   // pid -> Map(name -> Buffer)
    const live = new Map();                    // pid -> the running program's context
    let active = null;                         // the program the last op ran, which owns stray rejections

    const diskOf = (pid) => { if (!disks.has(pid)) disks.set(pid, new Map()); return disks.get(pid); };
    const diskList = (pid) => [...diskOf(pid)].sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, b]) => ({ name, size: b.length, text: b.subarray(0, DISK_LIMIT).toString() }));

    function unload(pid) {
      const c = live.get(pid);
      if (!c) return;
      c.dead = true;
      for (const s of c.servers.values()) s.listening = false;
      c.servers.clear();
      for (const t of c.timers) { clearTimeout(t); clearInterval(t); }
      c.timers.clear();
      live.delete(pid);
    }

    function newContext(pid, files) {
      const c = { pid, files, out: [], servers: new Map(), timers: new Set(), modules: new Map(), dead: false, crash: null, onCrash: [] };
      const write = (s) => { if (!c.dead) c.out.push(s); };
      // An exception that reaches the top kills the program, as it does in Node.
      c.die = (err) => {
        if (c.dead) return;
        c.crash = err;
        write(`\n${err && err.name ? err.name : "Error"}: ${err && err.message !== undefined ? err.message : err}\n`);
        write("💥 the program crashed: an error nobody caught reached the top, so Node exited.\n");
        const waiting = c.onCrash.splice(0);
        unload(pid);
        c.dead = true;
        waiting.forEach((f) => f(err));
      };
      c.guard = (fn) => { try { return fn(); } catch (e) { c.die(e); } };

      const console_ = {};
      for (const k of ["log", "info", "debug", "error", "warn", "trace"]) console_[k] = (...a) => write(format(...a) + "\n");
      console_.dir = (o) => write(inspect(o) + "\n");
      console_.table = (rows) => write(inspect(rows) + "\n");
      const counts = {}, times = {};
      console_.count = (l = "default") => write(`${l}: ${(counts[l] = (counts[l] || 0) + 1)}\n`);
      console_.time = (l = "default") => { times[l] = Date.now(); };
      console_.timeEnd = (l = "default") => write(`${l}: ${(Date.now() - times[l]).toFixed(3)}ms\n`);
      console_.assert = (ok, ...a) => { if (!ok) write("Assertion failed" + (a.length ? ": " + format(...a) : "") + "\n"); };
      console_.group = console_.groupEnd = () => {};

      // timers: tracked so a restart stops them, guarded so a throw inside one crashes the program
      const handle = (id, kind) => ({ id, kind, ref() { return this; }, unref() { return this; }, hasRef: () => true, refresh() { return this; }, [Symbol.toPrimitive]: () => id });
      const timerId = (t) => (t && typeof t === "object" ? t.id : t);
      const T = {
        setTimeout: (fn, ms, ...a) => {
          if (c.dead) return handle(0);
          const id = setTimeout(() => { c.timers.delete(id); if (!c.dead) c.guard(() => fn(...a)); }, ms);
          c.timers.add(id);
          return handle(id, "t");
        },
        setInterval: (fn, ms, ...a) => {
          if (c.dead) return handle(0);
          const id = setInterval(() => { if (!c.dead) c.guard(() => fn(...a)); }, Math.max(1, ms || 0));
          c.timers.add(id);
          return handle(id, "i");
        },
        clearTimeout: (t) => { const id = timerId(t); clearTimeout(id); c.timers.delete(id); },
        clearInterval: (t) => { const id = timerId(t); clearInterval(id); c.timers.delete(id); },
      };
      T.setImmediate = (fn, ...a) => T.setTimeout(fn, 0, ...a);
      T.clearImmediate = T.clearTimeout;

      const process_ = new EventEmitter();
      Object.assign(process_, {
        env: { NODE_ENV: "development" }, argv: ["/usr/local/bin/node", "/app/" + "main.js"], platform: "linux", pid: 4242,
        version: "v22.11.0", versions: { node: "22.11.0" }, exitCode: undefined,
        cwd: () => "/app", uptime: () => (Date.now() - c.started) / 1000,
        nextTick: (fn, ...a) => queueMicrotask(() => { if (!c.dead) c.guard(() => fn(...a)); }),
        hrtime: Object.assign((prev) => { const ns = Math.round(performance.now() * 1e6); const t = [Math.floor(ns / 1e9), ns % 1e9]; return prev ? [t[0] - prev[0], t[1] - prev[1]] : t; }, { bigint: () => BigInt(Math.round(performance.now() * 1e6)) }),
        memoryUsage: () => ({ rss: 40e6, heapTotal: 20e6, heapUsed: 12e6, external: 1e6 }),
        exit: (code = 0) => { write(`(the program exited with code ${code})\n`); const w = c.onCrash.splice(0); unload(pid); c.dead = true; w.forEach((f) => f(null)); throw Object.assign(new Error("process.exit"), { __exit: true }); },
        stdout: { write: (s) => { write(String(s)); return true; }, isTTY: false },
        stderr: { write: (s) => { write(String(s)); return true; }, isTTY: false },
      });
      c.started = Date.now();

      // the disk
      const disk = diskOf(pid);
      const fname = (p) => {
        let s = String(p instanceof URL ? p.pathname : p);
        if (s.startsWith("/app/")) s = s.slice(5);
        else if (s.startsWith("/")) throw nodeErr(Error, "EACCES", `EACCES: permission denied, open '${s}' (the program can only use its own folder)`, { errno: -13, syscall: "open", path: s });
        return normalize(s).replace(/^\.\//, "");
      };
      const notFound = (p, sys = "open") => nodeErr(Error, "ENOENT", `ENOENT: no such file or directory, ${sys} '${p}'`, { errno: -2, syscall: sys, path: String(p) });
      const opt = (o) => (typeof o === "string" ? o : o && o.encoding);
      const fsSync = {
        readFileSync(p, o) { const n = fname(p); if (!disk.has(n)) throw notFound(p); const b = Buffer.from(disk.get(n)); return opt(o) ? b.toString(opt(o)) : b; },
        writeFileSync(p, d, o) { disk.set(fname(p), toBuf(typeof d === "string" || d instanceof Uint8Array ? d : String(d), opt(o))); },
        appendFileSync(p, d, o) { const n = fname(p), add = toBuf(typeof d === "string" || d instanceof Uint8Array ? d : String(d), opt(o)); disk.set(n, disk.has(n) ? Buffer.concat([disk.get(n), add]) : add); },
        existsSync: (p) => { try { const n = fname(p); return n === "." || disk.has(n) || [...disk.keys()].some((k) => k.startsWith(n + "/")); } catch (e) { return false; } },
        unlinkSync(p) { const n = fname(p); if (!disk.has(n)) throw notFound(p, "unlink"); disk.delete(n); },
        rmSync(p, o) { const n = fname(p); if (disk.has(n)) disk.delete(n); else if (o && o.recursive) { for (const k of [...disk.keys()]) if (k.startsWith(n + "/")) disk.delete(k); } else if (!(o && o.force)) throw notFound(p, "rm"); },
        renameSync(a, b) { const n = fname(a); if (!disk.has(n)) throw notFound(a, "rename"); disk.set(fname(b), disk.get(n)); disk.delete(n); },
        mkdirSync() {},
        readdirSync(p = ".") { const n = fname(p), pre = n === "." ? "" : n + "/"; return [...new Set([...disk.keys()].filter((k) => k.startsWith(pre)).map((k) => k.slice(pre.length).split("/")[0]))].sort(); },
        statSync(p) { const n = fname(p); if (disk.has(n)) return { size: disk.get(n).length, isFile: () => true, isDirectory: () => false, mtimeMs: Date.now(), mtime: new Date() }; if (fsSync.existsSync(p)) return { size: 0, isFile: () => false, isDirectory: () => true, mtimeMs: Date.now(), mtime: new Date() }; throw notFound(p, "stat"); },
        copyFileSync(a, b) { fsSync.writeFileSync(b, fsSync.readFileSync(a)); },
      };
      const promises = {}, fs = { ...fsSync, promises, constants: { F_OK: 0, R_OK: 4, W_OK: 2 } };
      for (const [k, f] of Object.entries(fsSync)) {
        const name = k.replace(/Sync$/, "");
        promises[name] = (...a) => new Promise((res, rej) => queueMicrotask(() => { try { res(f(...a)); } catch (e) { rej(e); } }));
        fs[name] = (...a) => {
          const cb = typeof a[a.length - 1] === "function" ? a.pop() : null;
          queueMicrotask(() => { let r, e = null; try { r = f(...a); } catch (x) { e = x; } if (cb) c.guard(() => cb(e, r)); });
        };
      }
      fs.exists = (p, cb) => queueMicrotask(() => cb(fsSync.existsSync(p)));
      promises.access = (p) => (fsSync.existsSync(p) ? Promise.resolve() : Promise.reject(notFound(p, "access")));

      const http = makeHttp(c);
      const builtins = {
        events: EventEmitter, http, https: http, fs, "fs/promises": promises, path, url: urlMod, querystring, util, crypto: cryptoMod,
        buffer: { Buffer }, assert: makeAssert(), os: { EOL: "\n", platform: () => "linux", cpus: () => [{}, {}, {}, {}], hostname: () => "workbench", tmpdir: () => "/tmp" },
        timers: T, "timers/promises": { setTimeout: (ms, v) => new Promise((r) => T.setTimeout(() => r(v), ms)) },
        process: process_, string_decoder: { StringDecoder: class { constructor(e) { this.e = e || "utf8"; } write(b) { return Buffer.from(b).toString(this.e); } end() { return ""; } } },
        stream: { EventEmitter, Readable: EventEmitter, Writable: EventEmitter },
      };
      const globalsList = { console: console_, process: process_, Buffer, fetch: http._fetch, ...T };

      function resolve(spec, from) {
        const bare = spec.replace(/^node:/, "");
        if (!/^\.{0,2}\//.test(spec)) {
          if (bare in builtins) return { builtin: bare };
          throw nodeErr(Error, "MODULE_NOT_FOUND", `Cannot find module '${spec}'\nRequire stack:\n- /app/${from}\n(There's no npm here: every module this project uses is one you write.)`);
        }
        let p = spec.startsWith("/") ? fname(spec) : normalize(path.dirname(from) + "/" + spec).replace(/^\.\//, "");
        for (const cand of [p, p + ".js", p + ".json", p + "/index.js"]) if (cand in c.files) return { file: cand };
        throw nodeErr(Error, "MODULE_NOT_FOUND", `Cannot find module '${spec}'\nRequire stack:\n- /app/${from}`);
      }
      const ARGS = ["exports", "require", "module", "__filename", "__dirname", ...Object.keys(globalsList)];
      function load(file) {
        if (c.modules.has(file)) return c.modules.get(file).exports;
        const module = { id: file, filename: "/app/" + file, exports: {}, loaded: false, children: [] };
        c.modules.set(file, module);
        try {
          if (file.endsWith(".json")) {
            module.exports = JSON.parse(c.files[file]);
          } else {
            const fn = compile(`(function (${ARGS.join(", ")}) {${c.files[file]}\n})`, PREFIX + file);
            const req = makeRequire(file);
            fn.call(module.exports, module.exports, req, module, "/app/" + file, "/app", ...Object.values(globalsList));
          }
        } catch (e) {
          c.modules.delete(file);
          if (e && !e.__file) e.__file = file;
          throw e;
        }
        module.loaded = true;
        return module.exports;
      }
      function makeRequire(from) {
        const req = (spec) => { const r = resolve(spec, from); return r.builtin ? builtins[r.builtin] : load(r.file); };
        req.resolve = (spec) => { const r = resolve(spec, from); return r.builtin || "/app/" + r.file; };
        req.cache = {};
        return req;
      }
      c.require = makeRequire("main.js");
      c.load = load;
      c.fetch = http._fetch;
      c.T = T;
      c.write = write;
      return c;
    }

    // ------------------------------------------------------------- http --
    function makeHttp(c) {
      class IncomingMessage extends EventEmitter {
        constructor({ method, url, headers, body }) {
          super();
          this.method = method; this.url = url; this.httpVersion = "1.1"; this.httpVersionMajor = 1; this.httpVersionMinor = 1;
          this.headers = {}; this.rawHeaders = [];
          for (const [k, v] of headers) {
            const n = k.toLowerCase();
            this.rawHeaders.push(k, v);
            if (n === "set-cookie") (this.headers[n] = this.headers[n] || []).push(v);
            else this.headers[n] = n in this.headers ? (n === "cookie" ? this.headers[n] + "; " + v : this.headers[n] + ", " + v) : v;
          }
          this.socket = this.connection = { remoteAddress: "127.0.0.1", remotePort: 51000 + Math.floor(Math.random() * 1000), encrypted: false, destroy() {} };
          this.complete = false; this.readable = true; this.aborted = false;
          this._body = body; this._enc = null; this._flowing = false;
          this._listening = (n) => { if (n === "data" || n === "readable") this._flow(); };
        }
        setEncoding(e) { this._enc = e; return this; }
        resume() { this._flow(); return this; }
        pause() { return this; }
        pipe(dest) { this.on("data", (d) => dest.write(d)); this.on("end", () => dest.end && dest.end()); return dest; }
        destroy() { this.aborted = true; return this; }
        _flow() {
          if (this._flowing) return;
          this._flowing = true;
          // data arrives after the handler that asked for it has returned, as it does from a socket
          T(() => {
            if (this._body.length) this.emit("data", this._enc ? this._body.toString(this._enc) : this._body);
            this.complete = true; this.readable = false;
            this.emit("end");
            this.emit("close");
          });
        }
        async *[Symbol.asyncIterator]() {
          this._flowing = true;
          await null;
          if (this._body.length) yield this._enc ? this._body.toString(this._enc) : this._body;
          this.complete = true; this.readable = false;
          this.emit("end");
        }
      }
      const T = (fn) => c.T.setTimeout(fn, 0);
      const sentErr = () => nodeErr(Error, "ERR_HTTP_HEADERS_SENT", "Cannot set headers after they are sent to the client");
      class ServerResponse extends EventEmitter {
        constructor(req) {
          super();
          this.req = req; this.statusCode = 200; this.statusMessage = undefined;
          this.headersSent = false; this.finished = false; this.writableEnded = false; this.writableFinished = false;
          this.sendDate = true; this._h = new Map(); this._chunks = []; this._done = null; this.locals = {};
        }
        setHeader(n, v) { if (this.headersSent) throw sentErr(); if (v === undefined) throw nodeErr(TypeError, "ERR_HTTP_INVALID_HEADER_VALUE", `Invalid value "undefined" for header "${n}"`); this._h.set(String(n).toLowerCase(), [String(n), v]); return this; }
        getHeader(n) { const e = this._h.get(String(n).toLowerCase()); return e ? e[1] : undefined; }
        getHeaders() { const o = Object.create(null); for (const [k, [, v]] of this._h) o[k] = v; return o; }
        getHeaderNames() { return [...this._h.keys()]; }
        hasHeader(n) { return this._h.has(String(n).toLowerCase()); }
        removeHeader(n) { if (this.headersSent) throw sentErr(); this._h.delete(String(n).toLowerCase()); }
        appendHeader(n, v) { const old = this.getHeader(n); return this.setHeader(n, old === undefined ? v : [].concat(old, v)); }
        writeHead(code, msg, headers) {
          if (this.headersSent) throw sentErr();
          if (typeof msg !== "string") { headers = msg; msg = undefined; }
          code = Number(code);
          if (!(code >= 100 && code <= 999)) throw nodeErr(RangeError, "ERR_HTTP_INVALID_STATUS_CODE", `Invalid status code: ${code}`);
          this.statusCode = code;
          if (msg) this.statusMessage = msg;
          if (Array.isArray(headers)) for (let i = 0; i < headers.length; i += 2) this.setHeader(headers[i], headers[i + 1]);
          else if (headers) for (const [k, v] of Object.entries(headers)) this.setHeader(k, v);
          this.headersSent = true;
          return this;
        }
        flushHeaders() { this.headersSent = true; }
        write(chunk, encoding, cb) {
          if (this.writableEnded) { const e = nodeErr(Error, "ERR_STREAM_WRITE_AFTER_END", "write after end"); T(() => this.emit("error", e)); return false; }
          if (!(this.statusCode >= 100 && this.statusCode <= 999)) throw nodeErr(RangeError, "ERR_HTTP_INVALID_STATUS_CODE", `Invalid status code: ${this.statusCode}`);
          this._chunks.push(toBuf(chunk, typeof encoding === "string" ? encoding : undefined));
          this.headersSent = true;
          if (typeof cb === "function") T(cb);
          return true;
        }
        end(chunk, encoding, cb) {
          if (typeof chunk === "function") { cb = chunk; chunk = null; }
          if (typeof encoding === "function") { cb = encoding; encoding = undefined; }
          if (this.writableEnded) return this;
          if (chunk != null) this.write(chunk, encoding);
          if (!(this.statusCode >= 100 && this.statusCode <= 999)) throw nodeErr(RangeError, "ERR_HTTP_INVALID_STATUS_CODE", `Invalid status code: ${this.statusCode}`);
          this.headersSent = true; this.writableEnded = this.finished = true;
          const done = this._done;
          T(() => { this.writableFinished = true; this.emit("finish"); this.emit("close"); if (done) done(); });
          return this;
        }
        _body() { return Buffer.concat(this._chunks); }
      }
      class Server extends EventEmitter {
        constructor(opts, listener) {
          super();
          if (typeof opts === "function") listener = opts;
          if (listener) this.on("request", listener);
          this.listening = false;
        }
        listen(...a) {
          const cb = typeof a[a.length - 1] === "function" ? a.pop() : null;
          let port = a[0] && typeof a[0] === "object" ? a[0].port : a[0];
          port = port === undefined || port === null || port === "" ? 0 : Number(port);
          if (!port) port = 30000 + c.servers.size;
          if (c.servers.has(port)) {
            const e = nodeErr(Error, "EADDRINUSE", `listen EADDRINUSE: address already in use :::${port}`, { errno: -98, syscall: "listen", port });
            T(() => c.guard(() => this.emit("error", e)));
            return this;
          }
          this._port = port; this.listening = true;
          c.servers.set(port, this);
          T(() => { this.emit("listening"); if (cb) cb.call(this); });
          return this;
        }
        close(cb) {
          if (c.servers.get(this._port) === this) c.servers.delete(this._port);
          this.listening = false;
          T(() => { this.emit("close"); if (cb) cb(); });
          return this;
        }
        address() { return this.listening ? { address: "::", family: "IPv6", port: this._port } : null; }
        closeAllConnections() {}
        setTimeout() { return this; }
      }

      // fetch, but only to this program's own servers
      class Headers_ {
        constructor(init) {
          this._l = [];
          if (!init) return;
          if (init instanceof Headers_) this._l = init._l.map((x) => [...x]);
          else if (typeof init[Symbol.iterator] === "function" && typeof init !== "string") for (const [k, v] of init) this.append(k, v);
          else for (const [k, v] of Object.entries(init)) this.append(k, v);
        }
        append(k, v) { this._l.push([String(k).toLowerCase(), String(v)]); }
        set(k, v) { this.delete(k); this.append(k, v); }
        delete(k) { k = String(k).toLowerCase(); this._l = this._l.filter(([n]) => n !== k); }
        get(k) { k = String(k).toLowerCase(); const v = this._l.filter(([n]) => n === k).map(([, x]) => x); return v.length ? v.join(k === "cookie" ? "; " : ", ") : null; }
        has(k) { return this.get(k) !== null; }
        getSetCookie() { return this._l.filter(([n]) => n === "set-cookie").map(([, v]) => v); }
        *entries() {
          const names = [...new Set(this._l.map(([n]) => n))].sort();
          for (const n of names) { if (n === "set-cookie") for (const v of this.getSetCookie()) yield [n, v]; else yield [n, this.get(n)]; }
        }
        keys() { return [...this.entries()].map(([k]) => k)[Symbol.iterator](); }
        values() { return [...this.entries()].map(([, v]) => v)[Symbol.iterator](); }
        forEach(f) { for (const [k, v] of this.entries()) f(v, k, this); }
        [Symbol.iterator]() { return this.entries(); }
      }
      class Response_ {
        constructor(status, statusText, headers, body, url) {
          this.status = status; this.statusText = statusText; this.ok = status >= 200 && status < 300;
          this.headers = headers; this.url = url; this.redirected = false; this.type = "basic"; this._b = body; this.bodyUsed = false;
        }
        _take() { if (this.bodyUsed) throw new TypeError("Body is unusable: Body has already been read"); this.bodyUsed = true; return this._b; }
        async text() { return dec.decode(this._take()); }
        async json() { return JSON.parse(dec.decode(this._take())); }
        async arrayBuffer() { const b = this._take(); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
        async bytes() { return new Uint8Array(this._take()); }
        clone() { return new Response_(this.status, this.statusText, new Headers_(this.headers), this._b, this.url); }
      }
      const refused = (port) => Object.assign(new TypeError("fetch failed"), { cause: nodeErr(Error, "ECONNREFUSED", `connect ECONNREFUSED 127.0.0.1:${port}`, { errno: -111, syscall: "connect", address: "127.0.0.1", port }) });
      async function fetch_(input, init = {}, hops = 0) {
        const u = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
        if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname)) throw Object.assign(new TypeError("fetch failed"), { cause: new Error(`getaddrinfo ENOTFOUND ${u.hostname} (this sandbox has no internet: only your own servers, on localhost)`) });
        const port = Number(u.port) || 80;
        await null;
        const srv = c.servers.get(port);
        if (c.dead || !srv) throw refused(port);
        const method = String(init.method || "GET").toUpperCase();
        const h = new Headers_(init.headers);
        let body = init.body;
        if (body != null && (method === "GET" || method === "HEAD")) throw new TypeError("Request with GET/HEAD method cannot have body.");
        if (body instanceof URLSearchParams) { if (!h.has("content-type")) h.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8"); body = String(body); }
        if (typeof body === "string" && !h.has("content-type")) h.set("content-type", "text/plain;charset=UTF-8");
        const bytes = body == null ? new Buffer(0) : toBuf(body);
        const wire = [["host", u.host], ["connection", "keep-alive"], ...h._l.filter(([n]) => n !== "host")];
        if (!h.has("accept")) wire.push(["accept", "*/*"]);
        if (!h.has("user-agent")) wire.push(["user-agent", "node"]);
        if (body != null) wire.push(["content-length", String(bytes.length)]);
        const req = new IncomingMessage({ method, url: u.pathname + u.search, headers: wire, body: bytes });
        const res = new ServerResponse(req);
        const signal = init.signal;
        const answer = await new Promise((resolve, reject) => {
          if (signal) {
            if (signal.aborted) return reject(signal.reason);
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          }
          c.onCrash.push(() => reject(Object.assign(new TypeError("fetch failed"), { cause: nodeErr(Error, "UND_ERR_SOCKET", "other side closed (the server crashed)") })));
          res._done = () => resolve(res);
          c.guard(() => srv.emit("request", req, res));
        });
        const headers = new Headers_();
        for (const [, [n, v]] of answer._h) for (const x of [].concat(v)) headers.append(n, String(x));
        let out = answer._body();
        const status = answer.statusCode;
        if (method === "HEAD" || status === 204 || status === 304) out = new Buffer(0);
        if (status >= 300 && status < 400 && headers.has("location") && (init.redirect || "follow") === "follow") {
          if (hops >= 20) throw Object.assign(new TypeError("fetch failed"), { cause: new Error("redirect count exceeded") });
          const next = new URL(headers.get("location"), u);
          const keep = status === 307 || status === 308;
          const r = await fetch_(next, { ...init, method: keep ? method : method === "HEAD" ? "HEAD" : "GET", body: keep ? init.body : undefined }, hops + 1);
          r.redirected = true;
          return r;
        }
        return new Response_(status, answer.statusMessage || STATUS[status] || "", headers, out, u.href);
      }
      return {
        createServer: (o, l) => new Server(o, l), Server, IncomingMessage, ServerResponse, STATUS_CODES: { ...STATUS }, METHODS: [...METHODS],
        Agent: class {}, globalAgent: {}, _fetch: fetch_,
        get: () => { throw new Error("http.get isn't in this sandbox: use fetch(url) instead"); },
        request: () => { throw new Error("http.request isn't in this sandbox: use fetch(url, { method, headers, body }) instead"); },
      };
    }

    function makeAssert() {
      const fail = (msg, def) => { throw nodeErr(Error, "ERR_ASSERTION", msg || def, { name: "AssertionError" }); };
      const a = (v, m) => { if (!v) fail(m, "The expression evaluated to a falsy value"); };
      Object.assign(a, {
        ok: a,
        equal: (x, y, m) => { if (x != y) fail(m, `${inspect(x, 0, 1)} == ${inspect(y, 0, 1)}`); },
        strictEqual: (x, y, m) => { if (!Object.is(x, y)) fail(m, `Expected values to be strictly equal:\n\n${inspect(x, 0, 1)} !== ${inspect(y, 0, 1)}`); },
        notStrictEqual: (x, y, m) => { if (Object.is(x, y)) fail(m, `Expected "actual" to be strictly unequal to: ${inspect(y, 0, 1)}`); },
        deepStrictEqual: (x, y, m) => { if (!deepEqual(x, y)) fail(m, `Expected values to be strictly deep-equal:\n${inspect(x, 0, 1)}\n${inspect(y, 0, 1)}`); },
        throws: (f, _e, m) => { try { f(); } catch (e) { return; } fail(m, "Missing expected exception."); },
        rejects: async (p, _e, m) => { try { await (typeof p === "function" ? p() : p); } catch (e) { return; } fail(m, "Missing expected rejection."); },
        fail: (m) => fail(m, "Failed"),
      });
      a.strict = a;
      return a;
    }

    // -------------------------------------------------------- errors --
    const FRAME = /(?:\(|@|\bat )wb\/([^\s:()]+):(\d+)(?::(\d+))?/;
    function frames(err) {
      const out = [];
      for (const line of String((err && err.stack) || "").split("\n")) { const m = FRAME.exec(line); if (m) out.push([m[1], +m[2]]); }
      return out;
    }
    function cleanStack(err) {
      return String(err.stack || err).split("\n").filter((l) => !/^\s+at /.test(l) || FRAME.test(l)).map((l) => l.replace(/\bwb\//g, "")).join("\n");
    }
    function describe(err, files, mainFile) {
      if (err && err.__exit) return { error: null, where: null };
      const head = err instanceof Error || (err && err.name) ? `${err.name}: ${err.message}` : `Uncaught ${inspect(err, 0, 1)}`;
      let fr = frames(err).filter(([f]) => f in files);
      // a request's error passes back through the client that sent it: the trace stops at the server's side
      const cut = fr.findIndex(([f]) => f === mainFile);
      if (cut > 0) fr = fr.slice(0, cut);
      if (err && err.name === "SyntaxError") fr = [];
      let where = fr.length ? fr[0] : null;
      if (!where && err && err.name === "SyntaxError" && err.__file) where = [err.__file, 0];
      // Node puts a SyntaxError's location at the top of the stack instead of in a frame
      if (err && err.name === "SyntaxError") { const m = /wb\/([^\s:()]+):(\d+)/.exec(String(err.stack)); if (m && m[1] in files) where = [m[1], +m[2]]; }
      const lines = fr.slice(0, 4).reverse().map(([f, n]) => `  ${f}, line ${n}: ${((files[f] || "").split("\n")[n - 1] || "").trim()}`);
      if (where && !lines.length) lines.push(`  ${where[0]}${where[1] ? `, line ${where[1]}` : ""}`);
      const extra = err && err.cause && err.cause.message ? `\n  cause: ${err.cause.message}` : "";
      return { error: head + extra + (lines.length ? "\n" + lines.join("\n") : ""), where };
    }

    const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
    const settle = async () => { for (let i = 0; i < 3; i++) await tick(0); };
    const takeOut = (c) => { const s = c.out.join(""); c.out.length = 0; return s; };

    // ------------------------------------------------------------- ops --
    async function project_load({ pid, files, main, wipe }) {
      unload(pid);
      if (wipe) diskOf(pid).clear();
      const c = newContext(pid, files);
      c.mainFile = main + ".js";
      live.set(pid, c);
      active = pid;
      let error = null, where = null;
      try {
        c.load(main + ".js");
      } catch (e) {
        ({ error, where } = describe(e, files, main + ".js"));
        unload(pid);
      }
      await settle();
      if (!error && c.crash) ({ error, where } = describe(c.crash, files, main + ".js"));
      return { stdout: takeOut(c), error, where, disk: diskList(pid), exited: !!(error || c.dead) };
    }

    async function project_call({ pid, line }) {
      const c = live.get(pid);
      if (!c) return { stdout: "", error: "The program isn't running. Press Run first.", where: null, disk: diskList(pid), exited: true };
      active = pid;
      const main = c.modules.get(c.mainFile);
      const handleFn = main && main.exports && main.exports.handle;
      if (typeof handleFn !== "function") return { stdout: takeOut(c), error: `${main ? main.id : "the main file"} has no handle(line) in module.exports yet`, where: null, disk: diskList(pid), exited: false };
      let error = null, where = null, reply;
      try {
        let timer;
        reply = await Promise.race([
          Promise.resolve().then(() => handleFn(line)),
          new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error(`no answer after ${CALL_LIMIT / 1000} s`), { name: "Timeout" })), CALL_LIMIT); }),
        ]).finally(() => clearTimeout(timer));
      } catch (e) {
        if (!c.crash) ({ error, where } = describe(e, c.files, c.mainFile));
      }
      if (reply !== undefined && reply !== null) c.out.push(String(reply) + "\n");
      await settle();
      if (c.crash) ({ error, where } = describe(c.crash, c.files, c.mainFile));
      return { stdout: takeOut(c), error, where, disk: diskList(pid), exited: c.dead };
    }

    function project_tear({ pid, name, keep }) {
      const d = diskOf(pid);
      if (d.has(name)) {
        let s = d.get(name).toString().replace(/\n+$/, "");
        const cut = s.lastIndexOf("\n") + 1, last = s.slice(cut);
        d.set(name, Buffer.from(s.slice(0, cut) + last.slice(0, Math.max(1, Math.floor(last.length * keep)))));
      }
      unload(pid);
      return { disk: diskList(pid) };
    }

    // A ticket's tests are JavaScript: top-level `assert(cond, "message")` lines, with helpers to talk to the
    // program. Each ticket starts it fresh on a clean disk; the first failing check stops the run.
    const TEST_ARGS = ["assert", "run", "restart", "disk", "tear", "fetch", "request", "require", "wait", "port", "source"];
    async function project_check({ pid, files, main, tickets, port = 3000 }) {
      const tid = pid + ":check";
      const results = [];
      for (const [title, tests] of tickets) {
        const loaded = await project_load({ pid: tid, files, main, wipe: true });
        const src = String(tests || "").split("\n");
        const total = src.filter((l) => /^assert\b/.test(l)).length;
        const res = { title, total, ok: 0 };
        results.push(res);
        if (loaded.error) { Object.assign(res, { failed: "(starting the program)", message: loaded.error, where: loaded.where }); break; }
        let fn;
        try { fn = compile(`(async function (${TEST_ARGS.join(", ")}) {${tests}\n})`, PREFIX + "tests.js"); }
        catch (e) { unload(tid); return { passed: false, tickets: results, error: `Broken tests in '${title}': ${e.message}` }; }
        const helpers = testHelpers(tid, files, main, port, res);
        try {
          let timer;
          await Promise.race([fn(...TEST_ARGS.map((k) => helpers[k])), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("the checks took longer than 8 s: is a request never answered?")), 8000); })]).finally(() => clearTimeout(timer));
        } catch (e) {
          const at = (frames(e).find(([f]) => f === "tests.js") || [null, 0])[1];
          const failed = (src[at - 1] || "").trim() || "(a check)";
          if (e && e.__assert) Object.assign(res, { failed, message: e.message });
          else { const c = live.get(tid); const d = describe((c && c.crash) || e, files, main + ".js"); Object.assign(res, { failed, message: d.error, where: d.where }); }
        }
        unload(tid);
        if (res.failed) break;
      }
      unload(tid);
      const passed = results.length === tickets.length && results.every((r) => !r.failed);
      return { passed, tickets: results, error: null };
    }

    function testHelpers(tid, files, main, port, res) {
      const ctx = () => live.get(tid);
      const assert = (cond, message) => { if (!cond) throw Object.assign(new Error(message || "This check did not hold."), { __assert: true }); res.ok++; };
      return {
        assert, port,
        run: async (line) => {
          const c = ctx();
          if (c) c.out.length = 0;   // only what this line prints
          const r = await project_call({ pid: tid, line });
          if (r.error) throw Object.assign(new Error(r.error), { __from: "run" });
          return r.stdout.replace(/\n$/, "");
        },
        restart: async () => { const r = await project_load({ pid: tid, files, main }); if (r.error) throw new Error(r.error); },
        disk: (name) => { const d = diskOf(tid); return d.has(name) ? d.get(name).toString() : null; },
        tear: async (name, keep = 0.5) => { project_tear({ pid: tid, name, keep }); const r = await project_load({ pid: tid, files, main }); if (r.error) throw new Error(r.error); },
        // fetch from the program's own world, so tests see exactly what a client sees
        fetch: (url, init) => { const c = ctx(); if (!c) throw new Error("the program isn't running (it crashed?)"); return c.fetch(url, init); },
        // request("POST /notes", {text: "hi"}, {headers, port}) -> {status, headers, text, json, type}
        request: async (line, body, opts = {}) => {
          const c = ctx();
          if (!c) throw new Error("the program isn't running: it crashed on an earlier request");
          const at = opts.port || port;
          const [method, p] = line.trim().split(/\s+/);
          const headers = { ...(opts.headers || {}) };
          let payload;
          if (body !== undefined) {
            if (typeof body === "string") payload = body;
            else { payload = JSON.stringify(body); if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json"; }
          }
          let r;
          try {
            r = await c.fetch(`http://localhost:${at}${p}`, { method, headers, body: payload, redirect: "manual", signal: AbortSignal.timeout(2000) });
          } catch (e) {
            if (e && e.name === "TimeoutError") throw new Error(`${method} ${p} got no response in 2 s: a handler never ended it (res.end, res.send or res.json), or never called next()`);
            throw e;
          }
          const text = await r.text();
          let json;
          try { json = JSON.parse(text); } catch (e) { json = undefined; }
          const hs = {};
          for (const [k, v] of r.headers) hs[k] = k in hs ? [].concat(hs[k], v) : v;
          return { status: r.status, headers: hs, text, json, type: (r.headers.get("content-type") || "").split(";")[0] };
        },
        require: (spec) => { const c = ctx(); return c.require(spec.startsWith(".") ? spec : "./" + spec); },
        wait: (ms) => tick(ms),
        source: (name) => files[name] || "",
      };
    }

    async function project_session({ pid, files, main, transcript, prompt }) {
      await project_load({ pid, files, main, wipe: true });
      let cmd = null, want = [];
      const flush = async () => {
        if (cmd === null) return null;
        let got;
        if (cmd === "!restart") { await project_load({ pid, files, main }); got = ""; }
        else {
          const r = await project_call({ pid, line: cmd });
          if (r.error && !r.exited) return `${prompt}${cmd} raised ${r.error}`;
          got = (r.stdout + (r.error && r.exited ? "" : "")).replace(/\n+$/, "");
        }
        const w = want.join("\n").replace(/\n+$/, "");
        if (got !== w) return `${prompt}${cmd}\n  expected: ${JSON.stringify(w)}\n  got:      ${JSON.stringify(got)}`;
        return null;
      };
      for (const line of transcript.split("\n")) {
        if (line.startsWith(prompt) || line === "!restart") {
          const bad = await flush();
          if (bad) { unload(pid); return bad; }
          cmd = line === "!restart" ? "!restart" : line.slice(prompt.length);
          want = [];
        } else want.push(line);
      }
      const bad = await flush();
      unload(pid);
      return bad;
    }

    const OPS = { project_load, project_call, project_tear, project_check, project_session };
    async function handle(req) {
      const op = OPS[req.op];
      if (!op) return { error: `unknown op ${req.op}` };
      return op(req);
    }
    // The host reports promise rejections nobody handled; in Node 15+ one of those ends the program.
    function unhandled(reason) {
      const c = live.get(active);
      if (c && !c.dead) c.die(reason);
    }
    return { handle, unhandled, ops: OPS, Buffer, sha256, inspect, format };
  }

  const api = { create, Buffer, STATUS };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WBNode = api;
})(typeof self !== "undefined" ? self : this);
