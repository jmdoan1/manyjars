// src/components/modules/notes-module.tsx

import { useMutation, useQuery } from "@tanstack/react-query";
import { FileText, Pencil, PlusCircle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import getCaretCoordinates from "textarea-caret";
import { NovelEditor, type NovelEditorHandle } from "@/components/novel-editor";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	type ActiveMention,
	getActiveMention,
	type MentionPosition,
	parseMentions,
} from "@/hooks/use-mentions";
import { useTRPC } from "@/integrations/trpc/react";
import type { ModuleProps } from "@/types/dashboard-types";

export function NotesModule(_props: ModuleProps) {
	const trpc = useTRPC();

	const { data: notes, refetch } = useQuery(trpc.notes.list.queryOptions());
	const { data: jars } = useQuery(trpc.jars.list.queryOptions());
	const { data: tags } = useQuery(trpc.tags.list.queryOptions());

	const [title, setTitle] = useState("");
	const [contentHtml, setContentHtml] = useState("");
	const [contentText, setContentText] = useState("");
	const [editorKey, setEditorKey] = useState(0);
	const [showAddForm, setShowAddForm] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);

	// Mention state
	const [activeField, setActiveField] = useState<"title" | "content">("title");
	const [activeMention, setActiveMention] = useState<ActiveMention | null>(
		null,
	);
	const [mentionPos, setMentionPos] = useState<MentionPosition | null>(null);
	const [highlightedIndex, setHighlightedIndex] = useState(-1);

	const titleRef = useRef<HTMLInputElement | null>(null);
	const contentEditorRef = useRef<NovelEditorHandle | null>(null);

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
		setActiveMention(null);
		setMentionPos(null);
		setHighlightedIndex(-1);
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

	// --- Mention Logic ---

	// Title Input Mention
	const updateTitleMentionState = useCallback(() => {
		const el = titleRef.current;
		if (!el) return;

		const value = el.value;
		const caret = el.selectionStart ?? value.length;
		const mention = getActiveMention(value, caret);

		if (activeField === "title") {
			setActiveMention(mention);
			if (mention) {
				const coords = getCaretCoordinates(el, caret);
				setMentionPos({ top: coords.top + 20, left: coords.left });
			} else {
				setMentionPos(null);
			}
		}
	}, [activeField]);

	const handleTitleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			setTitle(e.target.value);
			setActiveField("title");
			requestAnimationFrame(updateTitleMentionState);
		},
		[updateTitleMentionState],
	);

	// Content Editor Mention
	const handleContentMentionChange = useCallback(
		(mention: ActiveMention | null, position: MentionPosition | null) => {
			setActiveField("content");
			setActiveMention(mention);
			setMentionPos(position);
			if (mention) setHighlightedIndex(0);
		},
		[],
	);

	// Suggestions
	const query = activeMention?.query ?? "";

	// Combine jars and tags for suggestion list
	const suggestionList = useMemo(() => {
		if (!activeMention) return [];
		const list =
			activeMention.type === "jar"
				? (jars ?? [])
				: activeMention.type === "tag"
					? (tags ?? [])
					: [];
		if (!query) return list.slice(0, 5);
		return list
			.filter((item) => item.name.toLowerCase().startsWith(query.toLowerCase()))
			.slice(0, 5);
	}, [activeMention, jars, tags, query]);

	type Row =
		| { kind: "typed"; label: string; description: string }
		| {
				kind: "suggestion";
				item: { id: string; name: string; description?: string | null };
		  };

	const rows: Row[] = useMemo(() => {
		const r: Row[] = [];
		if (!activeMention) return r;

		if (query) {
			const prefix = activeMention.type === "jar" ? "@" : "#";
			r.push({
				kind: "typed",
				label: `${prefix}${query}`,
				description: activeMention.type === "jar" ? "New jar" : "New tag",
			});
		}
		for (const item of suggestionList) {
			r.push({ kind: "suggestion", item });
		}
		return r;
	}, [activeMention, query, suggestionList]);

	// Reset highlight when rows change
	useEffect(() => {
		if (activeMention && rows.length > 0) setHighlightedIndex(0);
		else setHighlightedIndex(-1);
	}, [activeMention, rows.length]);

	const applyMention = useCallback(
		(name: string) => {
			if (!activeMention) return;

			const prefix = activeMention.type === "jar" ? "@" : "#";
			const replacement = `${prefix}${name} `;

			if (activeField === "title") {
				const current = title;
				const before = current.slice(0, activeMention.start);
				const after = current.slice(activeMention.end);
				const newValue = `${before}${replacement}${after}`;
				setTitle(newValue);
				setActiveMention(null);
				setMentionPos(null);

				requestAnimationFrame(() => {
					const el = titleRef.current;
					if (el) {
						const pos = before.length + replacement.length;
						el.focus();
						el.setSelectionRange(pos, pos);
					}
				});
			} else {
				// Content editor
				contentEditorRef.current?.replaceText(
					activeMention.start,
					activeMention.end,
					replacement,
				);
				setActiveMention(null);
				setMentionPos(null);
			}
		},
		[activeMention, activeField, title],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent | KeyboardEvent) => {
			if (!activeMention || rows.length === 0) return false;

			if (e.key === "ArrowDown") {
				e.preventDefault();
				setHighlightedIndex((prev) => (prev < rows.length - 1 ? prev + 1 : 0));
				return true;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : rows.length - 1));
				return true;
			}
			if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) {
				e.preventDefault(); // Important for forms
				const idx = highlightedIndex >= 0 ? highlightedIndex : 0;
				const row = rows[idx];
				if (row) {
					if (row.kind === "typed") {
						setActiveMention(null);
						setMentionPos(null);
					} else {
						applyMention(row.item.name);
					}
					return true;
				}
			}
			if (e.key === "Escape") {
				e.preventDefault();
				setActiveMention(null);
				setMentionPos(null);
				return true;
			}
			return false;
		},
		[activeMention, rows, highlightedIndex, applyMention],
	);

	// Wrapper for NovelEditor keydown which returns boolean
	const handleEditorKeyDown = useCallback(
		(e: KeyboardEvent) => {
			return handleKeyDown(e as unknown as React.KeyboardEvent);
		},
		[handleKeyDown],
	);

	return (
		<div className="flex flex-col gap-4">
			{/* Add/Edit Toggle */}
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

			{/* Form */}
			{showAddForm && (
				<div className="flex flex-col gap-3 relative animate-in slide-in-from-top-2 fade-in duration-300">
					<input
						ref={titleRef}
						type="text"
						value={title}
						onChange={handleTitleChange}
						onKeyDown={(e) => {
							if (!handleKeyDown(e)) {
								// Allow normal enter to submit if not handling mention
								if (e.key === "Enter") handleSubmit();
							}
						}}
						onFocus={() => setActiveField("title")}
						placeholder="Title (optional)"
						className="w-full px-4 py-3 rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-transparent transition-all font-medium"
					/>

					<div className="relative">
						<NovelEditor
							key={editorKey}
							ref={contentEditorRef}
							showToolbar={false}
							onHTMLChange={setContentHtml}
							onTextChange={setContentText}
							onMentionChange={handleContentMentionChange}
							onKeyDown={handleEditorKeyDown}
							className="w-full"
							editorClassName="focus:ring-2 focus:ring-purple-400/50 min-h-[150px]"
						/>

						{/* Mention Popup */}
						{activeMention && mentionPos && rows.length > 0 && (
							<div
								className="absolute z-50 w-72"
								style={{
									top:
										activeField === "title" ? mentionPos.top : mentionPos.top, // Relative to container
									left: mentionPos.left,
								}}
							>
								<Command className="rounded-md border border-white/20 bg-slate-900/95 text-sm text-white shadow-lg">
									<CommandList>
										<CommandEmpty className="px-3 py-2 text-xs text-white/60">
											No matches.
										</CommandEmpty>
										<CommandGroup>
											{rows.map((row, index) => {
												const isActive = index === highlightedIndex;
												if (row.kind === "typed") {
													return (
														<CommandItem
															key="typed"
															value={row.label}
															onSelect={() => {
																setActiveMention(null);
																setMentionPos(null);
															}}
															onMouseEnter={() => setHighlightedIndex(index)}
															className={`flex flex-col items-start gap-0.5 data-[selected=true]:bg-unset data-[selected=true]:text-unset ${
																isActive ? "bg-purple-500/20" : ""
															}`}
														>
															<span className="text-white">{row.label}</span>
															<span className="text-[11px] text-white/60">
																{row.description}
															</span>
														</CommandItem>
													);
												}
												return (
													<CommandItem
														key={row.item.id}
														value={row.item.name}
														onSelect={() => applyMention(row.item.name)}
														onMouseEnter={() => setHighlightedIndex(index)}
														className={`flex items-center gap-2 data-[selected=true]:bg-unset data-[selected=true]:text-unset ${
															isActive ? "bg-purple-500/20" : ""
														} text-white`}
													>
														<span>
															{activeMention.type === "jar" ? "@" : "#"}
															{row.item.name}
														</span>
													</CommandItem>
												);
											})}
										</CommandGroup>
									</CommandList>
								</Command>
							</div>
						)}
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
