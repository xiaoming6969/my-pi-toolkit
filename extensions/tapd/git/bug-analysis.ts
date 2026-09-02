import { git } from "./repository.js";

export interface IntroducedCommitCandidate {
	hash: string;
	shortHash: string;
	date: string;
	author: string;
	subject: string;
}

const UNLOCATED = /^(未能定位|无法定位|unknown|none)$/i;

export async function candidateFromHash(
	cwd: string,
	hash: string,
): Promise<IntroducedCommitCandidate> {
	await git(cwd, ["cat-file", "-e", `${hash}^{commit}`]);
	await git(cwd, ["merge-base", "--is-ancestor", hash, "HEAD"]);
	const fullHash = await git(cwd, ["rev-parse", hash]);
	const metadata = await git(cwd, [
		"show",
		"-s",
		"--format=%h%x09%ad%x09%an%x09%s",
		"--date=short",
		fullHash,
	]);
	const [shortHash, date, author, ...subject] = metadata.split("\t");
	return {
		hash: fullHash,
		shortHash,
		date,
		author,
		subject: subject.join("\t"),
	};
}

export async function resolveIntroducedCommit(
	cwd: string,
	value: string | undefined,
): Promise<IntroducedCommitCandidate | undefined> {
	const hash = value?.trim().split(/\s+/)[0] ?? "";
	if (!hash || UNLOCATED.test(hash) || !/^[0-9a-f]{7,40}$/i.test(hash))
		return undefined;
	try {
		return await candidateFromHash(cwd, hash);
	} catch {
		return undefined;
	}
}
