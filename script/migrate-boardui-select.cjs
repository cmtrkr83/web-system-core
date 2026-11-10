#!/usr/bin/env node
/**
 * BoardUI göçü — Faz 3 (Select)
 *   shadcn:  <Select value onValueChange><SelectTrigger className="h-9 w-14"><SelectValue placeholder="X"/></SelectTrigger>
 *              <SelectContent><SelectItem value="a">…</SelectItem></SelectContent></Select>
 *   BoardUI: <Select selectedKey onSelectionChange placeholder="X" triggerClassName="…" size="sm">
 *              <SelectItem id="a">…</SelectItem></Select>
 *
 * Kullanımı elle doğrulamak için kuru çalıştırın.
 *   node script/migrate-boardui-select.cjs [--dry] [dosya...]
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
        return e.isDirectory() ? walk(p) : /\.tsx$/.test(e.name) ? [p] : [];
      });
    })(path.join(ROOT, "client/src"));

const SIZE_CLASS = /^h-(7|8|9)$/;

for (const file of FILES) {
  const original = fs.readFileSync(file, "utf8");
  if (!original.includes("components/ui/select")) continue;

  const sf = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const del = (node) => edits.push({ start: node.getStart(sf), end: node.getEnd(), text: "" });
  // bir sarmalayıcı etiketi siler, çocuklarını yerinde bırakır
  const delTags = (node) => {
    if (ts.isJsxElement(node)) {
      del(node.openingElement);
      del(node.closingElement);
    } else del(node);
  };
  const put = (node, text) => edits.push({ start: node.getStart(sf), end: node.getEnd(), text });
  const isWs = (n) => ts.isJsxText(n) && !n.getText(sf).trim();

  const tagOf = (node) => {
    const el = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
    if (!el) return null;
    const t = el.tagName;
    return ts.isPropertyAccessExpression(t) ? t.expression.getText(sf) + "." + t.name.getText(sf) : t.getText(sf);
  };
  const attrsOf = (node) =>
    (ts.isJsxElement(node) ? node.openingElement : node).attributes.properties;
  const attrOf = (node, name) =>
    attrsOf(node).find((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === name);
  // attribute değerini kaynak metniyle döndürür ("X", {ifade}, yoksa null)
  const attrValue = (node, name) => {
    const a = attrOf(node, name);
    return a && a.initializer ? a.initializer.getText(sf) : null;
  };
  const isUiSelectRoot = (node) => {
    if (tagOf(node) !== "Select") return false;
    const imp = sf.statements.find(
      (s) => ts.isImportDeclaration(s) && /components\/ui\/select/.test(s.moduleSpecifier?.getText(sf) || ""),
    );
    return !!imp && !!imp.importClause && /(^|[{,\s])Select(\s+as\s+\w+)?\s*[},]/.test(imp.importClause.namedBindings?.getText(sf) || "");
  };

  /** SelectTrigger içeriğinden placeholder + trigger sınıflarını üretir */
  function readTrigger(node, parts) {
    const raw = attrValue(node, "className");
    if (raw) {
      if (raw.startsWith('"')) {
        const keep = [];
        for (const c of raw.slice(1, -1).split(/\s+/).filter(Boolean)) {
          if (SIZE_CLASS.test(c)) parts.push('size="sm"');
          else keep.push(c);
        }
        if (keep.length) parts.push(`triggerClassName="${keep.join(" ")}"`);
      } else {
        // dinamik sınıf: boyut sınıflarını ifadenin içinden düşür
        const expr = raw.replace(/^\{/, "").replace(/\}$/, "");
        const cleaned = expr.replace(/\s*\bh-(7|8|9)\b/g, "").replace(/\s{2,}/g, " ").trim();
        if (/\bh-(7|8|9)\b/.test(expr)) parts.push('size="sm"');
        if (cleaned) parts.push(`triggerClassName={${cleaned}}`);
      }
    }
    const disabled = attrOf(node, "disabled");
    if (disabled) parts.push(disabled.initializer ? `isDisabled=${disabled.initializer.getText(sf)}` : "isDisabled");
    const innerNodes = ts.isJsxElement(node) ? node.children : ts.isJsxSelfClosingElement(node) ? [node] : [];
    for (const inner of innerNodes) {
      if (isWs(inner)) continue;
      if (tagOf(inner) === "SelectValue") {
        const p = attrValue(inner, "placeholder");
        if (p) parts.push(`placeholder=${p.startsWith('"') ? `{${p}}` : p}`);
      } else if (ts.isJsxExpression(inner)) {
        const e = inner.getText(sf).trim().replace(/^\{/, "").replace(/\}$/, "");
        if (e) parts.push(`placeholder={${e}}`);
      } else {
        const t = inner.getText(sf).trim();
        if (t) parts.push(`placeholder={${JSON.stringify(t)}}`);
      }
    }
  }

  /** <SelectItem value=…> başlığını BoardUI'nin id biçimine çevirir */
  function rewriteItem(node) {
    const attrs = attrsOf(node)
      .map((a) => {
        if (!ts.isJsxAttribute(a)) return a.getText(sf);
        const n = a.name.getText(sf);
        if (n === "value") return a.initializer ? `id=${a.initializer.getText(sf)}` : null;
        if (n === "className") return null;
        return a.getText(sf);
      })
      .filter(Boolean);
    const open = ts.isJsxElement(node) ? node.openingElement : node;
    put(open, `<SelectItem${attrs.length ? " " + attrs.join(" ") : ""}>`);
    if (ts.isJsxElement(node)) put(node.closingElement, "</SelectItem>");
  }

  /** ifadelerin içinde dolaşarak SelectItem'ları çevirir (ör. {liste.map(...)}) */
  function fixNestedItems(node) {
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && tagOf(node) === "SelectItem") {
      rewriteItem(node);
      return;
    }
    ts.forEachChild(node, fixNestedItems);
  }

  /** SelectContent içindeki öğeleri (SelectItem → id) kök Select'in çocuğu olarak taşır */
  function readContent(node) {
    for (const item of ts.isJsxElement(node) ? node.children : []) {
      if (isWs(item)) continue;
      const tag = tagOf(item);
      if (tag === "SelectItem") rewriteItem(item);
      else if (tag === "SelectGroup" || tag === "SelectSeparator") {
        if (tag === "SelectGroup") readContent(item);
        delTags(item);
      } else {
        fixNestedItems(item);
      }
    }
  }

  function visit(node) {
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && isUiSelectRoot(node)) {
      const parts = [];
      let label = null;

      for (const a of attrsOf(node)) {
        if (!ts.isJsxAttribute(a)) {
          parts.push(a.getText(sf));
          continue;
        }
        const n = a.name.getText(sf);
        const v = a.initializer ? a.initializer.getText(sf) : null;
        if (n === "value") parts.push(`selectedKey=${v}`);
        else if (n === "defaultValue") parts.push(`defaultSelectedKey=${v}`);
        else if (n === "onValueChange") parts.push(`onSelectionChange=${wrapHandler(a.initializer && ts.isJsxExpression(a.initializer) ? a.initializer.expression : null)}`);
        else if (n === "disabled") parts.push(v ? `isDisabled=${v}` : "isDisabled");
        else if (n === "className") {
          if (v && v.startsWith('"')) {
            const keep = [];
            for (const c of v.slice(1, -1).split(/\s+/).filter(Boolean)) {
              if (SIZE_CLASS.test(c)) parts.push('size="sm"');
              else keep.push(c);
            }
            if (keep.length) parts.push(`triggerClassName="${keep.join(" ")}"`);
          } else if (v) parts.push(`triggerClassName=${v}`);
        } else if (n === "id") {
          parts.push(`aria-labelledby={${v.replace(/^\{/, "").replace(/\}$/, "")}}`);
        } else parts.push(a.getText(sf));
      }

      const keepChildren = [];
      for (const ch of ts.isJsxElement(node) ? node.children : []) {
        const tag = tagOf(ch);
        if (isWs(ch)) continue;
        if (tag === "SelectTrigger") {
          readTrigger(ch, parts);
          del(ch);
        } else if (tag === "SelectValue") {
          const p = attrValue(ch, "placeholder");
          if (p) parts.push(`placeholder=${p.startsWith('"') ? `{${p}}` : p}`);
          del(ch);
        } else if (tag === "SelectLabel") {
          const text = (ch.children || []).map((c) => c.getText(sf).trim()).filter(Boolean).join(" ");
          if (text) label = `label={${/^\{/.test(text) ? text.slice(1, -1) : JSON.stringify(text)}}`;
          del(ch);
        } else if (tag === "SelectContent") {
          readContent(ch);
          delTags(ch);
        } else {
          keepChildren.push(ch);
        }
      }

      if (label) parts.unshift(label);
      put(node.openingElement || node, `<Select ${parts.filter(Boolean).join(" ")}>`);
      if (ts.isJsxElement(node)) put(node.closingElement, "</Select>");
      return;
    }
    ts.forEachChild(node, visit);
  }

  function wrapHandler(expr) {
    if (!expr) return null;
    const text = expr.getText(sf);
    const body = ts.isArrowFunction(expr) || ts.isFunctionExpression(expr) ? `(${text})` : text;
    return `{(key) => ${body}(String(key))}`;
  }

  ts.forEachChild(sf, visit);
  if (!edits.length) continue;

  let out = "";
  let last = 0;
  for (const e of edits.sort((a, b) => a.start - b.start)) {
    out += original.slice(last, e.start) + e.text;
    last = e.end;
  }
  out += original.slice(last);
  out = out.replace(
    /^import \{[^}]*\} from "@\/components\/ui\/select";$/m,
    'import { Select, SelectItem } from "@/components/base/select/select";',
  );
  out = out.replace(/\n\s*\n\s*(<\/)/g, "\n$1");

  const reparsed = ts.createSourceFile(file, out, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (reparsed.parseDiagnostics && reparsed.parseDiagnostics.length) {
    if (process.env.DUMP) fs.writeFileSync("/tmp/select-out.tsx", out);
    console.log(
      "ATLANDI (sözdizimi): " +
        path.relative(ROOT, file) +
        " :: " +
        (reparsed.parseDiagnostics || [])
          .slice(0, 3)
          .map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ") + " @" + d.start)
          .join(" | "),
    );
    continue;
  }
  if (DRY) {
    console.log(`--- ${path.relative(ROOT, file)} (${edits.length} düzenleme)`);
    continue;
  }
  fs.writeFileSync(file, out);
  console.log(`güncellendi: ${path.relative(ROOT, file)} (${edits.length} düzenleme)`);
}
