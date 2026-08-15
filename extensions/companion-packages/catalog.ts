import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface CompanionNpmPackage {
	/** Unpinned Pi install spec, e.g. `npm:pi-lens`. */
	spec: string;
	/** npm package name without version. */
	name: string;
	/** Name shown in the startup dashboard Extensions column. */
	listName: string;
}

const catalogPath = join(dirname(fileURLToPath(import.meta.url)), "catalog.json");

export const COMPANION_NPM_PACKAGES: CompanionNpmPackage[] = JSON.parse(
	readFileSync(catalogPath, "utf8"),
) as CompanionNpmPackage[];

export function npmNameFromSource(source: string): string | undefined {
	if (!source.startsWith("npm:")) return undefined;
	const spec = source.slice("npm:".length);
	if (spec.startsWith("@")) {
		const match = spec.match(/^(@[^/]+\/[^@]+)(?:@.+)?$/);
		return match?.[1];
	}
	const name = spec.split("@")[0];
	return name || undefined;
}
