import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/db";
import { validateJarTagName, type PriorityCode } from "@/hooks/use-mentions";
import { extractAndEnsureMentions } from "./mentions-helper";
import { createTRPCRouter, protectedProcedure } from "./init";

const todoBaseInclude = {
	jars: true,
	tags: true,
} as const;

const priorityEnum = z.enum(["VERY_LOW", "LOW", "MEDIUM", "HIGH", "VERY_HIGH"]);

const todoUpsertMetaInput = z.object({
	// jar/tag *names*; we will connectOrCreate per user
	jars: z.array(z.string().min(1)).optional(),
	tags: z.array(z.string().min(1)).optional(),
	priority: priorityEnum.optional(),
});

const todosRouter = {
	list: protectedProcedure.query(async ({ ctx }) => {
		const todos = await prisma.todo.findMany({
			where: { userId: ctx.user.id },
			orderBy: { createdAt: "desc" },
			include: todoBaseInclude,
		});
		return todos;
	}),

	add: protectedProcedure
		.input(
			z
				.object({
					title: z.string().min(1),
					description: z.string().optional(),
				})
				.merge(todoUpsertMetaInput),
		)
		.mutation(async ({ input, ctx }) => {
			console.log("todos.add called with", input, "by user", ctx.user.id);

			const { title, description } = input;
			
			// Extract jars, tags, priority from text
			const { jars, tags, priority } = await extractAndEnsureMentions(
				[title, description],
				ctx.user.id
			);

			try {
				const newTodo = await prisma.todo.create({
					data: {
						title,
						description,
						userId: ctx.user.id,
						priority: priority ?? input.priority, // Prefer parsed priority, fallback to input? Or just parsed? parsed returns undefined if not found.
						// connect jars
						jars: {
							connect: jars.map((j) => ({ id: j.id })),
						},
						// connect tags
						tags: {
							connect: tags.map((t) => ({ id: t.id })),
						},
					},
					include: todoBaseInclude,
				});

				console.log("todos.add created", newTodo);
				return newTodo;
			} catch (err) {
				console.error("todos.add error", err);
				throw err;
			}
		}),

	update: protectedProcedure
		.input(
			z
				.object({
					id: z.string().uuid(),
					title: z.string().min(1).optional(),
					description: z.string().nullable().optional(),
					completedAt: z.date().nullable().optional(),
				})
				.merge(todoUpsertMetaInput),
		)
		.mutation(async ({ input, ctx }) => {
			const { id, title, description, jars, tags, priority, ...rest } = input;
			const userId = ctx.user.id;

			// Check if we need to re-parse mentions (if title or description changed)
			let jarIds: string[] | undefined;
			let tagIds: string[] | undefined;
			let parsedPriority: PriorityCode | undefined | null; // null means clear it

			if (title !== undefined || description !== undefined) {
				const currentTodo = await prisma.todo.findUnique({
					where: { id, userId },
					select: { title: true, description: true },
				});

				if (currentTodo) {
					const nextTitle = title ?? currentTodo.title;
					const nextDescription =
						description !== undefined ? description : currentTodo.description;

					const { jars, tags, priority } = await extractAndEnsureMentions(
						[nextTitle, nextDescription],
						userId,
					);

					jarIds = jars.map((j) => j.id);
					tagIds = tags.map((t) => t.id);
					parsedPriority = priority || null; // If undefined (no priority in text), set to null (clear it)
				}
			}

			const updatedTodo = await prisma.todo.update({
				where: {
					id,
					userId,
				},
				data: {
					title,
					description,
					...rest,
					...(parsedPriority !== undefined ? { priority: parsedPriority ?? "MEDIUM" } : {}), // Update priority if re-parsed (undefined logic handled by conditional check, but wait logic above sets it to null if undefined? logic below handles it)
					...(jarIds
						? {
								jars: {
									set: jarIds.map((jid) => ({ id: jid })),
								},
							}
						: {}),
					...(tagIds
						? {
								tags: {
									set: tagIds.map((tid) => ({ id: tid })),
								},
							}
						: {}),
				},
				include: todoBaseInclude,
			});

			return updatedTodo;
		}),

	delete: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const { id } = input;

			await prisma.todo.delete({
				where: {
					id,
					userId: ctx.user.id,
				},
			});

			return { success: true };
		}),
} satisfies TRPCRouterRecord;

