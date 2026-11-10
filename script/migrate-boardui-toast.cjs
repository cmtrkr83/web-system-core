#!/usr/bin/env node
/**
 * BoardUI göçü — Faz 3 (Toast)
 *   eski:  const { toast } = useToast();  toast({ title, description, variant | status })
 *   yeni:  import { toast } from "@/components/base/toast/toast";
 *          toast.error(title, { description }) / toast.success(...) / toast.info(...)
 *
 *   node script/migrate-boardui-toast.cjs [--dry] [dosya...]
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
        if (/components[\\/]ui[\\/]/.test(p)) return []; // eski Toaster'a dokunma
        return [p];
      });
    })(path.join(ROOT, "client/src"));

for (const file of FILES) {
  const original = fs.readFileSync(file, "utf8");
  if (!original.includes("use-toast")) continue;

  const sf = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];

  function whole(node, text) {
    let start = node.getStart(sf);
    let end = node.getEnd();
    while (start > 0 && /[ \t]/.test(original[start - 1])) start--;
    if (original[end] === "\n") end++;
    else if (original.slice(end, end + 6).includes("\n")) end = original.indexOf("\n", end) + 1;
    edits.push({ start, end, text });
  }

  function rewriteCall(call) {
    const arg = call.arguments[0];
    if (!arg || !ts.isObjectLiteralExpression(arg) || call.arguments.length !== 1) return;
    const props = new Map();
    for (const p of arg.properties) {
      if (!ts.isPropertyAssignment(p)) return;
      props.set(p.name.getText(sf), p.initializer.getText(sf));
    }
    if (!props.has("title")) return;

    const variant = props.get("variant");
    const status = props.get("status");
    const method =
      variant && /destructive/.test(variant)
        ? "error"
        : status && /success/.test(status)
          ? "success"
          : "info";

    const rest = [...props]
      .filter(([k]) => !["title", "variant", "status"].includes(k))
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");

    const title = props.get("title").replace(/\s*\n\s*/g, " ").trim();
    edits.push({
      start: call.getStart(sf),
      end: call.getEnd(),
      text: `toast${method === "info" ? "" : `.${method}`}(${title}${rest ? `, { ${rest} }` : ""})`,
    });
  }

  (function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(sf) === "toast") rewriteCall(node);

    // import { useToast } from "@/hooks/use-toast";
    if (
      ts.isImportDeclaration(node) &&
      /hooks\/use-toast/.test(node.moduleSpecifier.getText(sf))
    ) {
      whole(node, 'import { toast } from "@/components/base/toast/toast";\n');
    }

    // const { toast } = useToast();
    if (ts.isVariableStatement(node)) {
      const decl = node.declarationList.declarations[0];
      const init = decl && decl.initializer;
      if (
        init &&
        ts.isCallExpression(init) &&
        init.expression.getText(sf) === "useToast" &&
        decl.getText(sf).includes("toast")
      ) {
        whole(node, "");
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
  out = out.replace(/\n{3,}/g, "\n\n");

  const reparsed = ts.createSourceFile(file, out, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (reparsed.parseDiagnostics && reparsed.parseDiagnostics.length) {
    console.log(
      "ATLANDI (sözdizimi): " +
        path.relative(ROOT, file) +
        " :: " +
        (reparsed.parseDiagnostics || []).slice(0, 2).map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ") + " @" + d.start).join(" | "),
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
