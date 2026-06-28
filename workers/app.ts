import { Hono } from "hono";
import { createRequestHandler } from "react-router";

const app = new Hono<{ Bindings: Env }>();

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

// ===== 会话管理接口 =====

// 会话列表(按最近更新倒序)
app.get("/api/conversations", async (c) => {
	const { results } = await c.env.DB.prepare(
		"SELECT * FROM conversations ORDER BY updated_at DESC, id DESC",
	).all();
	return c.json(results);
});

// 新建会话
app.post("/api/conversations", async (c) => {
	const { results } = await c.env.DB.prepare(
		"INSERT INTO conversations DEFAULT VALUES RETURNING *",
	).all();
	return c.json(results[0], 201);
});

// 删除会话(先删消息,再删会话)
app.delete("/api/conversations/:id", async (c) => {
	const id = Number(c.req.param("id"));
	if (!Number.isInteger(id)) {
		return c.json({ error: "无效的 id" }, 400);
	}
	await c.env.DB.prepare("DELETE FROM messages WHERE conversation_id = ?")
		.bind(id)
		.run();
	const { meta } = await c.env.DB.prepare(
		"DELETE FROM conversations WHERE id = ?",
	)
		.bind(id)
		.run();
	if (meta.changes === 0) {
		return c.json({ error: "会话不存在" }, 404);
	}
	return c.json({ success: true });
});

// 会话内的消息(按时间正序)
app.get("/api/conversations/:id/messages", async (c) => {
	const id = Number(c.req.param("id"));
	if (!Number.isInteger(id)) {
		return c.json({ error: "无效的 id" }, 400);
	}
	const { results } = await c.env.DB.prepare(
		"SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC",
	)
		.bind(id)
		.all();
	return c.json(results);
});

// ===== 对话流式接口 =====

app.post("/api/chat", async (c) => {
	const body = await c.req.json().catch(() => null);
	const conversationId = Number(body?.conversationId);
	const content = body?.content?.trim();
	if (!Number.isInteger(conversationId)) {
		return c.json({ error: "无效的 conversationId" }, 400);
	}
	if (!content) {
		return c.json({ error: "content 不能为空" }, 400);
	}

	// 确认会话存在
	const conv = await c.env.DB.prepare(
		"SELECT * FROM conversations WHERE id = ?",
	)
		.bind(conversationId)
		.first<{ id: number; title: string }>();
	if (!conv) {
		return c.json({ error: "会话不存在" }, 404);
	}

	// 落库用户消息
	await c.env.DB.prepare(
		"INSERT INTO messages (conversation_id, role, content) VALUES (?, 'user', ?)",
	)
		.bind(conversationId, content)
		.run();

	// 首条消息时,用其内容生成会话标题
	if (conv.title === "新对话") {
		const title = content.slice(0, 20);
		await c.env.DB.prepare("UPDATE conversations SET title = ? WHERE id = ?")
			.bind(title, conversationId)
			.run();
	}

	// 组装历史消息(含刚插入的用户消息)
	const { results: history } = await c.env.DB.prepare(
		"SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id ASC",
	)
		.bind(conversationId)
		.all<{ role: string; content: string }>();

	// 请求 DeepSeek(流式)
	const upstream = await fetch(DEEPSEEK_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${c.env.DEEPSEEK_API_KEY}`,
		},
		body: JSON.stringify({
			model: DEEPSEEK_MODEL,
			stream: true,
			messages: history.map((m) => ({ role: m.role, content: m.content })),
		}),
	});

	if (!upstream.ok || !upstream.body) {
		const detail = await upstream.text().catch(() => "");
		return c.json({ error: "DeepSeek 请求失败", detail }, 502);
	}

	const db = c.env.DB;
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();

	const stream = new ReadableStream({
		async start(controller) {
			const reader = upstream.body!.getReader();
			let buffer = "";
			let full = "";

			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });

					// 按行解析 SSE
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";
					for (const line of lines) {
						const trimmed = line.trim();
						if (!trimmed.startsWith("data:")) continue;
						const data = trimmed.slice(5).trim();
						if (data === "[DONE]") continue;
						try {
							const json = JSON.parse(data);
							const delta: string =
								json.choices?.[0]?.delta?.content ?? "";
							if (delta) {
								full += delta;
								controller.enqueue(encoder.encode(delta));
							}
						} catch {
							// 忽略解析失败的分片
						}
					}
				}
			} catch (err) {
				controller.enqueue(
					encoder.encode(`\n\n[流式中断] ${String(err)}`),
				);
			} finally {
				// 落库助手回复
				if (full) {
					await db
						.prepare(
							"INSERT INTO messages (conversation_id, role, content) VALUES (?, 'assistant', ?)",
						)
						.bind(conversationId, full)
						.run();
				}
				await db
					.prepare(
						"UPDATE conversations SET updated_at = datetime('now') WHERE id = ?",
					)
					.bind(conversationId)
					.run();
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "no-cache",
			"X-Accel-Buffering": "no",
		},
	});
});

// ===== 交给 React Router 处理页面请求 =====
app.get("*", (c) => {
	const requestHandler = createRequestHandler(
		() => import("virtual:react-router/server-build"),
		import.meta.env.MODE,
	);

	return requestHandler(c.req.raw, {
		cloudflare: { env: c.env, ctx: c.executionCtx },
	});
});

export default app;
