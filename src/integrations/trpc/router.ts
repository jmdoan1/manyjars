import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/db";
import { parseMentions, validateJarTagName } from "@/hooks/use-mentions";
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

			const { jars, tags, ...rest } = input;

			try {
				const newTodo = await prisma.todo.create({
					data: {
						title: rest.title,
						description: rest.description,
						userId: ctx.user.id,
						priority: rest.priority,
						// connect/create jars by name for this user
						...(jars?.length
							? {
									jars: {
										connectOrCreate: jars.map((name) => ({
											where: {
												userId_name: {
													userId: ctx.user.id,
													name,
												},
											},
											create: {
												userId: ctx.user.id,
												name,
											},
										})),
									},
								}
							: {}),
						...(tags?.length
							? {
									tags: {
										connectOrCreate: tags.map((name) => ({
											where: {
												userId_name: {
													userId: ctx.user.id,
													name,
												},
											},
											create: {
												userId: ctx.user.id,
												name,
											},
										})),
									},
								}
							: {}),
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
			const { id, jars, tags, ...rest } = input;

			// For jars/tags on update, simplest is:
			// - if provided, *replace* the set based on the provided names
			//   (connectOrCreate + set by ids).
			// If not provided, leave as-is.
			const userId = ctx.user.id;

			const newJars = jars?.length
				? await Promise.all(
						jars.map((name) =>
							prisma.jar.upsert({
								where: {
									userId_name: {
										userId,
										name,
									},
								},
								update: {},
								create: {
									userId,
									name,
								},
							}),
						),
					)
				: undefined;

			const newTags = tags?.length
				? await Promise.all(
						tags.map((name) =>
							prisma.tag.upsert({
								where: {
									userId_name: {
										userId,
										name,
									},
								},
								update: {},
								create: {
									userId,
									name,
								},
							}),
						),
					)
				: undefined;

			const updatedTodo = await prisma.todo.update({
				where: {
					id,
					userId,
				},
				data: {
					...rest,
					...(newJars
						? {
								jars: {
									set: newJars.map((j) => ({ id: j.id })),
								},
							}
						: {}),
					...(newTags
						? {
								tags: {
									set: newTags.map((t) => ({ id: t.id })),
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
				const { jars, tags } = parseMentions(input.description);

				// Link to mentioned jars
				if (jars.length > 0) {
					const targetJars = await prisma.jar.findMany({
						where: { userId: ctx.user.id, name: { in: jars } },
					});
					await prisma.jarLink.createMany({
						data: targetJars.map((target) => ({
							sourceJarId: jar.id,
							targetJarId: target.id,
						})),
						skipDuplicates: true,
					});
				}

				// Link to mentioned tags
				if (tags.length > 0) {
					const targetTags = await prisma.tag.findMany({
						where: { userId: ctx.user.id, name: { in: tags } },
					});
					await prisma.jarTagLink.createMany({
						data: targetTags.map((target) => ({
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
					const { jars, tags } = parseMentions(description);

					if (jars.length > 0) {
						const targetJars = await prisma.jar.findMany({
							where: { userId: ctx.user.id, name: { in: jars } },
						});
						await prisma.jarLink.createMany({
							data: targetJars.map((target) => ({
								sourceJarId: jar.id,
								targetJarId: target.id,
							})),
							skipDuplicates: true,
						});
					}

					if (tags.length > 0) {
						const targetTags = await prisma.tag.findMany({
							where: { userId: ctx.user.id, name: { in: tags } },
						});
						await prisma.jarTagLink.createMany({
							data: targetTags.map((target) => ({
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
				const { jars, tags } = parseMentions(input.description);

				// Link to mentioned jars
				if (jars.length > 0) {
					const targetJars = await prisma.jar.findMany({
						where: { userId: ctx.user.id, name: { in: jars } },
					});
					await prisma.jarTagLink.createMany({
						data: targetJars.map((target) => ({
							tagId: tag.id,
							jarId: target.id,
						})),
						skipDuplicates: true,
					});
				}

				// Link to mentioned tags
				if (tags.length > 0) {
					const targetTags = await prisma.tag.findMany({
						where: { userId: ctx.user.id, name: { in: tags } },
					});
					await prisma.tagLink.createMany({
						data: targetTags.map((target) => ({
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
					const { jars, tags } = parseMentions(description);

					if (jars.length > 0) {
						const targetJars = await prisma.jar.findMany({
							where: { userId: ctx.user.id, name: { in: jars } },
						});
						await prisma.jarTagLink.createMany({
							data: targetJars.map((target) => ({
								tagId: tag.id,
								jarId: target.id,
							})),
							skipDuplicates: true,
						});
					}

					if (tags.length > 0) {
						const targetTags = await prisma.tag.findMany({
							where: { userId: ctx.user.id, name: { in: tags } },
						});
						await prisma.tagLink.createMany({
							data: targetTags.map((target) => ({
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
			const { title, content, jars: explicitJars, tags: explicitTags } = input;

			// Parse mentions from both title and content
			const { jars: jarsFromContent, tags: tagsFromContent } =
				parseMentions(content);
			const { jars: jarsFromTitle, tags: tagsFromTitle } = parseMentions(
				title || "",
			);

			// Merge unique mentions
			const allJars = Array.from(
				new Set([...jarsFromContent, ...jarsFromTitle]),
			);
			const allTags = Array.from(
				new Set([...tagsFromContent, ...tagsFromTitle]),
			);

			// Use explicit jars/tags if provided, otherwise parsed ones?
			// For Notes, we likely want parsing to drive it, but allow flexibility.
			// Based on Todos, it respects explicit input (which mentions hook provides).
			// Let's defer to the input `jars` and `tags` which come from parsed result
			// passed by the client (since client parses mentions for IDs usually,
			// but here we are strictly name based in schema implies connectOrCreate).

			// Actually `todoUpsertMetaInput` takes jar/tag NAMES.
			// So we can just use the input directly if the client sends them.
			// The client mention hook will provide the list.
			const jarsToConnect = explicitJars ?? allJars;
			const tagsToConnect = explicitTags ?? allTags;

			const note = await prisma.note.create({
				data: {
					title,
					content,
					userId: ctx.user.id,
					// connect/create jars
					...(jarsToConnect.length
						? {
								jars: {
									connectOrCreate: jarsToConnect.map((name) => ({
										where: { userId_name: { userId: ctx.user.id, name } },
										create: { userId: ctx.user.id, name },
									})),
								},
							}
						: {}),
					// connect/create tags
					...(tagsToConnect.length
						? {
								tags: {
									connectOrCreate: tagsToConnect.map((name) => ({
										where: { userId_name: { userId: ctx.user.id, name } },
										create: { userId: ctx.user.id, name },
									})),
								},
							}
						: {}),
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
			const { id, title, content, jars, tags } = input;
			const userId = ctx.user.id;

			// Prepare upserts for jars/tags
			const newJars = jars?.length
				? await Promise.all(
						jars.map((name) =>
							prisma.jar.upsert({
								where: { userId_name: { userId, name } },
								update: {},
								create: { userId, name },
							}),
						),
					)
				: undefined;

			const newTags = tags?.length
				? await Promise.all(
						tags.map((name) =>
							prisma.tag.upsert({
								where: { userId_name: { userId, name } },
								update: {},
								create: { userId, name },
							}),
						),
					)
				: undefined;

			const updatedNote = await prisma.note.update({
				where: { id, userId },
				data: {
					title,
					content,
					...(newJars
						? {
								jars: {
									set: newJars.map((j) => ({ id: j.id })),
								},
							}
						: {}),
					...(newTags
						? {
								tags: {
									set: newTags.map((t) => ({ id: t.id })),
								},
							}
						: {}),
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
