import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps decorative gradients out of the cabinet and operator pages", () => {
  for (const file of ["src/content/panel.ts", "src/engine/engine.ts", "public/ui.css", "public/popup.html"]) {
    const source = readFileSync(file, "utf8");
    expect(source, file).not.toMatch(/(?:linear|radial|conic)-gradient\s*\(|create(?:Linear|Radial|Conic)Gradient\s*\(/i);
  }
});
