// src/components/modules/notes-module.tsx
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileText, Pencil, PlusCircle, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { MentionInput } from "../mentions/mention-input";
import { MentionEditor } from "../mentions/mention-editor";
import { parseMentions } from "@/hooks/use-mentions";
import { useTRPC } from "@/integrations/trpc/react";
import { ModuleFilter } from "./module-filter";
import type { ModuleProps } from "@/types/dashboard-types";

export function NotesModule(_props: ModuleProps) {
	const trpc = useTRPC();

	const [filterJars, setFilterJars] = useState<string[]>([]);
	const [filterTags, setFilterTags] = useState<string[]>([]);

	const { data: notes, refetch } = useQuery(
		trpc.notes.list.queryOptions({
			jarIds: filterJars,
			tagIds: filterTags,
		}),
	);
	const { data: jars } = useQuery(trpc.jars.list.queryOptions());
	const { data: tags } = useQuery(trpc.tags.list.queryOptions());

	const [title, setTitle] = useState("");
	const [contentHtml, setContentHtml] = useState("");
	const [contentText, setContentText] = useState("");
	const [editorKey, setEditorKey] = useState(0);
	const [showAddForm, setShowAddForm] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);

	const { mutate: addNote } = useMutation({
		...trpc.notes.create.mutationOptions(),
		onSuccess: () => {
			refetch();
			resetForm();
		},
	});

	const { mutate: updateNote } = useMutation({
		...trpc.notes.update.mutationOptions(),
		onSuccess: () => {
			refetch();
			resetForm();
		},
	});

	const { mutate: deleteNote } = useMutation({
		...trpc.notes.delete.mutationOptions(),
		onSuccess: () => {
			refetch();
		},
	});

	const resetForm = useCallback(() => {
		setTitle("");
		setContentHtml("");
		setContentText("");
		setEditorKey((k) => k + 1);
		setEditingId(null);
	}, []);

	const handleSubmit = useCallback(() => {
		if (!contentHtml && !title.trim()) return;

		// Parse mentions for logging/debugging (backend does the real link work)
		const { jars: jarsFromTitle, tags: tagsFromTitle } = parseMentions(title);
		const { jars: jarsFromContent, tags: tagsFromContent } =
			parseMentions(contentText);

		// Combine names
		const jarNames = Array.from(
			new Set([...jarsFromTitle, ...jarsFromContent]),
		);
		const tagNames = Array.from(
			new Set([...tagsFromTitle, ...tagsFromContent]),
		);

		if (editingId) {
			updateNote({
				id: editingId,
				title: title || undefined,
				content: contentHtml,
				jars: jarNames.length ? jarNames : undefined,
				tags: tagNames.length ? tagNames : undefined,
			});
		} else {
			addNote({
				title: title || undefined,
				content: contentHtml,
				jars: jarNames.length ? jarNames : undefined,
				tags: tagNames.length ? tagNames : undefined,
			});
		}
	}, [title, contentHtml, contentText, editingId, addNote, updateNote]);

	const handleEdit = useCallback((note: NonNullable<typeof notes>[number]) => {
		setEditingId(note.id);
		setTitle(note.title || "");
		setContentHtml(note.content);
		setContentText(note.content.replace(/<[^>]*>?/gm, "")); // Rough text extraction for connection logic if needed
		setEditorKey((k) => k + 1);
		setShowAddForm(true);
	}, []);

	const handleDelete = useCallback(
		(id: string) => {
			if (confirm("Are you sure you want to delete this note?")) {
				deleteNote({ id });
			}
		},
		[deleteNote],
	);



	return (
		<div className="flex flex-col gap-4">
			{/* Add/Edit Toggle */}
			<div className="flex items-center justify-between">
				<button
					type="button"
					onClick={() => {
						setShowAddForm(!showAddForm);
						if (showAddForm) resetForm();
					}}
					className="flex items-center gap-2 text-white/70 hover:text-purple-400 transition-colors text-sm self-start group"
				>
					<PlusCircle
						className={`w-5 h-5 transition-transform duration-300 ${showAddForm ? "rotate-45" : ""}`}
					/>
					<span className="font-medium">
						{showAddForm ? "Hide" : editingId ? "Edit Note" : "Add New Note"}
					</span>
				</button>

				<ModuleFilter
					jars={jars ?? []}
					tags={tags ?? []}
					onFilterChange={({ jarIds, tagIds }) => {
						setFilterJars(jarIds);
						setFilterTags(tagIds);
					}}
					showPriority={false}
				/>
			</div>

			{/* Form */}
			{showAddForm && (
				<div className="flex flex-col gap-3 relative animate-in slide-in-from-top-2 fade-in duration-300">
					<MentionInput
						value={title}
						onChange={(val) => setTitle(val)}
						jars={jars ?? []}
						tags={tags ?? []}
						placeholder="Title (optional)"
						className="w-full px-4 py-3 rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-transparent transition-all font-medium"
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								handleSubmit();
							}
						}}
					/>

					<div className="relative">
						<MentionEditor
							key={editorKey}
							ref={null}
							jars={jars ?? []}
							tags={tags ?? []}
							showToolbar={false}
							onHTMLChange={setContentHtml}
							onTextChange={setContentText}
							initialContent={contentHtml}
							className="w-full"
							editorClassName="focus:ring-2 focus:ring-purple-400/50 min-h-[150px]"
						/>
					</div>

					<div className="flex gap-2">
						<button
							type="button"
							disabled={!contentHtml && !title.trim()}
							onClick={handleSubmit}
							className="flex-1 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 disabled:from-purple-500/50 disabled:to-purple-600/50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-all shadow-lg shadow-purple-500/20"
						>
							{editingId ? "Update Note" : "Add Note"}
						</button>
						{editingId && (
							<button
								type="button"
								onClick={resetForm}
								className="px-4 py-3 rounded-lg border border-white/10 bg-white/5 text-white/70 hover:text-white hover:border-white/20 transition-all"
							>
								Cancel
							</button>
						)}
					</div>
				</div>
			)}

			{/* List */}
			<ul className="grid grid-cols-1 gap-4">
				{notes?.map((note) => (
					<li
						key={note.id}
						className="bg-white/5 border border-white/10 rounded-lg p-4 backdrop-blur-sm shadow-md hover:border-purple-400/30 transition-all flex flex-col gap-2 relative group-item"
					>
						<div className="flex justify-between items-start gap-2">
							<div className="flex-1 min-w-0">
								{note.title && (
									<h3 className="text-white font-semibold truncate mb-1">
										{note.title}
									</h3>
								)}
								{/* biome-ignore lint/security: Rich text content */}
								<div
									className="text-sm text-white/70 line-clamp-3 prose prose-sm prose-invert max-w-none"
									dangerouslySetInnerHTML={{ __html: note.content }}
								/>
							</div>
							<div className="flex gap-1 flex-shrink-0">
								<button
									type="button"
									onClick={() => handleEdit(note)}
									className="p-1.5 text-white/40 hover:text-purple-400 transition-colors"
								>
									<Pencil className="w-4 h-4" />
								</button>
								<button
									type="button"
									onClick={() => handleDelete(note.id)}
									className="p-1.5 text-white/40 hover:text-red-400 transition-colors"
								>
									<Trash2 className="w-4 h-4" />
								</button>
							</div>
						</div>

						{/* Tags/Jars */}
						{(note.jars.length > 0 || note.tags.length > 0) && (
							<div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-white/5">
								{note.jars.map((j) => (
									<span
										key={j.id}
										className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20"
									>
										@{j.name}
									</span>
								))}
								{note.tags.map((t) => (
									<span
										key={t.id}
										className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20"
									>
										#{t.name}
									</span>
								))}
							</div>
						)}
					</li>
				))}
			</ul>

			{notes?.length === 0 && !showAddForm && (
				<div className="text-center py-10 text-white/40">
					<FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
					<p>No notes yet</p>
				</div>
			)}
		</div>
	);
}
