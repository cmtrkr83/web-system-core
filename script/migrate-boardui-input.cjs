#!/usr/bin/env node
/**
 * shadcn Input → BoardUI InputBase codemod'u (TypeScript AST).
 *
 * BoardUI'nin InputBase'i React Aria kabuğu + düz <input> basıyor: value /
 * onChange(e) / disabled semantiği DOM ile aynı, yani çağrı yerleri değişmez.
 * Tek gerçek fark yerleşim: kabuk (field) düzeni belirler.
 *   genişlik sınıfları (w-*, max-w-*, flex-1 …) → fieldClassName (kabuk)
 *   tipografi sınıfları (text-*, font-*)        → className (<input>)
 *   yükseklik sınıfları (h-7/h-8)               → size="small"
 *   shadcn kenarlık/gölge/odak sınıfları        → düşer (BoardUI kabuğu verir)
 *
 * type="file" / multiple: React Aria TextField dosya alanı değildi — dosya
 * alanları olduğu gibi bırakılır ve RAPOR'a yazılır.
 * Yazmadan önce çıktı yeniden ayrıştırılır; parse hatası olan dosya yazılmaz.
 *
 * Kullanım: node script/migrate-boardui-input.cjs [--apply]
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const OLD_MODULE = "@/components/ui/input";
const NEW_MODULE = "@/components/base/input/input";
const WIDTH_CLASS = /^(w-|max-w-|min-w-|flex-1|shrink|grow|self-|mx-|mt-|mb-|ml-|mr-)/;
const TEXT_CLASS = /^(text-|font-|tabular-nums|tracking-)/;
const DROP_CLASS = /^(h-\d|h-\[|rounded|border|bg-|shadow|px-|py-|p-\d|file:|focus|focus-visible|ring|placeholder:|disabled:|outline)/;

const apply = process.argv.includes("--apply");
const root = path.resolve(__dirname, "..");
const report = [];
let sf;
let edits = [];

const targets = fs
  .readdirSync(path.join(root, "client/src/pages"))
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => path.join(root, "client/src/pages", f));

let touched = 0;
let total = 0;

for (const file of targets) {
  const original = fs.readFileSync(file, "utf8");
  if (!original.includes("<Input") && !original.includes(OLD_MODULE)) continue;

  const name = path.basename(file);
  sf = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  edits = [];

  ts.forEachChild(sf, function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === OLD_MODULE) {
      push(node.getStart(sf), node.getEnd(), `import { InputBase as Input } from "${NEW_MODULE}";`);
    }
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(sf) === "Input") {
      total++;
      handleInput(node, name);
    }
    ts.forEachChild(node, visit);
  });

  if (!edits.length) continue;
  const out = applyEdits(original, edits);
  const recheck = ts.createSourceFile(file, out, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if ((recheck.parseDiagnostics || []).length) {
    report.push(`${name}: parse hatası — YAZILMADI`);
    continue;
  }
  touched++;
  console.log(`${name}: ${edits.length} düzenleme`);
  if (apply) fs.writeFileSync(file, out, "utf8");
}

function handleInput(node, name) {
  const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
  const get = (n) => attrs.find((a) => a.name.getText(sf) === n);
  const literal = (a) => (a && a.initializer && ts.isStringLiteral(a.initializer) ? a.initializer.text : null);

  const type = literal(get("type"));
  if (type === "file" || get("multiple")) {
    report.push(`${name}:${line} dosya alanı — InputBase kabuğunda kaldı, görsel olarak elle bakılmalı`);
  }

  // className → kabuk (genişlik) / input (tipografi) / size
  const cls = get("className");
  if (cls && cls.initializer && ts.isStringLiteral(cls.initializer)) {
    const parts = cls.initializer.text.split(/\s+/).filter(Boolean);
    const shell = [];
    const input = [];
    let size = null;
    const left = [];
    for (const c of parts) {
      if (/^h-\d+$/.test(c)) size = "small";
      else if (WIDTH_CLASS.test(c)) shell.push(c);
      else if (TEXT_CLASS.test(c)) input.push(c);
      else if (DROP_CLASS.test(c)) continue;
      else left.push(c);
    }
    if (left.length) report.push(`${name}:${line} className'da sınıflandırılamayan: ${left.join(" ")}`);
    const repl = [];
    if (shell.length) repl.push(`fieldClassName="${shell.join(" ")}"`);
    if (input.length) repl.push(`className="${input.join(" ")}"`);
    if (size) repl.push(`size="${size}"`);
    push(cls.getStart(sf), cls.getEnd(), repl.join(" "));
  } else if (cls) {
    report.push(`${name}:${line} className ifade (dinamik) — elle taşınmalı`);
  }

}

function push(start, end, text) {
  edits.push({ start, end, text });
}

function applyEdits(text, list) {
  let out = text;
  for (const e of [...list].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

console.log(`\n${total} Input, ${touched} dosya ${apply ? "yazıldı" : "(dry-run)"}`);
for (const r of [...new Set(report)]) console.log("  RAPOR -", r);
