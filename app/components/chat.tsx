import { useEffect, useRef, useState } from "react";
import { Plus, Send, Trash2, MessageSquare, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { cn } from "../lib/utils";

interface Conversation {
	id: number;
	title: string;
	created_at: string;
	updated_at: string;
}

interface Message {
	id?: number;
	role: "user" | "assistant";
	content: string;
}

export function Chat() {
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [activeId, setActiveId] = useState<number | null>(null);
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState("");
	const [streaming, setStreaming] = useState(false);

	const scrollRef = useRef<HTMLDivElement>(null);

	// 加载会话列表
	async function loadConversations() {
		const res = await fetch("/api/conversations");
		const data: Conversation[] = await res.json();
		setConversations(data);
		return data;
	}

	// 加载某会话消息
	async function loadMessages(id: number) {
		const res = await fetch(`/api/conversations/${id}/messages`);
		const data: Message[] = await res.json();
		setMessages(data);
	}

	useEffect(() => {
		loadConversations().then((list) => {
			if (list.length > 0) {
				setActiveId(list[0].id);
				loadMessages(list[0].id);
			}
		});
	}, []);

	// 自动滚到底部
	useEffect(() => {
		scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
	}, [messages]);

	async function handleNewConversation() {
		const res = await fetch("/api/conversations", { method: "POST" });
		const conv: Conversation = await res.json();
		setConversations((prev) => [conv, ...prev]);
		setActiveId(conv.id);
		setMessages([]);
	}

	async function handleSelect(id: number) {
		if (id === activeId || streaming) return;
		setActiveId(id);
		await loadMessages(id);
	}

	async function handleDelete(id: number, e: React.MouseEvent) {
		e.stopPropagation();
		if (!confirm("确定删除这个会话吗?")) return;
		await fetch(`/api/conversations/${id}`, { method: "DELETE" });
		const rest = conversations.filter((c) => c.id !== id);
		setConversations(rest);
		if (activeId === id) {
			if (rest.length > 0) {
				setActiveId(rest[0].id);
				loadMessages(rest[0].id);
			} else {
				setActiveId(null);
				setMessages([]);
			}
		}
	}

	async function handleSend() {
		const content = input.trim();
		if (!content || streaming) return;

		// 没有会话时先创建一个
		let convId = activeId;
		if (convId == null) {
			const res = await fetch("/api/conversations", { method: "POST" });
			const conv: Conversation = await res.json();
			setConversations((prev) => [conv, ...prev]);
			setActiveId(conv.id);
			convId = conv.id;
		}

		setInput("");
		setMessages((prev) => [
			...prev,
			{ role: "user", content },
			{ role: "assistant", content: "" },
		]);
		setStreaming(true);

		try {
			const res = await fetch("/api/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ conversationId: convId, content }),
			});

			if (!res.ok || !res.body) {
				const err = (await res.json().catch(() => ({}))) as {
					error?: string;
				};
				throw new Error(err.error || "请求失败");
			}

			// 逐块读取 → 打字机效果
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				const chunk = decoder.decode(value, { stream: true });
				setMessages((prev) => {
					const next = [...prev];
					next[next.length - 1] = {
						...next[next.length - 1],
						content: next[next.length - 1].content + chunk,
					};
					return next;
				});
			}
			// 刷新会话列表(标题/排序可能更新)
			loadConversations();
		} catch (e) {
			setMessages((prev) => {
				const next = [...prev];
				next[next.length - 1] = {
					role: "assistant",
					content: `❌ ${e instanceof Error ? e.message : "出错了"}`,
				};
				return next;
			});
		} finally {
			setStreaming(false);
		}
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	return (
		<div className="flex h-screen bg-background text-foreground">
			{/* 侧边栏 */}
			<aside className="flex w-64 shrink-0 flex-col border-r border-border bg-secondary/30">
				<div className="p-3">
					<Button onClick={handleNewConversation} className="w-full">
						<Plus /> 新建对话
					</Button>
				</div>
				<div className="flex-1 overflow-y-auto px-2 pb-2">
					{conversations.length === 0 ? (
						<p className="px-2 py-4 text-center text-sm text-muted-foreground">
							还没有对话
						</p>
					) : (
						conversations.map((conv) => (
							<div
								key={conv.id}
								onClick={() => handleSelect(conv.id)}
								className={cn(
									"group mb-1 flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm",
									conv.id === activeId
										? "bg-accent text-accent-foreground"
										: "hover:bg-accent/50",
								)}
							>
								<MessageSquare className="size-4 shrink-0 text-muted-foreground" />
								<span className="flex-1 truncate">{conv.title}</span>
								<button
									onClick={(e) => handleDelete(conv.id, e)}
									className="opacity-0 transition-opacity group-hover:opacity-100"
									title="删除"
								>
									<Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
								</button>
							</div>
						))
					)}
				</div>
			</aside>

			{/* 对话区 */}
			<main className="flex flex-1 flex-col">
				<header className="border-b border-border px-6 py-3">
					<h1 className="text-base font-semibold">DeepSeek 对话</h1>
				</header>

				<div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
					<div className="mx-auto max-w-3xl space-y-6">
						{messages.length === 0 ? (
							<div className="mt-20 text-center text-muted-foreground">
								<MessageSquare className="mx-auto mb-3 size-10 opacity-40" />
								<p>开始一段新的对话吧</p>
							</div>
						) : (
							messages.map((m, i) => (
								<div
									key={i}
									className={cn(
										"flex",
										m.role === "user" ? "justify-end" : "justify-start",
									)}
								>
									<div
										className={cn(
											"max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
											m.role === "user"
												? "bg-primary text-primary-foreground"
												: "bg-secondary text-secondary-foreground",
										)}
									>
										{m.role === "assistant" ? (
											m.content ? (
												<div className="prose-chat">
													<ReactMarkdown remarkPlugins={[remarkGfm]}>
														{m.content}
													</ReactMarkdown>
												</div>
											) : (
												<Loader2 className="size-4 animate-spin" />
											)
										) : (
											<span className="whitespace-pre-wrap">{m.content}</span>
										)}
									</div>
								</div>
							))
						)}
					</div>
				</div>

				{/* 输入框 */}
				<div className="border-t border-border px-4 py-4">
					<div className="mx-auto flex max-w-3xl items-end gap-2">
						<Textarea
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="输入消息,Enter 发送 / Shift+Enter 换行"
							rows={1}
							disabled={streaming}
							className="max-h-40 resize-none"
						/>
						<Button
							onClick={handleSend}
							disabled={streaming || !input.trim()}
							size="icon"
						>
							{streaming ? (
								<Loader2 className="animate-spin" />
							) : (
								<Send />
							)}
						</Button>
					</div>
				</div>
			</main>
		</div>
	);
}
