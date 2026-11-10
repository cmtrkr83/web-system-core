#!/usr/bin/env node
/**
 * Seçili JSX öğelerini yeniden biçimlendirir:
 *   - tek satıra taşan açılış etiketlerini nitelik başına bir satıra yayar
 *   - silme sonrası kalan boş satırları temizler, çocuk girintisini düzeltir
 *
 *   node script/format-jsx-elements.cjs Select [dosya...]
 *         (--dry ile önizleme; dosyalar verilmezse client/src taranır)
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const argv = process.argv.slice(2);
const TAG = argv.shift() || "Select";
const DRY = argv.includes("--dry");
const args = argv.filter((a) => !a.startsWith("--"));
const FILES = args.length
  ? args.map((f) => path.resolve(f))
  : (function walk(d) {
      return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(d, e.name);
        return e.isDirectory() ? walk(p) : /\.tsx$/.test(e.name) ? [p] : [];
      });
    })(path.join(ROOT, "client/src"));

const MAX_LINE = 108;

for (const file of FILES) {
  const original = fs.readFileSync(file, "utf8");
  if (!original.includes(`<${TAG}`)) continue;
  const sf = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const width = (s) => (s.includes("\t") ? s.replace(/\t/g, "  ").length : s.length);

  const blocks = [];
  (function find(node) {
    const el = ts.isJsxElement(node) ? node.openingElement : null;
    if (el && el.tagName.getText(sf) === TAG) blocks.push(node);
    ts.forEachChild(node, find);
  })(sf);
  if (!blocks.length) continue;

  const lines = original.split("\n");
  const lineStart = (idx) => {
    let n = 0;
    for (let i = 0; i < lines.length; i++) {
      if (n + lines[i].length + 1 > idx) return { i, n };
      n += lines[i].length + 1;
    }
    return { i: lines.length - 1, n };
  };

  const edits = [];
  for (const block of blocks) {
    const start = block.getStart(sf);
    const end = block.getEnd();
    const { i: firstLine, n } = lineStart(start);
    const base = (lines[firstLine].match(/^[ \t]*/) || [""])[0];
    const token = base.includes("\t") ? "\t" : "  ";
    const text = original.slice(start, end);
    if (!text.includes("\n") && base.length + text.length <= MAX_LINE) continue;

    // 1) açılış etiketi: tek satırsa ve uzunsa yay
    let openText = block.openingElement.getText(sf);
    if (openText.includes("\n") || base.length + openText.length <= MAX_LINE) openText = null;

    // 2) gövde: boş satırları at, girintiyi tabana göre yeniden kur
    const bodyStart = block.openingElement.getEnd();
    const bodyEnd = block.closingElement.getStart(sf);
    const bodyLines = original.slice(bodyStart, bodyEnd).split("\n").slice(1, -1);
    const filled = bodyLines.filter((l) => l.trim());
    const minIndent = filled.length ? Math.min(...filled.map((l) => width(l.match(/^[ \t]*/)[0]))) : 0;
    const body = filled
      .map((l) => {
        const lead = l.match(/^[ \t]*/)[0];
        return base + token + lead.slice(Math.min(minIndent, lead.length)) + l.trimStart();
      })
      .join("\n");

    const closing = base + `</${TAG}>`;
    if (openText) {
      const attrs = block.openingElement.attributes.properties.map((a) => a.getText(sf));
      openText = `<${TAG}` + attrs.map((a) => `\n${base}${token}${a}`).join("") + `\n${base}>`;
    }
    const head = openText || original.slice(start, bodyStart);
    edits.push({ start, end, text: `${head}\n${body ? body + "\n" : ""}${closing}` });
  }
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
    console.log(`--- ${path.relative(ROOT, file)} (${edits.length} blok)`);
    continue;
  }
  fs.writeFileSync(file, out);
  console.log(`biçimlendi: ${path.relative(ROOT, file)} (${edits.length} blok)`);
}