const jarsRouter = {
	list: protectedProcedure.query(async ({ ctx }) => {
		return prisma.jar.findMany({
			where: { userId: ctx.user.id },
			orderBy: { name: "asc" },
			include: {
				linkedJars: { include: { targetJar: true } },
				linkedTags: { include: { tag: true } },
			},
		});
	}),
	create: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				description: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			// Validate name format
			if (!validateJarTagName(input.name)) {
				throw new Error(
					"Jar name must contain only alphanumeric characters, hyphens, and underscores",
				);
			}

			const jar = await prisma.jar.create({
				data: {
					name: input.name,
					description: input.description,
					userId: ctx.user.id,
				},
			});

			// Parse mentions from description and create links
			if (input.description) {
				const { jars, tags } = await extractAndEnsureMentions(
					[input.description],
					ctx.user.id
				);

				// Link to mentioned jars
				if (jars.length > 0) {
					await prisma.jarLink.createMany({
						data: jars.map((target) => ({
							sourceJarId: jar.id,
							targetJarId: target.id,
						})),
						skipDuplicates: true,
					});
				}

				// Link to mentioned tags
				if (tags.length > 0) {
					await prisma.jarTagLink.createMany({
						data: tags.map((target) => ({
							jarId: jar.id,
							tagId: target.id,
						})),
						skipDuplicates: true,
					});
				}
			}

			return jar;
		}),
	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).optional(),
				description: z.string().nullable().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const { id, name, description, ...rest } = input;

			// Validate name format if provided
			if (name && !validateJarTagName(name)) {
				throw new Error(
					"Jar name must contain only alphanumeric characters, hyphens, and underscores",
				);
			}

			// Update jar
			const jar = await prisma.jar.update({
				where: { id, userId: ctx.user.id },
				data: { name, description, ...rest },
			});

			// Re-sync links if description changed
			if (description !== undefined) {
				// Delete existing links
				await prisma.jarLink.deleteMany({ where: { sourceJarId: id } });
				await prisma.jarTagLink.deleteMany({ where: { jarId: id } });

				// Create new links from updated description
				if (description) {
					const { jars, tags } = await extractAndEnsureMentions(
						[description],
						ctx.user.id
					);

					if (jars.length > 0) {
						await prisma.jarLink.createMany({
							data: jars.map((target) => ({
								sourceJarId: jar.id,
								targetJarId: target.id,
							})),
							skipDuplicates: true,
						});
					}

					if (tags.length > 0) {
						await prisma.jarTagLink.createMany({
							data: tags.map((target) => ({
								jarId: jar.id,
								tagId: target.id,
							})),
							skipDuplicates: true,
						});
					}
				}
			}

			return jar;
		}),
	delete: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ input, ctx }) => {
			await prisma.jar.delete({
				where: { id: input.id, userId: ctx.user.id },
			});
			return { success: true };
		}),
} satisfies TRPCRouterRecord;

const tagsRouter = {
	list: protectedProcedure.query(async ({ ctx }) => {
		return prisma.tag.findMany({
			where: { userId: ctx.user.id },
			orderBy: { name: "asc" },
			include: {
				linkedTags: { include: { targetTag: true } },
				linkedJars: { include: { jar: true } },
			},
		});
	}),
	create: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				description: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			// Validate name format
			if (!validateJarTagName(input.name)) {
				throw new Error(
					"Tag name must contain only alphanumeric characters, hyphens, and underscores",
				);
			}

			const tag = await prisma.tag.create({
				data: {
					name: input.name,
					description: input.description,
					userId: ctx.user.id,
				},
			});

			// Parse mentions from description and create links
			if (input.description) {
				const { jars, tags } = await extractAndEnsureMentions(
					[input.description],
					ctx.user.id
				);

				// Link to mentioned jars
				if (jars.length > 0) {
					await prisma.jarTagLink.createMany({
						data: jars.map((target) => ({
							tagId: tag.id,
							jarId: target.id,
						})),
						skipDuplicates: true,
					});
				}

				// Link to mentioned tags
				if (tags.length > 0) {
					await prisma.tagLink.createMany({
						data: tags.map((target) => ({
							sourceTagId: tag.id,
							targetTagId: target.id,
						})),
						skipDuplicates: true,
					});
				}
			}

			return tag;
		}),
	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).optional(),
				description: z.string().nullable().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const { id, name, description, ...rest } = input;

			// Validate name format if provided
			if (name && !validateJarTagName(name)) {
				throw new Error(
					"Tag name must contain only alphanumeric characters, hyphens, and underscores",
				);
			}

			// Update tag
			const tag = await prisma.tag.update({
				where: { id, userId: ctx.user.id },
				data: { name, description, ...rest },
			});

			// Re-sync links if description changed
			if (description !== undefined) {
				// Delete existing links
				await prisma.tagLink.deleteMany({ where: { sourceTagId: id } });
				await prisma.jarTagLink.deleteMany({ where: { tagId: id } });

				// Create new links from updated description
				if (description) {
					const { jars, tags } = await extractAndEnsureMentions(
						[description],
						ctx.user.id
					);

					if (jars.length > 0) {
						await prisma.jarTagLink.createMany({
							data: jars.map((target) => ({
								tagId: tag.id,
								jarId: target.id,
							})),
							skipDuplicates: true,
						});
					}

					if (tags.length > 0) {
						await prisma.tagLink.createMany({
							data: tags.map((target) => ({
								sourceTagId: tag.id,
								targetTagId: target.id,
							})),
							skipDuplicates: true,
						});
					}
				}
			}

			return tag;
		}),
	delete: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ input, ctx }) => {
			await prisma.tag.delete({
				where: { id: input.id, userId: ctx.user.id },
			});
			return { success: true };
		}),
} satisfies TRPCRouterRecord;

