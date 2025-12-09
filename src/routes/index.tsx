import { createFileRoute } from '@tanstack/react-router'
import { DashboardLayout } from '@/components/dashboard-layout'
import { MODULE_REGISTRY } from '@/lib/module-registry'

export const Route = createFileRoute('/')({
  component: Dashboard,
  loader: async ({ context }) => {
    // Prefetch todos data for the todos module
    await context.queryClient.prefetchQuery(
      context.trpc.todos.list.queryOptions(),
    )
    await context.queryClient.prefetchQuery(
      context.trpc.jars.list.queryOptions(),
    )
    await context.queryClient.prefetchQuery(
      context.trpc.tags.list.queryOptions(),
    )
  },
})

function Dashboard() {
  return <DashboardLayout moduleDefinitions={MODULE_REGISTRY} />
}
