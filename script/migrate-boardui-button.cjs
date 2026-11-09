#!/usr/bin/env node
/**
 * shadcn Button → BoardUI Button codemod'u (TypeScript AST, regex ile JSX eşleştirme YOK).
 *
 * Düzenlemeler AST düğüm konumlarından hesaplanıp orijinal metne uygulanır;
 * dokunulmayan her satır biçimlendirmesiyle birlikte aynen kalır.
 * Sonuç yeniden ayrıştırılır: parse hatası üreten dosya YAZILMAZ.
 *
 *   import "@/components/ui/button" → "@/components/base/buttons/button"
 *   variant default/outline/secondary → secondary
 *   variant ghost → ghost | destructive → danger | table → secondary (+small)
 *   size sm → small, lg → medium, icon → iconOnly
 *   leadingIcon={<X />}             → leadingIcon={X}
 *   iconOnly'de className'daki sabit kutu ölçüsü sınıfları düşürülür
 *
 * Emin olunmayanlar RAPOR'a yazılır ve olduğu gibi bırakılır.
 * Kullanım: node script/migrate-boardui-button.cjs [--apply]
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const OLD_MODULE = "@/components/ui/button";
const NEW_MODULE = "@/components/base/buttons/button";
const VARIANT_MAP = {
  default: "secondary",
  outline: "secondary",
  secondary: "secondary",
  ghost: "ghost",
  destructive: "danger",
  table: "secondary",
};
const SIZE_MAP = { sm: "small", md: "medium", lg: "medium", default: "medium" };
const VALID_BOARDUI_SIZES = new Set(["small", "medium", "xs", "icon", "icon-sm"]);
const VALID_BOARDUI_VARIANTS = new Set(["primary", "secondary", "ghost", "danger"]);
const SIZE_CLASS = /^h-\d+$|^w-\d+$|^size-\d+$|^p-0$/;
const LAYOUT_PREFIXES = [
  "h-", "w-", "size-", "min-w-", "max-w-", "m-", "mx-", "my-", "mt-", "mr-", "mb-", "ml-",
  "p-", "px-", "py-", "pt-", "pr-", "pb-", "pl-", "gap-", "gap-x-", "gap-y-", "space-x-", "space-y-",
  "shrink", "grow", "pointer-events-none", "inline", "block", "flex", "hidden", "absolute", "relative",
];

const apply = process.argv.includes("--apply");
const root = path.resolve(__dirname, "..");
const report = [];
/** @type {import("typescript").SourceFile} */
let sf;
/** @type {{start:number,end:number,text:string}[]} */
let edits = [];

const targets = [
  ...fs
    .readdirSync(path.join(root, "client/src/pages"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => path.join(root, "client/src/pages", f)),
  path.join(root, "client/src/components/layout/Sidebar.tsx"),
];

let touched = 0;
let buttonCount = 0;

for (const file of targets) {
  const original = fs.readFileSync(file, "utf8");
  if (!original.includes("<Button") && !original.includes(OLD_MODULE)) continue;

  const name = path.basename(file);
  sf = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  edits = [];

  ts.forEachChild(sf, function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === OLD_MODULE) {
      const named = node.importClause?.namedBindings;
      if (named && ts.isNamedImports(named) && named.elements.some((e) => e.name.text !== "Button")) {
        report.push(`${name}: ui/button'dan Button dışı import var (${named.elements.map((e) => e.name.text).join(", ")}) — dosya atlandı`);
        return;
      }
      push(node.moduleSpecifier.getStart(sf), node.moduleSpecifier.getEnd(), JSON.stringify(NEW_MODULE));
    }
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(sf) === "Button") {
      buttonCount++;
      handleButton(node, name);
    }
    ts.forEachChild(node, visit);
  });

  if (!edits.length) continue;
  const out = applyEdits(original, edits);
  const recheck = ts.createSourceFile(file, out, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const errors = recheck.parseDiagnostics || [];
  if (errors.length) {
    report.push(`${name}: ${errors.length} parse hatası — YAZILMADI (${ts.flattenDiagnosticMessageText(errors[0].messageText, " ")})`);
    continue;
  }
  touched++;
  console.log(`${name}: ${edits.length} düzenleme`);
  if (apply) fs.writeFileSync(file, out, "utf8");
}

