import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setPiExtensions, SOURCE_EXTENSIONS } from "./extension-entries.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = join(root, "package.json");
const source = await readFile(pkgPath, "utf8");
await writeFile(pkgPath, setPiExtensions(source, SOURCE_EXTENSIONS));
