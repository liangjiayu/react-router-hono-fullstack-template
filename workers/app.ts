import { Hono } from "hono";
import { createRequestHandler } from "react-router";

const app = new Hono<{ Bindings: Env }>();

// ===== 任务列表 CRUD 接口 =====

// 获取任务列表(按创建时间倒序)
app.get("/api/tasks", async (c) => {
	const { results } = await c.env.DB.prepare(
		"SELECT * FROM tasks ORDER BY created_at DESC, id DESC",
	).all();
	return c.json(results);
});

// 创建任务
app.post("/api/tasks", async (c) => {
	const body = await c.req.json().catch(() => null);
	const title = body?.title?.trim();
	if (!title) {
		return c.json({ error: "title 不能为空" }, 400);
	}
	const description = body?.description?.trim() ?? "";
	const { results } = await c.env.DB.prepare(
		"INSERT INTO tasks (title, description) VALUES (?, ?) RETURNING *",
	)
		.bind(title, description)
		.all();
	return c.json(results[0], 201);
});

// 更新任务(title / description / completed 均可选)
app.put("/api/tasks/:id", async (c) => {
	const id = Number(c.req.param("id"));
	if (!Number.isInteger(id)) {
		return c.json({ error: "无效的 id" }, 400);
	}
	const body = await c.req.json().catch(() => null);
	if (!body) {
		return c.json({ error: "无效的请求体" }, 400);
	}

	const fields: string[] = [];
	const values: unknown[] = [];
	if (typeof body.title === "string") {
		const title = body.title.trim();
		if (!title) return c.json({ error: "title 不能为空" }, 400);
		fields.push("title = ?");
		values.push(title);
	}
	if (typeof body.description === "string") {
		fields.push("description = ?");
		values.push(body.description.trim());
	}
	if (body.completed !== undefined) {
		fields.push("completed = ?");
		values.push(body.completed ? 1 : 0);
	}
	if (fields.length === 0) {
		return c.json({ error: "没有可更新的字段" }, 400);
	}

	values.push(id);
	const { results } = await c.env.DB.prepare(
		`UPDATE tasks SET ${fields.join(", ")} WHERE id = ? RETURNING *`,
	)
		.bind(...values)
		.all();
	if (results.length === 0) {
		return c.json({ error: "任务不存在" }, 404);
	}
	return c.json(results[0]);
});

// 删除任务
app.delete("/api/tasks/:id", async (c) => {
	const id = Number(c.req.param("id"));
	if (!Number.isInteger(id)) {
		return c.json({ error: "无效的 id" }, 400);
	}
	const { meta } = await c.env.DB.prepare("DELETE FROM tasks WHERE id = ?")
		.bind(id)
		.run();
	if (meta.changes === 0) {
		return c.json({ error: "任务不存在" }, 404);
	}
	return c.json({ success: true });
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
