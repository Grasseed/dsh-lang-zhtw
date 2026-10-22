// extract-dicts4.mjs — register()-call-site driven dictionary extractor (v4).
// Rationale: v3 looked for `const zh…` literals; that missed dicts stored under
// other names (guideZh, zh$1 referenced via {zh: …} wrappers) and mis-guessed
// namespace ids. v4 works the other way round: it finds every
// `….register(<nsArg>, <dictArg>…)` call in compiled bundles and resolves both
// arguments from local consts, so any variable naming works.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] ?? '/tmp/dsh-asar-x/dsh';
const OUT = process.argv[3] ?? '/tmp/zh-dicts-merged.json';

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' && dir !== ROOT) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    // Dictionaries live in readable compiled package libs; skip minified dist bundles.
    else if (p.includes('/node_modules/@deepseek-ai/') && p.includes('/lib/') && p.endsWith('.js')) acc.push(p);
  }
  return acc;
}

// Scan a balanced {...} or [...] literal starting at index i (must be the opener).
function scanLiteral(src, i) {
  const open = src[i];
  if (open !== '{' && open !== '[') return null;
  const close = open === '{' ? '}' : ']';
  let depth = 0, quote = null, esc = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (quote) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '/' && src[j + 1] === '/') { j = src.indexOf('\n', j); if (j < 0) break; continue; }
    if (c === '/' && src[j + 1] === '*') { j = src.indexOf('*/', j); if (j < 0) break; j++; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return null;
}

// Split top-level arguments of a call whose '(' is at index i; returns [argSrcs, endIdx].
const SCAN_CAP = 400_000; // chars; unbalanced parse -> give up rather than scan a huge file per site
function scanArgs(src, i) {
  const args = [];
  let depth = 0, quote = null, esc = false, start = i + 1;
  for (let j = i, steps = 0; j < src.length && steps++ < SCAN_CAP; j++) {
    const c = src[j];
    if (quote) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) {
      depth--;
      if (!depth) { args.push(src.slice(start, j)); return [args, j]; }
    } else if (c === ',' && depth === 1) { args.push(src.slice(start, j)); start = j + 1; }
  }
  return [args, -1];
}

function evalLiteral(text) {
  // Object/array literal from a build artifact: plain data is the common case.
  try { return new Function('return (' + text + ');')(); } catch { return null; }
}

// Fallback for dict literals containing runtime fragments (templates, spreads):
// harvest string-literal pairs whose value has CJK, which is what we need anyway.
function pairsFromText(text) {
  const out = {};
  for (const m of text.matchAll(/(?:"([^"\\\n]+)"|([A-Za-z_$][\w$]*))\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
    const key = m[1] ?? m[2];
    let val;
    try { val = JSON.parse('"' + m[3] + '"'); } catch { continue; }
    if (key && /[一-鿿]/.test(val)) out[key] = val;
  }
  return Object.keys(out).length ? out : null;
}

const dicts = {};
let files = 0, registers = 0, resolved = 0;
const misses = [];

