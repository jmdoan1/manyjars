---
description: Adding a new database table or column requires updates across filtering, sorting, searching, and live updates
---

# Adding New Tables or Columns

When adding a new Prisma model (table) or column, you must update multiple layers of the codebase.

## Checklist

### 1. Prisma Schema
- [ ] Add the model/column to `prisma/schema.prisma`
- [ ] Run `pnpm db:migrate` to create migration
- [ ] Run `pnpm db:generate` to update Prisma client

### 2. tRPC Router (`src/integrations/trpc/router.ts`)

#### For New Tables:
- [ ] Create a new router (e.g., `myTableRouter`)
- [ ] Add `list` query with filtering, sorting, pagination
- [ ] Add `create`, `update`, `delete` mutations
- [ ] Register router in `trpcRouter` export

#### For New Columns:
- [ ] Update filter schema if column is filterable (e.g., `myTableFilterSchema`)
- [ ] Update sort field enum if column is sortable (e.g., `myTableSortFieldEnum`)
- [ ] Update text search if column should be searchable (check `textSearch` in `buildWhere`)
- [ ] Update input schemas for create/update mutations

### 3. Live Updates (`prisma/add_notify_triggers.sql`)

For new tables:
```sql
DROP TRIGGER IF EXISTS mytable_notify_trigger ON "MyTable";
CREATE TRIGGER mytable_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON "MyTable"
FOR EACH ROW EXECUTE FUNCTION notify_table_change();
```

Then apply with:
```bash
pnpm prisma db execute --file prisma/add_notify_triggers.sql
```

Also update:
- [ ] `src/integrations/trpc/router.ts` - Add table to `subscriptionsRouter.onTableChange` enum
- [ ] `src/hooks/use-realtime.ts` - Add table to `TableName` type and `tableToRouterMap`

### 4. Query Invalidation (`src/hooks/use-query-invalidation.ts`)

For new tables:
- [ ] Create a new mutation hook (e.g., `useMyTableMutations`)
- [ ] Add cross-entity invalidation if the table can create other entities via mentions

### 5. Frontend Module

- [ ] Create module component in `src/components/modules/`
- [ ] Register module in `src/components/module-registry.tsx`
- [ ] Use the new mutation hook from `use-query-invalidation.ts`

## Filter Schema Pattern

```typescript
const myTableFilterSchema = z.object({
  // Foreign key filters
  relatedIdAny: stringIdArray.optional(),
  
  // Enum filters
  statusIn: z.nativeEnum(Status).array().optional(),
  
  // Date range filters
  createdAt: dateRangeSchema.optional(),
  
  // Boolean filters
  isActive: z.boolean().optional(),
  
  // Text search
  textSearch: z.string().max(256).optional(),
});
```

## Sort Schema Pattern

```typescript
const myTableSortFieldEnum = z.enum([
  "createdAt",
  "updatedAt",
  "name",
  // Add sortable columns here
]);

const myTableSortSpecSchema = z.object({
  field: myTableSortFieldEnum,
  direction: sortDirectionEnum,
  nulls: nullsEnum.optional(),
});
```

## Text Search Pattern

In `buildWhere` function:
```typescript
if (input.filter?.textSearch) {
  where.OR = [
    { name: { contains: input.filter.textSearch, mode: "insensitive" } },
    { description: { contains: input.filter.textSearch, mode: "insensitive" } },
    // Add searchable columns here
  ];
}
```
