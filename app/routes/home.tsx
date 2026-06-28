import type { Route } from "./+types/home";
import { TaskList } from "../components/task-list";

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "任务列表" },
		{ name: "description", content: "一个简单的任务列表 CRUD 应用" },
	];
}

export default function Home() {
	return <TaskList />;
}
