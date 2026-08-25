import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { parseRpcEvent, type RpcEvent } from "./rpc-protocol.js";

export class RpcProcessStream {
	private buffer = "";
	private stderr = "";

	constructor(
		private readonly child: ChildProcessWithoutNullStreams,
		private readonly onEvent: (event: RpcEvent) => void,
		private readonly onError: (error: Error) => void,
		private readonly onClose: (code: number | null, stderr: string) => void,
	) {}

	attach(): void {
		this.child.stdout.on("data", (data) => this.consume(data.toString()));
		this.child.stderr.on("data", (data) => {
			this.stderr += data.toString();
		});
		this.child.on("error", this.onError);
		this.child.on("close", (code) => {
			if (this.buffer.trim()) this.emit(this.buffer.replace(/\r$/, ""));
			this.buffer = "";
			this.onClose(code, this.stderr.trim());
		});
	}

	private consume(chunk: string): void {
		this.buffer += chunk;
		const records = this.buffer.split("\n");
		this.buffer = records.pop() ?? "";
		for (const record of records) this.emit(record.replace(/\r$/, ""));
	}

	private emit(record: string): void {
		const event = parseRpcEvent(record);
		if (event) this.onEvent(event);
	}
}
