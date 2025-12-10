
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileText, Pencil, PlusCircle, Trash2 } from "lucide-react";
import { useCallback, useState, useEffect } from "react";
import { EntityPills } from "./entity-pills"
import { MentionInput } from "../mentions/mention-input";
import { MentionEditor } from "../mentions/mention-editor";
import { parseMentions } from "@/hooks/use-mentions";
import { useTRPC } from "@/integrations/trpc/react";
import { ModuleFilter } from "./module-filter";
import { ModuleSort } from "./module-sort";
import type { ModuleProps } from "@/types/dashboard-types";

export function NotesModule(props: ModuleProps) {
	const trpc = useTRPC();

	const [filterJars, setFilterJars] = useState<string[]>(
		(props.config?.filters as any)?.jarIds ?? []
	);
	const [filterTags, setFilterTags] = useState<string[]>(
		(props.config?.filters as any)?.tagIds ?? []
	);
	const [filterSort, setFilterSort] = useState<string>(
		(props.config?.filters as any)?.orderBy ?? 'created_desc'
	);

	// Persist filters
	useEffect(() => {
		const newFilters = {
			jarIds: filterJars,
			tagIds: filterTags,
			orderBy: filterSort,
		}
		const currentFilters = (props.config?.filters as any)

		if (JSON.stringify(newFilters) !== JSON.stringify(currentFilters)) {
			props.onConfigChange?.({
				filters: newFilters
			});
		}
	}, [filterJars, filterTags, filterSort, props.onConfigChange]);

    const getSort = (sortKey: string) => {
      switch (sortKey) {
        case 'created_asc': return [{ field: 'createdAt' as const, direction: 'asc' as const }];
        case 'created_desc': return [{ field: 'createdAt' as const, direction: 'desc' as const }];
        case 'title_asc': return [{ field: 'title' as const, direction: 'asc' as const }];
        case 'title_desc': return [{ field: 'title' as const, direction: 'desc' as const }];
        default: return [{ field: 'createdAt' as const, direction: 'desc' as const }];
      }
    }

	const { data: notes, refetch } = useQuery(
		trpc.notes.list.queryOptions({
			filter: {
				jarIdsAny: filterJars.length > 0 ? filterJars : undefined,
				tagIdsAny: filterTags.length > 0 ? filterTags : undefined,
			},
			sort: getSort(filterSort) as any,
			pagination: { take: 100 },
			include: { jars: true, tags: true },
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

				<div className="flex items-center gap-2">
					<ModuleSort
						options={[
							{ label: 'Newest First', value: 'created_desc' },
							{ label: 'Oldest First', value: 'created_asc' },
							{ label: 'Title (A-Z)', value: 'title_asc' },
							{ label: 'Title (Z-A)', value: 'title_desc' },
						]}
						value={filterSort}
						onSortChange={setFilterSort}
					/>
					<ModuleFilter
						jars={jars ?? []}
						tags={tags ?? []}
						selectedJarIds={filterJars}
						selectedTagIds={filterTags}
						onFilterChange={({ jarIds, tagIds }) => {
							setFilterJars(jarIds);
							setFilterTags(tagIds);
						}}
						showPriority={false}
					/>
				</div>
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

			<ul className="grid grid-cols-1 gap-4">
				{notes?.map((note) => {
					const formattedDate = new Date(note.createdAt).toLocaleDateString(undefined, {
						month: 'short',
						day: 'numeric',
					})

					return (
					<li
						key={note.id}
						className="group relative flex flex-col gap-2 p-3 rounded-lg border bg-white/10 border-white/10 hover:border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/5 transition-all duration-300"
					>
						<div className="flex items-start gap-4">
                             {/* Icon */}
                             <div className="mt-1 w-8 h-8 rounded shrink-0 bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-200">
                                <FileText className="w-4 h-4" />
                             </div>

							<div className="flex-1 min-w-0 flex flex-col gap-1">
								<div className="flex justify-between items-start">
									<h3 className="font-medium text-sm text-gray-100 leading-relaxed">
										{note.title || "Untitled Note"}
									</h3>
								</div>

								{/* biome-ignore lint/security: Rich text content */}
								<div
									className="text-sm text-white/70 line-clamp-3 prose prose-sm prose-invert max-w-none"
									dangerouslySetInnerHTML={{ __html: note.content }}
								/>
                                
                                <EntityPills jars={note.jars} tags={note.tags} />
                                
                                {/* Footer Row: Date & Actions */}
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                                    {/* Left: Date */}
                                    <div className="text-[10px] text-white/30">
                                        {formattedDate}
                                    </div>

                                    {/* Right: Actions */}
                                    <div className="flex gap-1">
                                        <button
                                            type="button"
                                            onClick={() => handleEdit(note)}
                                            className="p-1.5 text-white/40 hover:text-purple-400 hover:bg-purple-400/10 rounded transition-all"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(note.id)}
                                            className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded transition-all"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
							</div>
						</div>
					</li>
					)
				})}
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
