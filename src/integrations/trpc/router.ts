import type { TRPCRouterRecord } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { z } from "zod";
import { prisma } from "@/db";
import { validateJarTagName, type PriorityCode } from "@/hooks/use-mentions";
import { extractAndEnsureMentions } from "./mentions-helper";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "./init";
import { Priority, type Prisma } from "../../generated/prisma/client";
import { getPgNotifyListener, type TableChangePayload } from "@/integrations/pg-notify-listener";

// --- Generic Schemas ---

const stringIdArray = z.array(z.string().uuid()).nonempty();

const dateRangeSchema = z.object({
	from: z.string().datetime().optional(), // ISO
	to: z.string().datetime().optional(),
});

const paginationSchema = z.object({
	take: z.number().int().min(1).max(100).default(50),
	skip: z.number().int().min(0).default(0),
	cursor: z.string().uuid().optional(),
});

const sortDirectionEnum = z.enum(["asc", "desc"]);
const nullsEnum = z.enum(["first", "last"]);

// --- Todo Schemas & Helpers ---

const todoFilterSchema = z.object({
	jarIdsAny: stringIdArray.optional(),
	tagIdsAny: stringIdArray.optional(),
	priorityIn: z.nativeEnum(Priority).array().optional(),
	createdAt: dateRangeSchema.optional(),
	dueDate: dateRangeSchema.optional(),
	completedAt: dateRangeSchema.optional(),
	isCompleted: z.boolean().optional(),
	textSearch: z.string().max(256).optional(),
});

const todoSortFieldEnum = z.enum([
	"createdAt",
	"dueDate",
	"priority",
	"title",
]);

const todoSortSpecSchema = z.object({
	field: todoSortFieldEnum,
	direction: sortDirectionEnum,
	nulls: nullsEnum.optional(),
});

const todoListInputSchema = z
	.object({
		filter: todoFilterSchema.optional(),
		sort: todoSortSpecSchema.array().nonempty().optional(),
		pagination: paginationSchema.optional(),
		include: z
			.object({
				jars: z.boolean().default(true),
				tags: z.boolean().default(true),
			})
			.default({ jars: true, tags: true }),
	})
	.optional();

function buildTodoWhere(
	userId: string,
	filter?: z.infer<typeof todoFilterSchema>,
): Prisma.TodoWhereInput {
	const where: Prisma.TodoWhereInput = { userId };

	if (!filter) return where;

	const {
		jarIdsAny,
		tagIdsAny,
		priorityIn,
		createdAt,
		dueDate,
		completedAt,
		isCompleted,
		textSearch,
	} = filter;

	if (jarIdsAny?.length) {
		where.jars = { some: { id: { in: jarIdsAny } } };
	}

	if (tagIdsAny?.length) {
		where.tags = { some: { id: { in: tagIdsAny } } };
	}

	if (priorityIn?.length) {
		where.priority = { in: priorityIn };
	}

	if (createdAt) {
		where.createdAt = {
			gte: createdAt.from ? new Date(createdAt.from) : undefined,
			lte: createdAt.to ? new Date(createdAt.to) : undefined,
		};
	}

	if (dueDate) {
		where.dueDate = {
			gte: dueDate.from ? new Date(dueDate.from) : undefined,
			lte: dueDate.to ? new Date(dueDate.to) : undefined,
		};
	}

	if (completedAt) {
		where.completedAt = {
			gte: completedAt.from ? new Date(completedAt.from) : undefined,
			lte: completedAt.to ? new Date(completedAt.to) : undefined,
		};
	}

	if (typeof isCompleted === "boolean") {
		where.completedAt = isCompleted ? { not: null } : null;
	}

	if (textSearch) {
		where.OR = [
			{ title: { contains: textSearch, mode: "insensitive" } },
			{ description: { contains: textSearch, mode: "insensitive" } },
		];
	}

	return where;
}