for (const f of walk(ROOT)) {
  const src = fs.readFileSync(f, 'utf8');
  // Any registered zh dictionary necessarily mentions `zh` somewhere; runtime cores don't.
  if (!src.includes('.register(') || !src.includes('zh')) continue;
  files++;
  console.error('scanning', path.relative(ROOT, f));
  // Collect local const bindings usable for resolving arguments.
  const objConst = new Map();   // name -> object/array literal source
  const strConst = new Map();   // name -> string value
  for (const m of src.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*/g)) {
    let at = m.index + m[0].length;
    while (/\s/.test(src[at] ?? 'x')) at++;
    while (src.startsWith('/*', at)) { // skip a comment between = and the literal
      const end = src.indexOf('*/', at + 2);
      if (end < 0) break;
      at = end + 2;
      while (/\s/.test(src[at])) at++;
    }
    const opener = src[at];
    if (opener !== '{' && opener !== '[' && opener !== '"' && opener !== "'") continue;
    if (opener === '{' || opener === '[') {
      const lit = scanLiteral(src, at);
      if (lit) objConst.set(m[1], [...(objConst.get(m[1]) ?? []), [at, lit]]);
    } else {
      const end = src.indexOf(opener, at + 1);
      if (end > 0) strConst.set(m[1], [...(strConst.get(m[1]) ?? []), [at, src.slice(at + 1, end)]]);
    }
  }
  // A bundle may declare the same const name twice; bind each register site
  // to the nearest preceding declaration.
  const pick = (map, name, before) => {
    const arr = map.get(name);
    if (!arr) return null;
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i][0] < before) return arr[i][1];
    return arr[arr.length - 1][1];
  };
  const pickLiteral = (name, before) => pick(objConst, name, before);
  const pickStr = (name, before) => pick(strConst, name, before);
  for (const m of src.matchAll(/\.register\(\s*/g)) {
    const openParen = src.indexOf('(', m.index);
    const [args] = scanArgs(src, openParen);
    if (!args || args.length < 2) continue;
    registers++;
    // Namespace: string literal or identifier bound to one; skip slot-text objects.
    let ns = null;
    const a0 = args[0].trim();
    if (/^["']/.test(a0)) ns = a0.slice(1, -1);
    else if (/^[A-Za-z_$][\w$]*$/.test(a0)) ns = pickStr(a0, openParen) ?? null;
    if (!ns || !/^[a-z][A-Za-z0-9.\\_-]*$/.test(ns)) continue; // real ids are camelCase-aware
    // Dictionary: object literal, { zh: <literal|ident>, en: … } wrapper,
    // shorthand { zh, en }, or an identifier bound to an object literal.
    let dictSrc = null;
    const a1 = args[1].trim();
    const isIdent = (s) => /^[A-Za-z_$][\w$]*$/.test(s);
    if (a1.startsWith('{') && (/(^|[{,\s])zh\s*[,:}]/.test(a1) || /\bzh\s*:/.test(a1))) {
      // Wrapper object: pull out the zh member's source (literal) or resolve its identifier.
      const mzh = a1.match(/\bzh\s*:\s*/);
      if (mzh) {
        let p = mzh.index + mzh[0].length;
        while (p < a1.length && /\s/.test(a1[p])) p++;
        if (a1[p] === '{' || a1[p] === '[') dictSrc = scanLiteral(a1, p);
        else {
          const idm = /^[A-Za-z_$][\w$]*/.exec(a1.slice(p));
          if (idm) dictSrc = pickLiteral(idm[0], openParen);
        }
      } else if (/(^|[{,\s])zh\s*[,}]/.test(a1)) {
        dictSrc = pickLiteral('zh', openParen); // shorthand { zh, en }
      }
    } else if (a1.startsWith('{') || a1.startsWith('[')) dictSrc = a1;
    else if (isIdent(a1)) dictSrc = pickLiteral(a1, openParen);
    if (!dictSrc) { misses.push([path.relative(ROOT, f), ns, 'unresolved dict arg: ' + a1.replace(/\s+/g, ' ').slice(0, 60)]); continue; }
    let val = evalLiteral(dictSrc);
    if (val && typeof val === 'object' && !Array.isArray(val) && ('zh' in val) && ('en' in val)) val = val.zh;
    if (!val || typeof val !== 'object' || Array.isArray(val)) val = pairsFromText(dictSrc);
    if (!val || typeof val !== 'object' || Array.isArray(val)) { misses.push([path.relative(ROOT, f), ns, 'not a zh dict object']); continue; }
    resolved++;
    const target = (dicts[ns] ??= {});
    for (const [k, v] of Object.entries(val)) {
      if (typeof v === 'string' || typeof v === 'object') target[k] = v;
    }
  }
}

fs.writeFileSync(OUT, JSON.stringify(dicts, null, 1));
console.log(`files-with-register: ${files} | register sites: ${registers} | resolved: ${resolved}`);
console.log('namespaces:', Object.keys(dicts).length, '| keys:', Object.values(dicts).reduce((a, d) => a + Object.keys(d).length, 0));
if (misses.length) { console.log('unresolved register sites:'); for (const [f, ns, why] of misses) console.log('  ', f, ns, '—', why); }
