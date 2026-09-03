import {
	activeSubagentCount,
	subscribeSubagentRegistry,
} from "../shared/subagent/registry.js";

/**
 * Wall-clock time during which at least one subagent child was running, plus
 * the number of distinct children observed, accumulated between reset() and
 * snapshot(). Overlapping children are not double counted.
 */
export class SubagentTimeTracker {
	private busySince: number | undefined;
	private accumulatedMs = 0;
	private peak = 0;
	private unsubscribe: (() => void) | undefined;

	constructor(
		private readonly now: () => number,
		private readonly activeCount: () => number = activeSubagentCount,
		subscribe: (listener: () => void) => () => void = subscribeSubagentRegistry,
	) {
		this.unsubscribe = subscribe(() => this.observe());
	}

	reset(): void {
		this.accumulatedMs = 0;
		this.peak = 0;
		this.busySince = undefined;
		this.observe();
	}

	observe(): void {
		const active = this.activeCount();
		this.peak = Math.max(this.peak, active);
		const now = this.now();
		if (active > 0 && this.busySince === undefined) this.busySince = now;
		if (active === 0 && this.busySince !== undefined) {
			this.accumulatedMs += Math.max(0, now - this.busySince);
			this.busySince = undefined;
		}
	}

	snapshot(): { subagentMs: number; peakSubagents: number } {
		const running =
			this.busySince === undefined ? 0 : Math.max(0, this.now() - this.busySince);
		return {
			subagentMs: this.accumulatedMs + running,
			peakSubagents: this.peak,
		};
	}

	dispose(): void {
		this.unsubscribe?.();
		this.unsubscribe = undefined;
	}
}
