#!/usr/bin/env node
/**
 * BoardUI göçü — Faz 3 (etiket ↔ alan bağı)
 *
 * Yanındaki alanla (Input/InputBase/Textarea) aynı kapsayıcıda duran ama
 * `htmlFor`/`id` bağı olmayan `<Label>` etiketleri için alana `id`, etikete
 * `htmlFor` ekler. Kimlik, etiket metninden üretilir (Türkçe harfler sadeleşir);
 * aynı dosyada çakışma olursa sonuna sayı eklenir.
 *
 *   node script/migrate-boardui-label-for.cjs [--dry] [dosya...]
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const DRY = process.argv.includes("--dry");
const FILES = args.length
  ? args.map((f) => path.resolve(f))
  : (function walk(d) {
      return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(d, e.name);
        if (e.isDirectory()) return walk(p);
        if (!/\.tsx$/.test(e.name)) return [];
        if (/components[\\/](base|ui)[\\/]/.test(p)) return [];
        return [p];
      });
    })(path.join(ROOT, "client/src"));

const FIELDS = new Set(["Input", "InputBase", "Textarea", "TextareaBase", "TextArea"]);

const TR = { ı: "i", İ: "i", ş: "s", Ş: "s", ğ: "g", Ğ: "g", ü: "u", Ü: "u", ö: "o", Ö: "o", ç: "c", Ç: "c" };

function slugOf(text, fallback) {
  const s = text
    .replace(/[ıİşŞğĞüÜöÖçÇ]/g, (c) => TR[c])
    .toLowerCase()
    .replace(/\*/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || fallback;
}

for (const file of FILES) {
  const original = fs.readFileSync(file, "utf8");
  if (!original.includes("<Label")) continue;

  const sf = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const attrOf = (el, name) =>
    el.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === name);

  const used = new Set();
  // Dosyada zaten kullanılan id'leri topla (çakışma olmasın).
  (function collect(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === "id" && node.initializer && ts.isStringLiteral(node.initializer)) {
      used.add(node.initializer.text);
    }
    ts.forEachChild(node, collect);
  })(sf);

  const edits = [];
  let seq = 0;

  (function visit(node) {
    if (
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText(sf) === "Label" &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)) &&
      !attrOf(node.openingElement, "htmlFor")
    ) {
      const siblings = node.parent.children;
      const me = siblings.indexOf(node);
      const next = siblings.slice(me + 1).find((c) => !(ts.isJsxText(c) && !c.getText(sf).trim()));
      const field =
        next && ts.isJsxElement(next)
          ? next.openingElement
          : next && ts.isJsxSelfClosingElement(next)
            ? next
            : null;

      if (field && FIELDS.has(field.tagName.getText(sf)) && !attrOf(field, "id")) {
        const labelText = node.children
          .map((c) => (ts.isJsxText(c) ? c.getText(sf) : ""))
          .join(" ")
          .trim();
        let id = slugOf(labelText, `alan-${++seq}`);
        if (used.has(id)) {
          let n = 2;
          while (used.has(`${id}-${n}`)) n++;
          id = `${id}-${n}`;
        }
        used.add(id);
        edits.push({ start: node.openingElement.getEnd() - 1, end: node.openingElement.getEnd() - 1, text: ` htmlFor="${id}"` });

        // Alan çok satırlıysa (ilk nitelik alt satırda) id'yi kendi satırına yaz.
        const at = field.tagName.getEnd();
        if (original[at] === "\n") {
          const nextLine = original.slice(at + 1).match(/^([ \t]*)\S/);
          edits.push({ start: at, end: at, text: `\n${nextLine ? nextLine[1] : ""}id="${id}"` });
        } else {
          edits.push({ start: at, end: at, text: ` id="${id}"` });
        }
      }
    }
    ts.forEachChild(node, visit);
  })(sf);

  if (!edits.length) continue;

  let out = "";
  let last = 0;
  for (const e of edits.sort((a, b) => a.start - b.start)) {
    out += original.slice(last, e.start) + e.text;
    last = e.end;
  }
  out += original.slice(last);

  const reparsed = ts.createSourceFile(file, out, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (reparsed.parseDiagnostics && reparsed.parseDiagnostics.length) {
    console.log(`ATLANDI (sözdizimi): ${path.relative(ROOT, file)}`);
    continue;
  }
  if (DRY) {
    console.log(`${path.relative(ROOT, file)} (${edits.length / 2} etiket)`);
    continue;
  }
  fs.writeFileSync(file, out);
  console.log(`güncellendi: ${path.relative(ROOT, file)} (${edits.length / 2} etiket)`);
}