function handleButton(node, name) {
  const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
  const get = (n) => attrs.find((a) => a.name.getText(sf) === n);
  const text = (a) => (a && a.initializer && ts.isStringLiteral(a.initializer) ? a.initializer.text : null);

  if (get("asChild")) {
    report.push(`${name}:${line} asChild (BoardUI'de Slot yok) — elle LinkButton/Link'e çevir`);
    return;
  }

  const variantAttr = get("variant");
  const variant = text(variantAttr);
  if (variantAttr && !variant) {
    report.push(`${name}:${line} variant değişken/ifadesi — elle çevir`);
    return;
  }
  if (variantAttr && variant && VALID_BOARDUI_VARIANTS.has(variant)) {
    // zaten BoardUI değeri: dokunma
  } else if (variantAttr && variant && !(variant in VARIANT_MAP)) {
    report.push(`${name}:${line} bilinmeyen variant "${variant}" — bırakıldı`);
    return;
  }

  const sizeAttr = get("size");
  const size = text(sizeAttr);
  if (sizeAttr && !size) {
    report.push(`${name}:${line} size değişken/ifadesi — elle çevir`);
    return;
  }
  if (sizeAttr && size && !(size in SIZE_MAP) && !VALID_BOARDUI_SIZES.has(size)) {
    report.push(`${name}:${line} bilinmeyen size "${size}" — bırakıldı`);
    return;
  }

  // leadingIcon={<X />} / leadingIcon={<X className="…" />} → leadingIcon={X}
  const lead = get("leadingIcon");
  if (lead && lead.initializer && ts.isJsxExpression(lead.initializer)) {
    const inner = lead.initializer.expression;
    const opening =
      inner && ts.isJsxSelfClosingElement(inner)
        ? inner
        : inner && ts.isJsxElement(inner)
          ? inner.openingElement
          : null;
    if (opening) {
      const extra = opening.attributes.properties.filter(
        (p) => !(ts.isJsxAttribute(p) && p.name.getText(sf) === "className" && isSizeOnly(p)),
      );
      if (extra.length) report.push(`${name}:${line} leadingIcon ikonunda className dışı nitelik var — elle bak`);
      push(lead.getStart(sf), lead.getEnd(), `leadingIcon={${opening.tagName.getText(sf)}}`);
    }
  }

  // variant yoksa BoardUI'nin mavi "primary" varsayılanına düşmesin: mevcut
  // görünüm (shadcn default = sakin arka plan) secondary'ye karşılık gelir.
  if (!variantAttr) addAttribute(node.attributes, 'variant="secondary"');
  else if (variant && !VALID_BOARDUI_VARIANTS.has(variant))
    push(variantAttr.getStart(sf), variantAttr.getEnd(), `variant="${VARIANT_MAP[variant]}"`);

  const alreadyIconOnly = !!get("iconOnly");
  if (size === "icon" || size === "icon-sm" || alreadyIconOnly) {
    if (sizeAttr) dropAttribute(sizeAttr);
    if (!alreadyIconOnly) addAttribute(node.attributes, "iconOnly" + (size === "icon-sm" ? ' size="small"' : ""));
    trimSizeClasses(node, name, line);
    hoistIconChild(node, name, line);
    return;
  }
  if (sizeAttr) {
    if (size in SIZE_MAP) push(sizeAttr.getStart(sf), sizeAttr.getEnd(), `size="${SIZE_MAP[size]}"`);
    else if (!VALID_BOARDUI_SIZES.has(size)) dropAttribute(sizeAttr);
  } else if (variant === "table") {
    addAttribute(node.attributes, 'size="small"');
  }

  hoistChildIcons(node, name, line);
}

/** Baş/son çocuk ikonunu leadingIcon / trailingIcon'a taşır (BoardUI ikon boyunu kendi verir). */
function hoistChildIcons(node, name, line) {
  const el = node.parent;
  if (!el || !ts.isJsxElement(el)) return;
  const get = (n) => node.attributes.properties.filter(ts.isJsxAttribute).find((a) => a.name.getText(sf) === n);
  const kids = el.children.filter((c) => !(ts.isJsxText(c) && !c.getText(sf).trim()));
  const asIcon = (child) => {
    if (!child) return null;
    const opening = ts.isJsxSelfClosingElement(child) ? child : ts.isJsxElement(child) ? child.openingElement : null;
    if (!opening) return null;
    const tag = opening.tagName.getText(sf);
    if (!/^[A-Z]/.test(tag)) return null;
    const extra = opening.attributes.properties.filter(
      (p) => !(ts.isJsxAttribute(p) && p.name.getText(sf) === "className" && isSizeOnly(p)),
    );
    if (extra.length) return null;
    if (ts.isJsxElement(child) && child.children.some((c) => !(ts.isJsxText(c) && !c.getText(sf).trim()))) return null;
    return tag;
  };

  const first = asIcon(kids[0]);
  if (first && kids.length > 1 && !get("leadingIcon")) {
    addAttribute(node.attributes, `leadingIcon={${first}}`);
    removeChild(el, kids[0]);
  }
  const last = asIcon(kids[kids.length - 1]);
  if (last && kids.length > 1 && kids[kids.length - 1] !== kids[0] && !get("trailingIcon")) {
    addAttribute(node.attributes, `trailingIcon={${last}}`);
    removeChild(el, kids[kids.length - 1]);
  }
}

