import { build } from "esbuild";
import { expect, test } from "@playwright/test";

test("the search worker returns a legal winning move and respects a real deadline", async ({
  page,
}) => {
  const workerBundle = await build({
    entryPoints: ["src/ai/search-worker.ts"],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    write: false,
  });
  const clientBundle = await build({
    stdin: {
      contents: `import { runWorker } from "./src/ai/worker-client"; globalThis.runAiTest = runWorker;`,
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
  });
  await page.goto("http://127.0.0.1:4173");
  await page.addScriptTag({ type: "module", content: clientBundle.outputFiles[0]!.text });
  await page.waitForFunction(() => "runAiTest" in globalThis);
  const result = await page.evaluate(async (source) => {
    const run = (
      globalThis as unknown as {
        runAiTest: (factory: () => Worker, task: unknown, ms: number) => Promise<{ move: number }>;
      }
    ).runAiTest;
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    try {
      return await run(
        () => new Worker(url),
        {
          kind: "three-in-row",
          position: { cells: [1, 1, 0, -1, -1, 0, 0, 0, 0], turn: 1 },
          method: "minimax",
          depth: 9,
          maxNodes: 100_000,
          simulations: 100,
          seed: 2,
        },
        1000,
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }, workerBundle.outputFiles[0]!.text);
  expect(result.move).toBe(2);
  const timeoutName = await page.evaluate(async () => {
    const run = (
      globalThis as unknown as {
        runAiTest: (factory: () => Worker, task: unknown, ms: number) => Promise<unknown>;
      }
    ).runAiTest;
    const url = URL.createObjectURL(
      new Blob(["onmessage = () => {}"], { type: "text/javascript" }),
    );
    try {
      await run(() => new Worker(url), {}, 30);
      return "no timeout";
    } catch (error) {
      return (error as Error).name;
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  expect(timeoutName).toBe("AIWorkerTimeout");
});
