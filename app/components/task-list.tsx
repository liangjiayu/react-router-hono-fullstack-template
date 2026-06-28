import { useEffect, useState } from "react";

interface Task {
	id: number;
	title: string;
	description: string | null;
	completed: number;
	created_at: string;
}

export function TaskList() {
	const [tasks, setTasks] = useState<Task[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// 新增表单
	const [newTitle, setNewTitle] = useState("");
	const [newDescription, setNewDescription] = useState("");
	const [submitting, setSubmitting] = useState(false);

	// 编辑中的任务
	const [editingId, setEditingId] = useState<number | null>(null);
	const [editTitle, setEditTitle] = useState("");
	const [editDescription, setEditDescription] = useState("");

	async function loadTasks() {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/tasks");
			if (!res.ok) throw new Error("加载失败");
			setTasks(await res.json());
		} catch (e) {
			setError(e instanceof Error ? e.message : "加载失败");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		loadTasks();
	}, []);

	async function handleCreate(e: React.FormEvent) {
		e.preventDefault();
		if (!newTitle.trim()) return;
		setSubmitting(true);
		try {
			const res = await fetch("/api/tasks", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: newTitle, description: newDescription }),
			});
			if (!res.ok) throw new Error("创建失败");
			const task: Task = await res.json();
			setTasks((prev) => [task, ...prev]);
			setNewTitle("");
			setNewDescription("");
		} catch (e) {
			setError(e instanceof Error ? e.message : "创建失败");
		} finally {
			setSubmitting(false);
		}
	}

	async function toggleCompleted(task: Task) {
		try {
			const res = await fetch(`/api/tasks/${task.id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ completed: !task.completed }),
			});
			if (!res.ok) throw new Error("更新失败");
			const updated: Task = await res.json();
			setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
		} catch (e) {
			setError(e instanceof Error ? e.message : "更新失败");
		}
	}

	function startEdit(task: Task) {
		setEditingId(task.id);
		setEditTitle(task.title);
		setEditDescription(task.description ?? "");
	}

	function cancelEdit() {
		setEditingId(null);
		setEditTitle("");
		setEditDescription("");
	}

	async function saveEdit(id: number) {
		if (!editTitle.trim()) return;
		try {
			const res = await fetch(`/api/tasks/${id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: editTitle, description: editDescription }),
			});
			if (!res.ok) throw new Error("更新失败");
			const updated: Task = await res.json();
			setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
			cancelEdit();
		} catch (e) {
			setError(e instanceof Error ? e.message : "更新失败");
		}
	}

	async function handleDelete(id: number) {
		if (!confirm("确定删除这个任务吗?")) return;
		try {
			const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
			if (!res.ok) throw new Error("删除失败");
			setTasks((prev) => prev.filter((t) => t.id !== id));
		} catch (e) {
			setError(e instanceof Error ? e.message : "删除失败");
		}
	}

	return (
		<main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-10 px-4">
			<div className="mx-auto max-w-2xl">
				<h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
					任务列表
				</h1>

				{/* 新增表单 */}
				<form
					onSubmit={handleCreate}
					className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3"
				>
					<input
						type="text"
						value={newTitle}
						onChange={(e) => setNewTitle(e.target.value)}
						placeholder="任务标题"
						className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2 text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500"
					/>
					<textarea
						value={newDescription}
						onChange={(e) => setNewDescription(e.target.value)}
						placeholder="任务描述(可选)"
						rows={2}
						className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2 text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 resize-none"
					/>
					<button
						type="submit"
						disabled={submitting || !newTitle.trim()}
						className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
					>
						{submitting ? "添加中..." : "添加任务"}
					</button>
				</form>

				{error && (
					<div className="mb-4 rounded-lg bg-red-50 dark:bg-red-950 px-4 py-2 text-sm text-red-700 dark:text-red-300">
						{error}
					</div>
				)}

				{/* 列表 */}
				{loading ? (
					<p className="text-gray-500 dark:text-gray-400">加载中...</p>
				) : tasks.length === 0 ? (
					<p className="text-gray-500 dark:text-gray-400">暂无任务,先添加一个吧。</p>
				) : (
					<ul className="space-y-3">
						{tasks.map((task) => (
							<li
								key={task.id}
								className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4"
							>
								{editingId === task.id ? (
									<div className="space-y-3">
										<input
											type="text"
											value={editTitle}
											onChange={(e) => setEditTitle(e.target.value)}
											className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2 text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500"
										/>
										<textarea
											value={editDescription}
											onChange={(e) => setEditDescription(e.target.value)}
											rows={2}
											className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2 text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 resize-none"
										/>
										<div className="flex gap-2">
											<button
												onClick={() => saveEdit(task.id)}
												className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
											>
												保存
											</button>
											<button
												onClick={cancelEdit}
												className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
											>
												取消
											</button>
										</div>
									</div>
								) : (
									<div className="flex items-start gap-3">
										<input
											type="checkbox"
											checked={!!task.completed}
											onChange={() => toggleCompleted(task)}
											className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-blue-600"
										/>
										<div className="flex-1 min-w-0">
											<p
												className={`font-medium ${
													task.completed
														? "line-through text-gray-400 dark:text-gray-600"
														: "text-gray-900 dark:text-gray-100"
												}`}
											>
												{task.title}
											</p>
											{task.description && (
												<p
													className={`text-sm mt-0.5 ${
														task.completed
															? "line-through text-gray-300 dark:text-gray-700"
															: "text-gray-600 dark:text-gray-400"
													}`}
												>
													{task.description}
												</p>
											)}
										</div>
										<div className="flex gap-2 shrink-0">
											<button
												onClick={() => startEdit(task)}
												className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
											>
												编辑
											</button>
											<button
												onClick={() => handleDelete(task.id)}
												className="rounded-lg border border-red-300 dark:border-red-800 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
											>
												删除
											</button>
										</div>
									</div>
								)}
							</li>
						))}
					</ul>
				)}
			</div>
		</main>
	);
}
