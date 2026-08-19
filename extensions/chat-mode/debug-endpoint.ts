import { readFile, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, dirname, join, resolve } from "node:path";

export const DEBUG_ENDPOINT_FILENAME = "debug-endpoint.json";
export const DEBUG_LOG_FILENAME = "debug.jsonl";

export interface DebugSessionEndpoint {
	logPath: string;
	endpoint: string;
}

export interface PersistedDebugEndpoint {
	port: number;
	token: string;
}

export function debugLogPathFromArtifact(
	artifactDirectoryOrPlanPath: string,
): string {
	const artifactPath = resolve(artifactDirectoryOrPlanPath);
	const directory =
		basename(artifactPath) === "plan.md" ? dirname(artifactPath) : artifactPath;
	return join(directory, DEBUG_LOG_FILENAME);
}

export function debugEndpointConfigPath(logPath: string): string {
	return join(dirname(logPath), DEBUG_ENDPOINT_FILENAME);
}

export async function readPersistedDebugEndpoint(
	path: string,
): Promise<PersistedDebugEndpoint | undefined> {
	try {
		const value = JSON.parse(
			await readFile(path, "utf8"),
		) as Partial<PersistedDebugEndpoint>;
		if (
			Number.isInteger(value.port) &&
			(value.port ?? 0) > 0 &&
			(value.port ?? 0) <= 65535 &&
			typeof value.token === "string" &&
			/^[a-f0-9]{64}$/.test(value.token)
		) {
			return value as PersistedDebugEndpoint;
		}
	} catch {
		// Missing or invalid metadata gets replaced after binding a new endpoint.
	}
	return undefined;
}

export async function writePersistedDebugEndpoint(
	path: string,
	endpoint: PersistedDebugEndpoint,
): Promise<void> {
	await writeFile(path, `${JSON.stringify(endpoint)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
}

export async function removePersistedDebugEndpoint(path: string): Promise<void> {
	await rm(path, { force: true });
}

export function setDebugCorsHeaders(
	request: IncomingMessage,
	response: ServerResponse,
): boolean {
	const origin = request.headers.origin;
	if (origin) {
		try {
			const hostname = new URL(origin).hostname;
			if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname)) {
				return false;
			}
		} catch {
			return false;
		}
		response.setHeader("Access-Control-Allow-Origin", origin);
		response.setHeader("Vary", "Origin");
	}
	response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
	response.setHeader("Access-Control-Allow-Headers", "Content-Type");
	return true;
}
