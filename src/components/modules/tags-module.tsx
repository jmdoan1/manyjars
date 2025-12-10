
import { useCallback, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTagMutations } from '@/hooks/use-query-invalidation'
import { useTRPC } from '@/integrations/trpc/react'
import { Hash, PlusCircle, Pencil, Trash2 } from 'lucide-react'
import { EntityPills } from "./entity-pills"
import { MentionEditor } from "../mentions/mention-editor"
import { ModuleFilter } from "./module-filter"
import {
  validateJarTagName,
} from '@/hooks/use-mentions'
import type { ModuleProps } from '@/types/dashboard-types'

import { ModuleSort } from "./module-sort"

export function TagsModule(props: ModuleProps) {
  const trpc = useTRPC()

  const [filterJars, setFilterJars] = useState<string[]>(
    (props.config?.filters as any)?.jarIds ?? []
  )
  const [filterSort, setFilterSort] = useState<string>(
    (props.config?.filters as any)?.orderBy ?? 'name_asc'
  )

  // Persist filters
  useEffect(() => {
    const newFilters = {
      jarIds: filterJars,
      orderBy: filterSort,
    }
    const currentFilters = (props.config?.filters as any)

    if (JSON.stringify(newFilters) !== JSON.stringify(currentFilters)) {
      props.onConfigChange?.({
        filters: newFilters
      })
    }
  }, [filterJars, filterSort, props.onConfigChange])

    const getSort = (sortKey: string) => {
      switch (sortKey) {
        case 'created_asc': return [{ field: 'createdAt' as const, direction: 'asc' as const }];
        case 'created_desc': return [{ field: 'createdAt' as const, direction: 'desc' as const }];
        case 'name_desc': return [{ field: 'name' as const, direction: 'desc' as const }];
        case 'name_asc': default: return [{ field: 'name' as const, direction: 'asc' as const }];
      }
    }

  const { data: tags } = useQuery(
    trpc.tags.list.queryOptions({
      filter: {
        jarIdsAny: filterJars.length > 0 ? filterJars : undefined,
      },
      sort: getSort(filterSort),
      pagination: { take: 100 },
      include: { linkedJars: true, linkedTags: true },
    })
  )
  const { data: jars } = useQuery(trpc.jars.list.queryOptions({
    pagination: { take: 100 },
  }))

  const [name, setName] = useState('')
  const [descriptionHtml, setDescriptionHtml] = useState('')
  const [editorKey, setEditorKey] = useState(0)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Use shared mutations with automatic cache invalidation
  const { createTag, updateTag, deleteTag } = useTagMutations()
  const [nameError, setNameError] = useState<string | null>(null)

  const resetForm = useCallback(() => {
    setName('')
    setDescriptionHtml('')
    setEditorKey((k) => k + 1)
    setEditingId(null)
    setNameError(null)
  }, [])

  const handleSubmit = useCallback(() => {
    if (!name.trim()) {
      setNameError('Name is required')
      return
    }

    if (!validateJarTagName(name)) {
      setNameError('Name must contain only alphanumeric characters, hyphens, and underscores')
      return
    }

    if (editingId) {
      updateTag.mutate({
        id: editingId,
        name,
        description: descriptionHtml || null,
      }, {
        onSuccess: resetForm,
        onError: (error) => setNameError(error.message),
      })
    } else {
      createTag.mutate({
        name,
        description: descriptionHtml || undefined,
      }, {
        onSuccess: resetForm,
        onError: (error) => setNameError(error.message),
      })
    }
  }, [name, descriptionHtml, editingId, createTag, updateTag, resetForm])

  const handleEdit = useCallback((tag: NonNullable<typeof tags>[number]) => {
    setEditingId(tag.id)
    setName(tag.name)
    setDescriptionHtml(tag.description || '')
    setEditorKey((k) => k + 1)
    setShowAddForm(true)
  }, [])

  const handleDelete = useCallback((id: string) => {
    if (confirm('Are you sure you want to delete this tag?')) {
      deleteTag.mutate({ id })
    }
  }, [deleteTag])



  return (
    <div className="flex flex-col gap-4">
      {/* Add/Edit Tag Toggle Button */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setShowAddForm(!showAddForm)
            if (showAddForm) resetForm()
          }}
          className="flex items-center gap-2 text-white/70 hover:text-purple-400 transition-colors text-sm self-start group"
        >
          <PlusCircle className={`w-5 h-5 transition-transform duration-300 ${showAddForm ? 'rotate-45' : ''}`} />
          <span className="font-medium">
            {showAddForm ? 'Hide' : editingId ? 'Edit Tag' : 'Add New Tag'}
          </span>
        </button>

        <div className="flex items-center gap-2">
          <ModuleSort
            options={[
              { label: 'Name (A-Z)', value: 'name_asc' },
              { label: 'Name (Z-A)', value: 'name_desc' },
              { label: 'Newest First', value: 'created_desc' },
              { label: 'Oldest First', value: 'created_asc' },
            ]}
            value={filterSort}
            onSortChange={setFilterSort}
          />
          <ModuleFilter
            jars={jars ?? []}
            selectedJarIds={filterJars}
            onFilterChange={({ jarIds }) => {
              setFilterJars(jarIds)
            }}
            showPriority={false}
            hideTags={true}
          />
        </div>
      </div>

      {/* Add/Edit Tag Form */}
      {showAddForm && (
        <div className="flex flex-col gap-3 relative animate-in slide-in-from-top-2 fade-in duration-300">
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setNameError(null)
              }}
              placeholder="Tag name (e.g., ClientWork, urgent-2024, backend_dev)"
              className={`w-full px-4 py-3 rounded-lg border ${
                nameError ? 'border-red-500/50' : 'border-white/10'
              } bg-white/5 backdrop-blur-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-transparent transition-all`}
            />
            {nameError && (
              <p className="text-red-400 text-xs mt-1">{nameError}</p>
            )}
          </div>

          <div className="relative">
            <MentionEditor
              key={editorKey}
              ref={null}
              jars={jars ?? []}
              tags={tags ?? []}
              showToolbar={false}
              onHTMLChange={setDescriptionHtml}
              className="w-full"
              editorClassName="focus:ring-2 focus:ring-purple-400/50"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={!name.trim()}
              onClick={handleSubmit}
              className="flex-1 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 disabled:from-purple-500/50 disabled:to-purple-600/50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-all shadow-lg shadow-purple-500/20"
            >
              {editingId ? 'Update Tag' : 'Add Tag'}
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

      <ul className="space-y-2">
        {tags?.map((tag) => {
          const formattedDate = new Date(tag.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })
          
          return (
          <li
            key={tag.id}
            className="group relative flex flex-col gap-2 p-3 rounded-lg border bg-white/10 border-white/10 hover:border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/5 transition-all duration-300"
          >
            <div className="flex items-start gap-4">
              <div className="mt-1 w-8 h-8 rounded shrink-0 bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-200">
                <Hash className="w-4 h-4" />
              </div>

              <div className="flex-1 min-w-0 flex flex-col gap-1">
                 <div className="flex justify-between items-start">
                   <h3 className="font-medium text-sm text-gray-100 leading-relaxed">
                     {tag.name}
                   </h3>
                </div>
                {tag.description && (
                  <div
                    className="text-sm text-white/70 prose prose-sm prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: tag.description }}
                  />
                )}
                
                <EntityPills 
                  jars={tag.linkedJars.map((l: any) => l.jar)} 
                  tags={tag.linkedTags.map((l: any) => l.targetTag)} 
                />
                
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
                        onClick={() => handleEdit(tag)}
                        className="p-1.5 text-white/40 hover:text-purple-400 hover:bg-purple-400/10 rounded transition-all"
                        aria-label="Edit tag"
                        >
                        <Pencil className="w-4 h-4" />
                        </button>
                        <button
                        type="button"
                        onClick={() => handleDelete(tag.id)}
                        className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded transition-all"
                        aria-label="Delete tag"
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

      {tags?.length === 0 && (
        <div className="text-center py-8 text-white/40">
          <Hash className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No tags yet. Create one to get started!</p>
        </div>
      )}
    </div>
  )
}
