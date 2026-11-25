import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

type Report = {
  surface: string;
  javascriptBytes: number;
  largestChunkBytes: number;
  budgets: { total: number; chunk: number };
  webOnlyModuleCount: number;
  chunks: Array<{ file: string; bytes: number }>;
};

test("built extension excludes web-only modules and both surfaces meet their budgets", async () => {
  const extension = JSON.parse(await readFile("dist/bundle-report.json", "utf8")) as Report;
  const web = JSON.parse(
    await readFile("deployment/web-dist/bundle-report.json", "utf8"),
  ) as Report;
  expect(extension.surface).toBe("extension");
  expect(web.surface).toBe("web");
  expect(extension.webOnlyModuleCount).toBe(0);
  expect(web.webOnlyModuleCount).toBeGreaterThan(0);
  for (const report of [extension, web]) {
    expect(report.javascriptBytes).toBeLessThanOrEqual(report.budgets.total);
    expect(report.largestChunkBytes).toBeLessThanOrEqual(report.budgets.chunk);
    expect(report.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0)).toBe(report.javascriptBytes);
  }
});
