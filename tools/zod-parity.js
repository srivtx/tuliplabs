// Runs the same cases on real Zod 4 and on the sandbox's zod (learn/wb-node.js), and compares them line by
// line: every issue's fields, in order, and every message and error shape.
//   ZOD=/path/to/node_modules/zod node tools/zod-parity.js
const path = require("path");
if (!process.env.ZOD) { console.error("Set ZOD to a real zod package: npm install zod@4 somewhere, then ZOD=<that>/node_modules/zod"); process.exit(2); }
const real = require(path.resolve(process.env.ZOD));
const box = require("../learn/wb-node.js").zod;
const a = cases(real), b = cases(box);
let bad = 0;
a.forEach((line, n) => { if (line !== b[n]) { bad++; console.log(`- real: ${line}\n+ box:  ${b[n]}\n`); } });
console.log(bad ? `${bad} of ${a.length} differ` : `${a.length} of ${a.length} identical (zod ${require(path.join(path.resolve(process.env.ZOD), "package.json")).version})`);
process.exit(bad ? 1 : 0);

function cases(z) {
const out = [];
const show = (label, schema, value) => {
  const r = schema.safeParse(value);
  out.push(label + " " + JSON.stringify(r.success ? { ok: r.data } : { issues: r.error.issues }));
};
const S = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(40).trim(),
  age: z.number().int().min(13).optional(),
  plan: z.enum(["free", "team", "enterprise"]).default("free"),
  tags: z.array(z.string()).max(3).optional(),
});
show("ok", S, { email: "a@b.co", name: "  Ida  ", age: 30 });
show("missing", S, {});
show("types", S, { email: 5, name: 7, age: "x", plan: "gold", tags: "x" });
show("small", S, { email: "nope", name: "I", age: 12.5, tags: ["a", "b", "c", "d"] });
show("big", S, { email: "a@b.co", name: "x".repeat(41) });
show("extra", S, { email: "a@b.co", name: "Ida", admin: true });
show("strict", S.strict(), { email: "a@b.co", name: "Ida", admin: true });
show("notobj", S, "hi");
show("null", S, null);
show("arr", S, []);
show("nested", z.object({ items: z.array(z.object({ sku: z.string(), qty: z.number().int().positive() })).min(1) }), { items: [{ sku: "A", qty: 0 }, { qty: 2 }] });
show("emptyarr", z.object({ items: z.array(z.string()).min(1) }), { items: [] });
show("coerce", z.object({ page: z.coerce.number().int().min(1) }), { page: "3" });
show("coerce-bad", z.object({ page: z.coerce.number().int().min(1) }), { page: "abc" });
show("coerce-0", z.object({ page: z.coerce.number().int().min(1) }), { page: "0" });
show("bool", z.boolean(), "yes");
show("nan", z.number(), NaN);
show("inf", z.number(), Infinity);
show("lit", z.literal("yes"), "no");
show("nullable", z.string().nullable(), null);
show("union", z.union([z.string(), z.number()]), true);
show("url", z.string().url(), "nope");
show("url-ok", z.string().url(), "https://x.io/a");
show("uuid", z.string().uuid(), "x");
show("regex", z.string().regex(/^[a-z]+$/), "AB");
show("len", z.string().length(4), "abc");
show("nonempty", z.string().nonempty(), "");
show("min-msg", z.string().min(8, "Use at least 8 characters"), "abc");
show("min-msg2", z.string().min(8, { message: "Too short" }), "abc");
show("refine", z.string().refine((s) => s.includes("@"), "Needs an @"), "abc");
show("refine-path", z.object({ a: z.string(), b: z.string() }).refine((o) => o.a === o.b, { message: "Must match", path: ["b"] }), { a: "x", b: "y" });
show("transform", z.string().transform((s) => s.length), "abcd");
show("pos", z.number().positive(), 0);
show("nonneg", z.number().nonnegative(), -1);
show("max", z.number().max(10), 11);
show("lt", z.number().lt(10), 10);
show("gt", z.number().gt(10), 10);
show("int-big", z.number().int(), 1e300);
show("partial", S.partial(), { name: "I" });
show("pick", S.pick({ email: true }), {});
show("omit", S.omit({ email: true, name: true }), { age: 20 });
show("extend", S.extend({ team: z.string() }), { email: "a@b.co", name: "Ida" });
show("record", z.record(z.string(), z.number()), { a: 1, b: "x" });
show("date", z.string().datetime(), "2026-11-07");
show("date-ok", z.string().datetime(), "2026-11-07T10:00:00Z");
show("lower", z.string().toLowerCase(), "ABC");
show("email-upper", z.string().email(), "IDA@Example.COM");
show("default-fn", z.object({ n: z.number().default(() => 5) }), {});
show("opt-undef", z.object({ n: z.number().optional() }), { n: undefined });
show("opt-null", z.object({ n: z.number().optional() }), { n: null });
show("passthrough", S.passthrough(), { email: "a@b.co", name: "Ida", x: 1 });
show("tuple-ish", z.array(z.number()), [1, "2", 3]);
show("enum-num", z.enum(["a", "b"]), 1);
show("str-undef", z.string(), undefined);
show("obj-undef", z.object({}), undefined);
// errors as a client would get them
const bad = S.safeParse({ email: "x", name: 3, tags: [1] });
out.push("flatten " + JSON.stringify(bad.error.flatten()));
out.push("flattenError " + JSON.stringify(z.flattenError(bad.error)));
out.push("treeify " + JSON.stringify(z.treeifyError(bad.error)));
out.push("pretty " + JSON.stringify(z.prettifyError(bad.error)));
out.push("message " + JSON.stringify(bad.error.message));
out.push("name " + bad.error.name + " " + (bad.error instanceof z.ZodError) + " " + (bad.error instanceof Error));
try { S.parse({}); } catch (e) { out.push("parse-throws " + e.name + " " + e.issues.length); }
out.push("parse-ok " + JSON.stringify(S.parse({ email: "a@b.co", name: "Ida" })));
out.push("infer-shape " + JSON.stringify(Object.keys(S.shape)));
out.push("enum-options " + JSON.stringify(z.enum(["x", "y"]).options));
out.push("enum-enum " + JSON.stringify(z.enum(["x", "y"]).enum));
return out;
}
