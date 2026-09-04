import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExtensions } from "./build-extensions.mjs";
import { DIST_EXTENSIONS, setPiExtensions } from "./extension-entries.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = join(root, "package.json");

await buildExtensions();
const source = await readFile(pkgPath, "utf8");
await writeFile(pkgPath, setPiExtensions(source, DIST_EXTENSIONS));
