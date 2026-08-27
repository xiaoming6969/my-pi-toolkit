import test from "node:test";
import assert from "node:assert/strict";
import { release } from "node:os";
import {
	canUseWindowsGitFallback,
	prefersWindowsGit,
	shouldRetryCommitWithWindowsGit,
	windowsGitExecutable,
} from "../git/git-runtime.ts";

function restoreEnv(name: string, previous: string | undefined): void {
	if (previous === undefined) delete process.env[name];
	else process.env[name] = previous;
}

test("windowsGitExecutable reads TAPD_WINDOWS_GIT_PATH", () => {
	const previous = process.env.TAPD_WINDOWS_GIT_PATH;
	try {
		delete process.env.TAPD_WINDOWS_GIT_PATH;
		assert.equal(windowsGitExecutable(), "git.exe");
		process.env.TAPD_WINDOWS_GIT_PATH = "  /mnt/c/Git/cmd/git.exe  ";
		assert.equal(windowsGitExecutable(), "/mnt/c/Git/cmd/git.exe");
	} finally {
		restoreEnv("TAPD_WINDOWS_GIT_PATH", previous);
	}
});

test("Windows git retry is gated on the WSL fallback", () => {
	const previous = process.env.WSL_INTEROP;
	const crlf = new Error("/usr/bin/env: bash\r: No such file or directory");
	try {
		process.env.WSL_INTEROP = "/run/WSL/1_interop";
		assert.equal(canUseWindowsGitFallback(), process.platform === "linux");
		assert.equal(
			shouldRetryCommitWithWindowsGit(crlf),
			process.platform === "linux",
		);
		assert.equal(shouldRetryCommitWithWindowsGit(new Error("other")), false);

		delete process.env.WSL_INTEROP;
		if (!/microsoft/i.test(release())) {
			assert.equal(canUseWindowsGitFallback(), false);
			assert.equal(shouldRetryCommitWithWindowsGit(crlf), false);
			assert.equal(prefersWindowsGit("/tmp/repo"), false);
		}
	} finally {
		restoreEnv("WSL_INTEROP", previous);
	}
});