function buildTodoOrderBy(
	sort?: z.infer<typeof todoSortSpecSchema>[],
): Prisma.TodoOrderByWithRelationInput[] {
	if (!sort || sort.length === 0) {
		return [{ createdAt: "desc" }];
	}

	return sort.map((s) => {
		if (s.field === "dueDate" && s.nulls) {
            // Prisma supports specific nulls sorting in some versions or raw queries,
            // but standard orderBy usually handles nulls based on direction or specific capability.
			// Depending on Prisma version and DB. user says "Prisma supports nulls first/last via raw, but if you use native driver..."
            // For now, let's try the object syntax if valid, or fallback to direction.
            // But wait, the user instructions provided this code:
            /*
            if (s.field === "dueDate" && s.nulls) {
              return {
                dueDate: s.direction, // simplifying as the prompt suggested standard prisma usage might need care
              };
            }
            */
           // I'll stick to the requested logic, but standard prisma `dueDate: { sort: 'asc', nulls: 'last' }` syntax works in recent versions
           // The prompt had:
           /*
            if (s.field === "dueDate" && s.nulls) {
                 return { dueDate: s.direction };
            }
           */
           // But the prompt example code had a comment about using raw.
           // However, my existing router uses `orderBy.dueDate = { sort: 'asc', nulls: 'last' }` (lines 53, 56).
           // So I should support that!
           return { [s.field]: { sort: s.direction, ...(s.nulls ? { nulls: s.nulls } : {}) } } as Prisma.TodoOrderByWithRelationInput;
		}

		return { [s.field]: s.direction } as Prisma.TodoOrderByWithRelationInput;
	});
}

// --- Jar Schemas & Helpers ---

const jarFilterSchema = z.object({
	tagIdsAny: stringIdArray.optional(),
	nameContains: z.string().max(256).optional(),
	createdAt: dateRangeSchema.optional(),
});

const jarSortFieldEnum = z.enum(["createdAt", "name"]);

const jarSortSpecSchema = z.object({
	field: jarSortFieldEnum,
	direction: sortDirectionEnum,
});

const jarListInputSchema = z
	.object({
		filter: jarFilterSchema.optional(),
		sort: jarSortSpecSchema.array().nonempty().optional(),
		pagination: paginationSchema.optional(),
		include: z
			.object({
				linkedJars: z.boolean().default(true),
				linkedTags: z.boolean().default(true),
			})
			.default({ linkedJars: true, linkedTags: true }),
	})
	.optional();

function buildJarWhere(
	userId: string,
	filter?: z.infer<typeof jarFilterSchema>,
): Prisma.JarWhereInput {
	const where: Prisma.JarWhereInput = { userId };

	if (!filter) return where;

	const { tagIdsAny, nameContains, createdAt } = filter;

	if (tagIdsAny?.length) {
		where.linkedTags = { some: { tagId: { in: tagIdsAny } } };
	}

	if (nameContains) {
		where.name = { contains: nameContains, mode: "insensitive" };
	}

	if (createdAt) {
		where.createdAt = {
			gte: createdAt.from ? new Date(createdAt.from) : undefined,
			lte: createdAt.to ? new Date(createdAt.to) : undefined,
		};
	}

	return where;
}

function buildJarOrderBy(
	sort?: z.infer<typeof jarSortSpecSchema>[],
): Prisma.JarOrderByWithRelationInput[] {
	if (!sort || sort.length === 0) {
		return [{ name: "asc" }];
	}
	return sort.map((s) => ({ [s.field]: s.direction }));
}

// --- Tag Schemas & Helpers ---

const tagFilterSchema = z.object({
	jarIdsAny: stringIdArray.optional(),
	nameContains: z.string().max(256).optional(),
	createdAt: dateRangeSchema.optional(),
});

const tagSortFieldEnum = z.enum(["createdAt", "name"]);

const tagSortSpecSchema = z.object({
	field: tagSortFieldEnum,
	direction: sortDirectionEnum,
});

const tagListInputSchema = z
	.object({
		filter: tagFilterSchema.optional(),
		sort: tagSortSpecSchema.array().nonempty().optional(),
		pagination: paginationSchema.optional(),
		include: z
			.object({
				linkedTags: z.boolean().default(true),
				linkedJars: z.boolean().default(true),
			})
			.default({ linkedTags: true, linkedJars: true }),
	})
	.optional();

function buildTagWhere(
	userId: string,
	filter?: z.infer<typeof tagFilterSchema>,
): Prisma.TagWhereInput {
	const where: Prisma.TagWhereInput = { userId };

	if (!filter) return where;

	const { jarIdsAny, nameContains, createdAt } = filter;

	if (jarIdsAny?.length) {
		where.linkedJars = { some: { jarId: { in: jarIdsAny } } };
	}

	if (nameContains) {
		where.name = { contains: nameContains, mode: "insensitive" };
	}

	if (createdAt) {
		where.createdAt = {
			gte: createdAt.from ? new Date(createdAt.from) : undefined,
			lte: createdAt.to ? new Date(createdAt.to) : undefined,
		};
	}

	return where;
}

