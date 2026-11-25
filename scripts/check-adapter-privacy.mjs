/** Conservative static guard: adapters must observe structure, never DOM contents. */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const target = process.argv[2] ?? "src/adapters";
const forbidden = new Set([
  "textContent",
  "innerText",
  "outerText",
  "innerHTML",
  "outerHTML",
  "nodeValue",
  "wholeText",
  "oldValue",
  "getAttribute",
  "getAttributeNS",
  "getAttributeNode",
  "getAttributeNames",
  "attributes",
  "dataset",
  "getSelection",
  "createRange",
  "cloneContents",
  "extractContents",
  "toString",
  "text",
  "json",
]);
function walkFiles(item) {
  const stat = fs.statSync(item);
  return stat.isDirectory()
    ? fs.readdirSync(item).flatMap((name) => walkFiles(path.join(item, name)))
    : /\.[cm]?[jt]s$/.test(item)
      ? [item]
      : [];
}
function staticString(expression) {
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticString(expression.left),
      right = staticString(expression.right);
    return left === null || right === null ? null : left + right;
  }
  if (ts.isComputedPropertyName(expression)) return staticString(expression.expression);
  return null;
}
let violations = 0;
for (const filename of walkFiles(target)) {
  const source = ts.createSourceFile(
    filename,
    fs.readFileSync(filename, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  function visit(node) {
    let bad = "";
    if (ts.isPropertyAccessExpression(node)) {
      if (forbidden.has(node.name.text)) bad = node.name.text;
      // Signal.value is control metadata; an input or node's value is not.
      if (node.name.text === "value" && node.expression.getText(source) !== "this.observable")
        bad = "value";
      // Only the explicitly named stream-timing MessageEvent may use event.data.
      if (node.name.text === "data") {
        let parent = node.parent;
        while (parent && !ts.isPropertyDeclaration(parent)) parent = parent.parent;
        const isTimingEvent =
          node.expression.getText(source) === "event" &&
          parent?.name?.getText(source) === "onStreamMessage";
        if (!isTimingEvent) bad = "data";
      }
    } else if (ts.isElementAccessExpression(node) && node.argumentExpression) {
      const key = staticString(node.argumentExpression);
      if (key && (forbidden.has(key) || key === "data" || key === "value")) bad = key;
    } else if (ts.isBindingElement(node)) {
      const name = node.propertyName ?? node.name;
      const key = ts.isIdentifier(name) ? name.text : staticString(name);
      if (key && (forbidden.has(key) || key === "data" || key === "value")) bad = key;
    }
    if (bad) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      console.error(`${filename}:${line + 1}: prohibited content access: ${bad}`);
      violations++;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
if (violations) process.exitCode = 1;
else console.log("Adapter privacy guard passed: structural observation only.");
