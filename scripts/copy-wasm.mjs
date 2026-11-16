// Copies the barcode reader's WebAssembly engine into public/, so the app
// serves it itself instead of depending on a CDN. Runs before dev and build.
// Resolved through barcode-detector so the engine always matches the
// version that library expects.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

/** Walks up to the package's own package.json (skipping dist/cjs markers without a name). */
function packageRoot(entry, name) {
  let dir = path.dirname(entry);
  for (;;) {
    const file = path.join(dir, "package.json");
    if (existsSync(file) && JSON.parse(readFileSync(file, "utf8")).name === name) return dir;
    const up = path.dirname(dir);
    if (up === dir) throw new Error(`Couldn't find the ${name} package.`);
    dir = up;
  }
}

const detectorRoot = packageRoot(require.resolve("barcode-detector/ponyfill"), "barcode-detector");
const zxingRoot = packageRoot(require.resolve("zxing-wasm/reader", { paths: [detectorRoot] }), "zxing-wasm");
mkdirSync("public", { recursive: true });
copyFileSync(path.join(zxingRoot, "dist/reader/zxing_reader.wasm"), "public/zxing_reader.wasm");
console.log("[copy-wasm] public/zxing_reader.wasm is ready.");
