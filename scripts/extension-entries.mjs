export const SOURCE_EXTENSIONS = [
	"./extensions/ming-core/index.ts",
	"./extensions/tapd/index.ts",
	"./extensions/context7/index.ts",
];

export const DIST_EXTENSIONS = [
	"./dist/ming-core.js",
	"./dist/tapd.js",
	"./dist/context7.js",
];

export function setPiExtensions(source, extensions) {
	const items = extensions.map((rel) => `      "${rel}"`).join(",\n");
	if (!/"extensions": \[/.test(source)) {
		throw new Error("package.json is missing pi.extensions");
	}
	return source.replace(/("extensions": \[)[\s\S]*?(\n    \])/, `$1\n${items}$2`);
}
