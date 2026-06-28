import type { Route } from "./+types/home";
import { Chat } from "../components/chat";

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "DeepSeek 对话" },
		{ name: "description", content: "基于 DeepSeek 的 AI 对话助手" },
	];
}

export default function Home() {
	return <Chat />;
}