/** className içindeki sabit kutu ölçülerini düşür (BoardUI iconOnly ölçüyü verir). */
function trimSizeClasses(node, name, line) {
  const attr = node.attributes.properties.filter(ts.isJsxAttribute).find((a) => a.name.getText(sf) === "className");
  if (!attr || !attr.initializer || !ts.isStringLiteral(attr.initializer)) return;
  const parts = attr.initializer.text.split(/\s+/).filter(Boolean);
  const kept = parts.filter((c) => !SIZE_CLASS.test(c));
  if (kept.length === parts.length) return;
  push(attr.getStart(sf), attr.getEnd(), `className="${kept.join(" ")}"`);
}

/** className yalnızca ölçü/yerleşim sınıfı taşıyorsa BoardUI'ye bırakılabilir. */
function isSizeOnly(attr) {
  if (!attr.initializer || !ts.isStringLiteral(attr.initializer)) return false;
  return attr.initializer.text
    .split(/\s+/)
    .filter(Boolean)
    .every((c) => LAYOUT_PREFIXES.some((p) => c.startsWith(p)));
}

/**
 * iconOnly'de BoardUI children'ı hiç basmıyor: tek ikon çocuğu leadingIcon'a taşı.
 */
function hoistIconChild(node, name, line) {
  const el = node.parent;
  if (!el || !ts.isJsxElement(el)) return;
  const get = (n) => node.attributes.properties.filter(ts.isJsxAttribute).find((a) => a.name.getText(sf) === n);
  const kids = el.children.filter((c) => !(ts.isJsxText(c) && !c.getText(sf).trim()));
  if (!kids.length) return;
  if (kids.length !== 1 || !ts.isJsxSelfClosingElement(kids[0])) {
    report.push(`${name}:${line} iconOnly butonun çocuğu tek ikon değil — ikon basılmaz, elle leadingIcon'a al`);
    return;
  }
  if (get("leadingIcon")) {
    report.push(`${name}:${line} hem leadingIcon hem ikon çocuk var — elle birleştir`);
    return;
  }
  const icon = kids[0];
  const extra = icon.attributes.properties.filter((p) => !(ts.isJsxAttribute(p) && p.name.getText(sf) === "className" && isSizeOnly(p)));
  if (extra.length) {
    report.push(`${name}:${line} ikon çocuğun className dışında/ölçü olmayan nitelik var — elle bak`);
    return;
  }
  addAttribute(node.attributes, `leadingIcon={${icon.tagName.getText(sf)}}`);
  push(node.getEnd(), el.closingElement.getStart(sf), "");
}

/** Çocuk ikonu siler; kendi satırındaysa o satırın boşluğunu da temizler. */
function removeChild(parent, child) {
  const kids = parent.children;
  const i = kids.indexOf(child);
  let end = child.getEnd();
  const after = kids[i + 1];
  if (after && ts.isJsxText(after) && !after.getText(sf).trim()) end = after.getEnd();
  push(child.getStart(sf), end, "");
}

function push(start, end, text) {
  edits.push({ start, end, text });
}

/** Niteliği siler; nitelik son sıradaysa kendinden önceki boşluğu da alır. */
function dropAttribute(attr) {
  const src = sf.getFullText();
  let start = attr.getStart(sf);
  let end = attr.getEnd();
  while (end < src.length && (src[end] === " " || src[end] === "\t")) end++;
  if (end === attr.getEnd()) {
    while (start > 0 && (src[start - 1] === " " || src[start - 1] === "\t")) start--;
  }
  push(start, end, "");
}

function addAttribute(attributes, text) {
  const list = attributes.properties;
  const at = list.length ? list[list.length - 1].getEnd() : attributes.parent.tagName.getEnd();
  push(at, at, " " + text);
}

function applyEdits(text, list) {
  let out = text;
  for (const e of [...list].sort((a, b) => b.start - a.start || b.end - a.end)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
}

console.log(`\n${buttonCount} Button, ${touched} dosya ${apply ? "yazıldı" : "(dry-run)"}`);
for (const r of [...new Set(report)]) console.log("  RAPOR -", r);
