// Scans the src tree for `t("foo.bar")` and `t('foo.bar')` calls and reports
// any keys that aren't present in messages/en.json. Run with `node scripts/find-missing-i18n.mjs`.
import fs from "node:fs";
import path from "node:path";

const en = JSON.parse(fs.readFileSync("messages/en.json", "utf8"));

function flatten(obj, prefix = "") {
  const keys = new Set();
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? prefix + "." + k : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const x of flatten(v, full)) keys.add(x);
    } else {
      keys.add(full);
    }
  }
  return keys;
}
const enKeys = flatten(en);

function walk(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

const files = walk("src");
const re = /\bt\(\s*["'`]([a-zA-Z0-9_.]+)["'`]/g;
const referenced = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  let m;
  while ((m = re.exec(src))) referenced.add(m[1]);
}

const missing = [...referenced].filter((k) => !enKeys.has(k)).sort();
console.log("Referenced keys:", referenced.size);
console.log("Missing in en.json:", missing.length);
for (const k of missing) console.log("  -", k);
process.exit(missing.length ? 1 : 0);