function buildTagOrderBy(
	sort?: z.infer<typeof tagSortSpecSchema>[],
): Prisma.TagOrderByWithRelationInput[] {
	if (!sort || sort.length === 0) {
		return [{ name: "asc" }];
	}
	return sort.map((s) => ({ [s.field]: s.direction }));
}

// --- Note Schemas & Helpers ---

const noteFilterSchema = z.object({
	jarIdsAny: stringIdArray.optional(),
	tagIdsAny: stringIdArray.optional(),
	createdAt: dateRangeSchema.optional(),
	textSearch: z.string().max(256).optional(),
});

const noteSortFieldEnum = z.enum(["createdAt", "title"]);

const noteSortSpecSchema = z.object({
	field: noteSortFieldEnum,
	direction: sortDirectionEnum,
});

const noteListInputSchema = z
	.object({
		filter: noteFilterSchema.optional(),
		sort: noteSortSpecSchema.array().nonempty().optional(),
		pagination: paginationSchema.optional(),
		include: z
			.object({
				jars: z.boolean().default(true),
				tags: z.boolean().default(true),
			})
			.default({ jars: true, tags: true }),
	})
	.optional();

function buildNoteWhere(
	userId: string,
	filter?: z.infer<typeof noteFilterSchema>,
): Prisma.NoteWhereInput {
	const where: Prisma.NoteWhereInput = { userId };

	if (!filter) return where;

	const { jarIdsAny, tagIdsAny, createdAt, textSearch } = filter;

	if (jarIdsAny?.length) {
		where.jars = { some: { id: { in: jarIdsAny } } };
	}

	if (tagIdsAny?.length) {
		where.tags = { some: { id: { in: tagIdsAny } } };
	}

	if (createdAt) {
		where.createdAt = {
			gte: createdAt.from ? new Date(createdAt.from) : undefined,
			lte: createdAt.to ? new Date(createdAt.to) : undefined,
		};
	}

	if (textSearch) {
		where.OR = [
			{ title: { contains: textSearch, mode: "insensitive" } },
			{ content: { contains: textSearch, mode: "insensitive" } },
		];
	}

	return where;
}

function buildNoteOrderBy(
	sort?: z.infer<typeof noteSortSpecSchema>[],
): Prisma.NoteOrderByWithRelationInput[] {
	if (!sort || sort.length === 0) {
		return [{ createdAt: "desc" }];
	}
	return sort.map((s) => ({ [s.field]: s.direction }));
}

// --- Shared Helper ---

function buildPagination(
	pagination?: z.infer<typeof paginationSchema>,
): { take: number; skip: number; cursor?: { id: string } } {
	if (!pagination) return { take: 50, skip: 0 };

	return {
		take: pagination.take ?? 50,
		skip: pagination.skip ?? 0,
		cursor: pagination.cursor ? { id: pagination.cursor } : undefined,
	};
}

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
	dueDate: z.string().optional(), // Passed as ISO string or YYYY-MM-DD
});

const todosRouter = {
	list: protectedProcedure
		.input(todoListInputSchema)
		.query(async ({ ctx, input }) => {
			const { filter, sort, pagination, include } = input ?? {};

			const where = buildTodoWhere(ctx.user.id, filter);
			const orderBy = buildTodoOrderBy(sort);
			const { take, skip, cursor } = buildPagination(pagination);

			return prisma.todo.findMany({
				where,
				orderBy,
				take,
				skip,
				cursor,
				include: {
					jars: include?.jars ?? true,
					tags: include?.tags ?? true,
				},
			});
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

			const { title, description, dueDate } = input;
			
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
						priority: priority ?? input.priority,
						dueDate: dueDate ? new Date(dueDate) : undefined,
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
					dueDate: z.string().nullable().optional(), // Override to allow null
				})
				.merge(todoUpsertMetaInput),
		)
		.mutation(async ({ input, ctx }) => {
			const { id, title, description, jars, tags, priority, dueDate, ...rest } = input;
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

	// --- AI Access Endpoints ---

	getByIds: protectedProcedure
		.input(z.object({ ids: z.array(z.string().uuid()).nonempty() }))
		.query(async ({ ctx, input }) => {
			return prisma.todo.findMany({
				where: { id: { in: input.ids }, userId: ctx.user.id },
				include: { jars: true, tags: true },
			});
		}),

	search: protectedProcedure
		.input(
			z.object({
				query: z.string().min(1).max(256),
				limit: z.number().int().min(1).max(100).default(20),
			}),
		)
		.query(async ({ ctx, input }) => {
			return prisma.todo.findMany({
				where: {
					userId: ctx.user.id,
					OR: [
						{ title: { contains: input.query, mode: "insensitive" } },
						{ description: { contains: input.query, mode: "insensitive" } },
						{ aiNotes: { contains: input.query, mode: "insensitive" } },
					],
				},
				take: input.limit,
				include: { jars: true, tags: true },
			});
		}),

	updateAiNotes: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				aiNotes: z.string().nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			return prisma.todo.update({
				where: { id: input.id, userId: ctx.user.id },
				data: { aiNotes: input.aiNotes },
			});
		}),
} satisfies TRPCRouterRecord;