const notesRouter = {
	list: protectedProcedure.query(async ({ ctx }) => {
		return prisma.note.findMany({
			where: { userId: ctx.user.id },
			orderBy: { updatedAt: "desc" },
			include: {
				jars: true,
				tags: true,
			},
		});
	}),

	create: protectedProcedure
		.input(
			z
				.object({
					title: z.string().optional(),
					content: z.string().min(1),
				})
				.merge(todoUpsertMetaInput),
		)
		.mutation(async ({ input, ctx }) => {
			const { title, content } = input;

			// Extract mentions from title and content
			const { jars, tags } = await extractAndEnsureMentions(
				[title, content],
				ctx.user.id
			);

			const note = await prisma.note.create({
				data: {
					title,
					content,
					userId: ctx.user.id,
					// connect jars
					jars: {
						connect: jars.map((j) => ({ id: j.id })),
					},
					// connect tags
					tags: {
						connect: tags.map((t) => ({ id: t.id })),
					},
				},
				include: { jars: true, tags: true },
			});

			return note;
		}),

	update: protectedProcedure
		.input(
			z
				.object({
					id: z.string().uuid(),
					title: z.string().optional(),
					content: z.string().min(1),
				})
				.merge(todoUpsertMetaInput),
		)
		.mutation(async ({ input, ctx }) => {
			const { id, title, content, jars: _explicitJars, tags: _explicitTags, priority: _p, ...rest } = input;
			const userId = ctx.user.id;

			// Check if we need to re-parse (always yes since content is required in input schema? No, content is z.min(1) but in update input object... Input object has content required?
			// Line 536: content: z.string().min(1). Not optional?
			// If content is required, we always have it.
			// But wait, the update input definition uses Zod object directly.
			// Line 536: content: z.string().min(1)
			// So content is MANDATORY for update?
			// Line 609 in original file (Step 131) said: `content: z.string().min(1)`.
			// So yes, content is mandatory.
			// Title is optional `title: z.string().optional()`.
			
			// So we always have content. We need current title if not provided.
			
			let nextTitle = title;
			if (title === undefined) {
				const currentNote = await prisma.note.findUnique({
					where: { id, userId },
					select: { title: true },
				});
				if (!currentNote) throw new Error("Note not found"); // or just let update fail? But we need title for parsing.
				nextTitle = currentNote.title || "";
			}

			const { jars, tags } = await extractAndEnsureMentions(
				[nextTitle, content],
				userId
			);

			const updatedNote = await prisma.note.update({
				where: { id, userId },
				data: {
					title,
					content,
					jars: {
						set: jars.map((j) => ({ id: j.id })),
					},
					tags: {
						set: tags.map((t) => ({ id: t.id })),
					},
				},
				include: { jars: true, tags: true },
			});

			return updatedNote;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ input, ctx }) => {
			await prisma.note.delete({
				where: { id: input.id, userId: ctx.user.id },
			});
			return { success: true };
		}),
} satisfies TRPCRouterRecord;

export const trpcRouter = createTRPCRouter({
	todos: todosRouter,
	jars: jarsRouter,
	tags: tagsRouter,
	notes: notesRouter,
});

export type TRPCRouter = typeof trpcRouter;
