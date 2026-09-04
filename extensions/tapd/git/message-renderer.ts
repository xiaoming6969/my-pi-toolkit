import type {
	ExtensionAPI,
	MessageRenderOptions,
	Theme,
} from "@earendil-works/pi-coding-agent";
import {
	buildGitCard,
	type TapdGitMessageDetails,
} from "./card-live.js";

const MESSAGE_TYPE = "tapd-git-command";

interface TapdGitCustomMessage {
	content: unknown;
	details?: TapdGitMessageDetails;
}

export function registerTapdGitMessageRenderer(pi: ExtensionAPI): void {
	pi.registerMessageRenderer<TapdGitMessageDetails>(
		MESSAGE_TYPE,
		(
			message: TapdGitCustomMessage,
			options: MessageRenderOptions,
			theme: Theme,
		) =>
			buildGitCard(
				message.details,
				typeof message.content === "string" ? message.content : "",
				options.expanded,
				theme,
			),
	);
}
