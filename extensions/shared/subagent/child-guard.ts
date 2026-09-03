/**
 * Marks a Pi process as a toolkit-spawned subagent. The agent tree is kept
 * flat: a child may not spawn further children (maximum depth one), mirroring
 * the `--tools` allowlist that already strips parent control tools.
 */
export const SUBAGENT_CHILD_ENV = "PI_SUBAGENT_CHILD";

export function isSubagentChild(env: NodeJS.ProcessEnv = process.env): boolean {
	return env[SUBAGENT_CHILD_ENV] === "1";
}

export function assertNotSubagentChild(action: string): void {
	if (isSubagentChild())
		throw new Error(`子 Agent 不能再${action}：子 Agent 嵌套深度上限为 1`);
}
