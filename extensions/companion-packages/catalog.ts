export interface CompanionNpmPackage {
	/** Unpinned Pi install spec, e.g. `npm:pi-lens`. */
	spec: string;
	/** npm package name without version. */
	name: string;
	/** Name shown in the startup dashboard Extensions column. */
	listName: string;
}

export const COMPANION_NPM_PACKAGES: CompanionNpmPackage[] = [
	{
		spec: "npm:@dietrichgebert/ponytail",
		name: "@dietrichgebert/ponytail",
		listName: "ponytail",
	},
	{
		spec: "npm:pi-lens",
		name: "pi-lens",
		listName: "pi-lens",
	},
];

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
