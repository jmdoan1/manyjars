// src/components/modules/tags-module.tsx
import { useCallback, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTRPC } from '@/integrations/trpc/react'
import { Hash, PlusCircle, Pencil, Trash2 } from 'lucide-react'
import { MentionEditor } from "../mentions/mention-editor"
import {
  validateJarTagName,
} from '@/hooks/use-mentions'
import type { ModuleProps } from '@/types/dashboard-types'

export function TagsModule(_props: ModuleProps) {
  const trpc = useTRPC()

  const { data: tags, refetch } = useQuery(trpc.tags.list.queryOptions())
  const { data: jars } = useQuery(trpc.jars.list.queryOptions())

  const [name, setName] = useState('')
  const [descriptionHtml, setDescriptionHtml] = useState('')
  const [editorKey, setEditorKey] = useState(0)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)



  const { mutate: addTag } = useMutation({
    ...trpc.tags.create.mutationOptions(),
    onSuccess: () => {
      refetch()
      resetForm()
    },
    onError: (error) => {
      setNameError(error.message)
    },
  })

  const { mutate: updateTag } = useMutation({
    ...trpc.tags.update.mutationOptions(),
    onSuccess: () => {
      refetch()
      resetForm()
    },
    onError: (error) => {
      setNameError(error.message)
    },
  })

  const { mutate: deleteTag } = useMutation({
    ...trpc.tags.delete.mutationOptions(),
    onSuccess: () => {
      refetch()
    },
  })

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
      updateTag({
        id: editingId,
        name,
        description: descriptionHtml || null,
      })
    } else {
      addTag({
        name,
        description: descriptionHtml || undefined,
      })
    }
  }, [name, descriptionHtml, editingId, addTag, updateTag])

  const handleEdit = useCallback((tag: NonNullable<typeof tags>[number]) => {
    setEditingId(tag.id)
    setName(tag.name)
    setDescriptionHtml(tag.description || '')
    setEditorKey((k) => k + 1)
    setShowAddForm(true)
  }, [])

  const handleDelete = useCallback((id: string) => {
    if (confirm('Are you sure you want to delete this tag?')) {
      deleteTag({ id })
    }
  }, [deleteTag])



  return (
    <div className="flex flex-col gap-4">
      {/* Add/Edit Tag Toggle Button */}
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

      {/* Tags List */}
      <ul className="space-y-2">
        {tags?.map((tag) => (
          <li
            key={tag.id}
            className="bg-white/5 border border-white/10 rounded-lg p-4 backdrop-blur-sm shadow-md hover:border-purple-400/30 transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Hash className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <h3 className="text-white font-semibold truncate">{tag.name}</h3>
                </div>
                {tag.description && (
                  <div
                    className="text-sm text-white/70 prose prose-sm prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: tag.description }}
                  />
                )}
                {(tag.linkedJars.length > 0 || tag.linkedTags.length > 0) && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {tag.linkedJars.map((link) => (
                      <span
                        key={link.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20"
                      >
                        @{link.jar.name}
                      </span>
                    ))}
                    {tag.linkedTags.map((link) => (
                      <span
                        key={link.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20"
                      >
                        #{link.targetTag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleEdit(tag)}
                  className="p-2 text-white/40 hover:text-purple-400 transition-colors"
                  aria-label="Edit tag"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(tag.id)}
                  className="p-2 text-white/40 hover:text-red-400 transition-colors"
                  aria-label="Delete tag"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </li>
        ))}
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