const jarsRouter = {
	list: protectedProcedure
		.input(jarListInputSchema)
		.query(async ({ ctx, input }) => {
			const { filter, sort, pagination, include } = input ?? {};

			const where = buildJarWhere(ctx.user.id, filter);
			const orderBy = buildJarOrderBy(sort);
			const { take, skip, cursor } = buildPagination(pagination);

			return prisma.jar.findMany({
				where,
				orderBy,
				take,
				skip,
				cursor,
				include: {
					linkedJars: include?.linkedJars ? { include: { targetJar: true } } : false,
					linkedTags: include?.linkedTags ? { include: { tag: true } } : false,
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

	// --- AI Access Endpoints ---

	getByIds: protectedProcedure
		.input(z.object({ ids: z.array(z.string().uuid()).nonempty() }))
		.query(async ({ ctx, input }) => {
			return prisma.jar.findMany({
				where: { id: { in: input.ids }, userId: ctx.user.id },
				include: {
					linkedJars: { include: { targetJar: true } },
					linkedTags: { include: { tag: true } },
				},
			});
		}),

	search: protectedProcedure
		.input(
			z.object({
				query: z.string().min(1).max(256),
				limit: z.number().int().min(1).max(100).default(20),
			}),
		)
		.query(async ({ ctx, input }) => {
			return prisma.jar.findMany({
				where: {
					userId: ctx.user.id,
					OR: [
						{ name: { contains: input.query, mode: "insensitive" } },
						{ description: { contains: input.query, mode: "insensitive" } },
						{ aiNotes: { contains: input.query, mode: "insensitive" } },
					],
				},
				take: input.limit,
				include: {
					linkedJars: { include: { targetJar: true } },
					linkedTags: { include: { tag: true } },
				},
			});
		}),

	updateAiNotes: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				aiNotes: z.string().nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			return prisma.jar.update({
				where: { id: input.id, userId: ctx.user.id },
				data: { aiNotes: input.aiNotes },
			});
		}),
} satisfies TRPCRouterRecord;

const tagsRouter = {
	list: protectedProcedure
		.input(tagListInputSchema)
		.query(async ({ ctx, input }) => {
			const { filter, sort, pagination, include } = input ?? {};

			const where = buildTagWhere(ctx.user.id, filter);
			const orderBy = buildTagOrderBy(sort);
			const { take, skip, cursor } = buildPagination(pagination);

			return prisma.tag.findMany({
				where,
				orderBy,
				take,
				skip,
				cursor,
				include: {
					linkedTags: include?.linkedTags ? { include: { targetTag: true } } : false,
					linkedJars: include?.linkedJars ? { include: { jar: true } } : false,
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

	// --- AI Access Endpoints ---

	getByIds: protectedProcedure
		.input(z.object({ ids: z.array(z.string().uuid()).nonempty() }))
		.query(async ({ ctx, input }) => {
			return prisma.tag.findMany({
				where: { id: { in: input.ids }, userId: ctx.user.id },
				include: {
					linkedTags: { include: { targetTag: true } },
					linkedJars: { include: { jar: true } },
				},
			});
		}),

	search: protectedProcedure
		.input(
			z.object({
				query: z.string().min(1).max(256),
				limit: z.number().int().min(1).max(100).default(20),
			}),
		)
		.query(async ({ ctx, input }) => {
			return prisma.tag.findMany({
				where: {
					userId: ctx.user.id,
					OR: [
						{ name: { contains: input.query, mode: "insensitive" } },
						{ description: { contains: input.query, mode: "insensitive" } },
						{ aiNotes: { contains: input.query, mode: "insensitive" } },
					],
				},
				take: input.limit,
				include: {
					linkedTags: { include: { targetTag: true } },
					linkedJars: { include: { jar: true } },
				},
			});
		}),

	updateAiNotes: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				aiNotes: z.string().nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			return prisma.tag.update({
				where: { id: input.id, userId: ctx.user.id },
				data: { aiNotes: input.aiNotes },
			});
		}),
} satisfies TRPCRouterRecord;

const notesRouter = {
	list: protectedProcedure
		.input(noteListInputSchema)
		.query(async ({ ctx, input }) => {
			const { filter, sort, pagination, include } = input ?? {};

			const where = buildNoteWhere(ctx.user.id, filter);
			const orderBy = buildNoteOrderBy(sort);
			const { take, skip, cursor } = buildPagination(pagination);

			return await prisma.note.findMany({
				where,
				orderBy,
				take,
				skip,
				cursor,
				include: {
					jars: include?.jars ?? true,
					tags: include?.tags ?? true,
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

	// --- AI Access Endpoints ---

	getByIds: protectedProcedure
		.input(z.object({ ids: z.array(z.string().uuid()).nonempty() }))
		.query(async ({ ctx, input }) => {
			return prisma.note.findMany({
				where: { id: { in: input.ids }, userId: ctx.user.id },
				include: { jars: true, tags: true },
			});
		}),

	search: protectedProcedure
		.input(
			z.object({
				query: z.string().min(1).max(256),
				limit: z.number().int().min(1).max(100).default(20),
			}),
		)
		.query(async ({ ctx, input }) => {
			return prisma.note.findMany({
				where: {
					userId: ctx.user.id,
					OR: [
						{ title: { contains: input.query, mode: "insensitive" } },
						{ content: { contains: input.query, mode: "insensitive" } },
						{ aiNotes: { contains: input.query, mode: "insensitive" } },
					],
				},
				take: input.limit,
				include: { jars: true, tags: true },
			});
		}),

	updateAiNotes: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				aiNotes: z.string().nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			return prisma.note.update({
				where: { id: input.id, userId: ctx.user.id },
				data: { aiNotes: input.aiNotes },
			});
		}),
} satisfies TRPCRouterRecord;

// --- Subscriptions Router ---

const subscriptionsRouter = {
	/**
	 * Subscribe to table changes for specific tables.
	 * Emits events when PostgreSQL NOTIFY triggers fire for matching tables.
	 * Note: Uses publicProcedure because WebSocket doesn't have Clerk auth context.
	 * The clerkUserId is passed from the client and mapped to DB userId for filtering.
	 */
	onTableChange: publicProcedure
		.input(
			z.object({
				tables: z.array(z.enum(["Todo", "Jar", "Tag", "Note"])),
				clerkUserId: z.string(), // Client passes their Clerk userId
			}),
		)
		.subscription(async function* ({ input }) {
			console.log("[subscriptions] Client subscribing with clerkUserId:", input.clerkUserId);
			
			// Look up the DB userId from clerkUserId
			const dbUser = await prisma.user.findUnique({
				where: { clerkUserId: input.clerkUserId },
				select: { id: true },
			});
			
			if (!dbUser) {
				console.warn("[subscriptions] User not found for clerkUserId:", input.clerkUserId);
				return;
			}
			
			const dbUserId = dbUser.id;
			console.log("[subscriptions] Mapped to DB userId:", dbUserId, "for tables:", input.tables);

			const listener = getPgNotifyListener();
			if (!listener) {
				console.warn("[subscriptions] pg-notify listener not initialized");
				return;
			}

			// Create a promise-based event stream
			const queue: TableChangePayload[] = [];
			let resolveNext: ((value: IteratorResult<TableChangePayload>) => void) | null = null;

			const handler = (payload: TableChangePayload) => {
				console.log("[subscriptions] Received change:", payload.table, "for user:", payload.userId);
				// Only emit if the change is for this user and a subscribed table
				if (
					payload.userId === dbUserId &&
					input.tables.includes(payload.table as any)
				) {
					console.log("[subscriptions] Emitting to client");
					if (resolveNext) {
						resolveNext({ value: payload, done: false });
						resolveNext = null;
					} else {
						queue.push(payload);
					}
				}
			};

			listener.on("change", handler);

			try {
				while (true) {
					if (queue.length > 0) {
						yield queue.shift()!;
					} else {
						yield await new Promise<TableChangePayload>((resolve) => {
							resolveNext = (result) => resolve(result.value);
						});
					}
				}
			} finally {
				console.log("[subscriptions] Client unsubscribed");
				listener.off("change", handler);
			}
		}),
} satisfies TRPCRouterRecord;

export const trpcRouter = createTRPCRouter({
	todos: todosRouter,
	jars: jarsRouter,
	tags: tagsRouter,
	notes: notesRouter,
	subscriptions: subscriptionsRouter,
});

export type TRPCRouter = typeof trpcRouter;
