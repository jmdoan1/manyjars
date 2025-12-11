// src/lib/module-registry.ts

import { Archive, Bot, CheckSquare, Hash, NotebookPen } from "lucide-react";
import { ChatModule } from "@/components/modules/chat-module";
import { JarsModule } from "@/components/modules/jars-module";
import { NotesModule } from "@/components/modules/notes-module";
import { TagsModule } from "@/components/modules/tags-module";
import { TodosModule } from "@/components/modules/todos-module";
import type { ModuleDefinition } from "@/types/dashboard-types";

/**
 * Registry of all available dashboard modules
 */
export const MODULE_REGISTRY: ModuleDefinition[] = [
	{
		type: "todos",
		name: "Todos",
		description: "Manage your tasks with jars, tags, and priorities",
		icon: CheckSquare,
		component: TodosModule,
		defaultSize: {
			width: 1,
			height: 1,
		},
	},
	{
		type: "jars",
		name: "Jars",
		description: "Manage your jars with rich descriptions",
		icon: Archive,
		component: JarsModule,
		defaultSize: {
			width: 1,
			height: 1,
		},
	},
	{
		type: "tags",
		name: "Tags",
		description: "Manage your tags with rich descriptions",
		icon: Hash,
		component: TagsModule,
		defaultSize: {
			width: 1,
			height: 1,
		},
	},
	{
		type: "notes",
		name: "Notes",
		description: "Quick notes with rich text and mentions",
		icon: NotebookPen,
		component: NotesModule,
		defaultSize: {
			width: 2,
			height: 2,
		},
	},
	{
		type: "chat",
		name: "AI Chat",
		description: "Chat with AI to manage your data",
		icon: Bot,
		component: ChatModule,
		defaultSize: {
			width: 1,
			height: 2,
		},
	},
];

