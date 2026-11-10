#!/usr/bin/env node
/**
 * Tüm BoardUI düğmelerini "açık mavi arka plan + koyu yazı" görünümüne (ghost) çeker.
 *  - variant → "ghost" (yoksa eklenir)
 *  - ghost'u ezen sınıflar className'den atılır: bg-*, renk text-*, border*, shadow-*
 *  - <Button> içinde "HTML Yazdır" yazan düğmeler korunur (il genel durum tablosu)
 *
 *   node script/migrate-boardui-ghost-buttons.cjs [--dry]
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const DRY = process.argv.includes("--dry");

const FILES = (function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return walk(p);
    if (!/\.tsx$/.test(e.name)) return [];
    // registry'den gelen kaynak dosyalar ve kullanılmayan shadcn parçaları değiştirilmez
    if (/components[\\/](base|ui)[\\/]/.test(p)) return [];
    return [p];
  });
})(path.join(ROOT, "client/src"));

const SIZE_TOKENS = /^text-(xs|sm|base|lg|xl|2xl|3xl|\[.*\])$/;

function stripConflicting(className) {
  return className
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => {
      const bare = t.replace(/^(hover|active|focus|focus-visible|disabled|group-hover|aria-disabled|peer):/, "");
      if (/^bg-/.test(bare) || bare === "bg") return false;
      if (/^shadow/.test(bare)) return false;
      if (bare === "border" || /^border-/.test(bare)) return false;
      if (/^text-/.test(bare) && !SIZE_TOKENS.test(bare)) {
        // tipografi kompozitleri (text-caption-1-medium vb.) korunur
        if (/^text-(caption|body|title|headline|display|large-title)/.test(bare)) return true;
        return false;
      }
      return true;
    })
    .join(" ");
}

for (const file of FILES) {
  const original = fs.readFileSync(file, "utf8");
  if (!original.includes("<Button")) continue;
  const sf = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];

  const attrsOf = (el) => el.attributes.properties;
  const attrOf = (el, name) =>
    attrsOf(el).find((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === name);

  (function visit(node) {
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && node.openingElement?.tagName?.getText(sf) === "Button") {
      const el = node.openingElement;
      const text = node.getText(sf);
      if (/HTML Yazdır/.test(text)) {
        ts.forEachChild(node, visit);
        return;
      }

      const variantAttr = attrOf(el, "variant");
      if (!variantAttr) {
        edits.push({ start: el.tagName.getEnd(), end: el.tagName.getEnd(), text: ' variant="ghost"' });
      } else if (variantAttr.initializer && variantAttr.initializer.getText(sf) !== '"ghost"') {
        edits.push({
          start: variantAttr.initializer.getStart(sf),
          end: variantAttr.initializer.getEnd(),
          text: '"ghost"',
        });
      }

      const cls = attrOf(el, "className");
      if (cls && cls.initializer && ts.isStringLiteral(cls.initializer)) {
        const cleaned = stripConflicting(cls.initializer.text);
        if (cleaned !== cls.initializer.text.trim()) {
          edits.push({
            start: cls.initializer.getStart(sf),
            end: cls.initializer.getEnd(),
            text: cleaned ? `"${cleaned}"` : '""',
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  })(sf);

  const real = edits.filter((e) => original.slice(e.start, e.end) !== e.text);
  if (!real.length) continue;

  let out = "";
  let last = 0;
  for (const e of real.sort((a, b) => a.start - b.start)) {
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
    console.log(`--- ${path.relative(ROOT, file)} (${real.length} düzenleme)`);
    continue;
  }
  fs.writeFileSync(file, out);
  console.log(`güncellendi: ${path.relative(ROOT, file)} (${real.length} düzenleme)`);
}
