import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import heic2any from 'heic2any'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowUp, Square, GitBranch, Bot, Plus, Lightbulb,
  MessageSquareDashed, BookOpen, Copy, Pencil, Check,
  X, Network, GitFork, AlertTriangle, Brain, FileText, UploadCloud,
} from 'lucide-react'
import { useChatStore } from '../store/useChatStore'
import type { Attachment, ConversationNode, ContextSource } from '../types'
import { ModelSelector } from './ModelSelector'

export interface PendingContextSource {
  source: ContextSource
  label: string         // first 4-5 words of the source node's user message
}

interface ChatWindowProps {
  onSend: (
    text: string,
    parentNodeId: string | null,
    conversationId: string | null,
    attachments: Attachment[],
    thinkingEnabled: boolean,
  ) => void
  isStreaming: boolean
  onStop: () => void
  inputValue: string
  onInputChange: (v: string) => void
  activeConversationId: string | null
  pendingContextSources: PendingContextSource[]
  onRemoveContextSource: (nodeId: string) => void
  onEditNode: (nodeId: string, newContent: string) => void
  // Pending provider/model for before the first message in a new conversation
  pendingProvider: import('../types').Provider
  pendingModel: string
  onPendingProviderChange: (p: import('../types').Provider) => void
  onPendingModelChange: (m: string) => void
  // Attachments
  pendingAttachments: Attachment[]
  onPendingAttachmentsChange: (atts: Attachment[]) => void
  // Thinking toggle
  thinkingEnabled: boolean
  onThinkingToggle: () => void
  // Error reporting (for unsupported drag-drop file types)
  onError?: (message: string) => void
}

// ── Bubble action buttons ────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button className="bubble-action-btn" onClick={handleCopy} title="Copy to clipboard">
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  )
}

interface UserBubbleProps {
  node: ConversationNode
  hasChildren: boolean
  childCount: number
  onEdit: (nodeId: string, newContent: string) => void
}

function UserBubble({ node, hasChildren, childCount, onEdit }: UserBubbleProps) {
  const [editMode, setEditMode]         = useState<'idle' | 'warning' | 'editing'>('idle')
  const [editValue, setEditValue]       = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (hasChildren) {
      setEditMode('warning')
    } else {
      setEditValue(node.userMessage.content)
      setEditMode('editing')
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }

  const handleConfirmWarning = () => {
    setEditValue(node.userMessage.content)
    setEditMode('editing')
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  const handleCancelWarning = () => setEditMode('idle')

  const handleSubmitEdit = () => {
    const trimmed = editValue.trim()
    if (!trimmed) return
    setEditMode('idle')
    onEdit(node.id, trimmed)
  }

  const handleCancelEdit = () => setEditMode('idle')

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmitEdit()
    }
    if (e.key === 'Escape') handleCancelEdit()
  }

  return (
    <div className="message-user">
      {/* Bubble — or warning/editing state */}
      {editMode === 'warning' && (
        <div className="bubble edit-warning-bubble">
          <div className="edit-warning-content">
            <AlertTriangle size={13} style={{ color: 'var(--color-error)', flexShrink: 0 }} />
            <span>Editing will remove {childCount} child branch{childCount !== 1 ? 'es' : ''}.</span>
          </div>
          <div className="edit-warning-actions">
            <button className="edit-warning-btn confirm" onClick={handleConfirmWarning}>
              Confirm &amp; Edit
            </button>
            <button className="edit-warning-btn cancel" onClick={handleCancelWarning}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {editMode === 'editing' && (
        <div className="bubble editing-bubble">
          <textarea
            ref={textareaRef}
            className="bubble-edit-textarea"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={handleEditKeyDown}
            rows={3}
          />
          <div className="bubble-edit-actions">
            <button className="bubble-edit-btn submit" onClick={handleSubmitEdit} title="Submit edit">
              <Check size={13} /> Submit
            </button>
            <button className="bubble-edit-btn cancel" onClick={handleCancelEdit} title="Cancel edit">
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
      )}

      {editMode === 'idle' && (
        <div className="bubble">
          {/* Inline attachment display */}
          {node.userMessage.attachments && node.userMessage.attachments.length > 0 && (
            <div className="bubble-attachments">
              {node.userMessage.attachments.map(att =>
                att.kind === 'image' ? (
                  <img
                    key={att.id}
                    src={att.dataUrl}
                    alt={att.name}
                    className="bubble-attachment-image"
                  />
                ) : (
                  <div key={att.id} className="bubble-attachment-file">
                    <FileText size={12} />
                    <span>{att.name}</span>
                  </div>
                )
              )}
            </div>
          )}
          {node.userMessage.content}
        </div>
      )}

      {/* Action buttons below bubble — right-aligned, shown on hover */}
      {editMode === 'idle' && (
        <div className="bubble-actions bubble-actions-user">
          <CopyButton text={node.userMessage.content} />
          <button className="bubble-action-btn" onClick={handleEditClick} title="Edit message">
            <Pencil size={12} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Attachment preview bar ────────────────────────────────────────────────────

function AttachmentPreviewBar({
  attachments,
  onRemove,
}: {
  attachments: Attachment[]
  onRemove: (id: string) => void
}) {
  if (attachments.length === 0) return null
  return (
    <div className="attachment-preview-bar">
      {attachments.map(att => (
        <div key={att.id} className="attachment-preview-item">
          {att.kind === 'image' ? (
            <img src={att.dataUrl} alt={att.name} className="attachment-thumb" />
          ) : (
            <div className="attachment-file-icon">
              <FileText size={16} />
            </div>
          )}
          <span className="attachment-preview-name">{att.name}</span>
          <button
            className="attachment-remove-btn"
            onClick={() => onRemove(att.id)}
            title="Remove attachment"
            aria-label={`Remove ${att.name}`}
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Thinking block ─────────────────────────────────────────────────────────────

function ThinkingBlock({ content }: { content: string }) {
  return (
    <details className="thinking-block">
      <summary className="thinking-block-summary">
        <Brain size={12} />
        <span>Thinking…</span>
      </summary>
      <div className="thinking-block-body">
        <pre className="thinking-block-content">{content}</pre>
      </div>
    </details>
  )
}

// ── Context source pills ──────────────────────────────────────────────────────

function ContextSourcesBar({
  sources,
  onRemove,
}: {
  sources: PendingContextSource[]
  onRemove: (nodeId: string) => void
}) {
  if (sources.length === 0) return null
  return (
    <div className="context-sources-bar">
      {sources.map(s => (
        <div key={s.source.nodeId} className={`context-pill context-pill-${s.source.type}`}>
          {s.source.type === 'node'
            ? <Network size={10} />
            : <GitFork size={10} />
          }
          <span className="context-pill-label">{s.label}</span>
          <button
            className="context-pill-remove"
            onClick={() => onRemove(s.source.nodeId)}
            title="Remove context"
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Main ChatWindow ───────────────────────────────────────────────────────────

// ── Allowed MIME types / extensions (mirrors the <input accept> list) ─────────
const ALLOWED_MIME_PREFIXES = ['image/', 'text/']
const ALLOWED_EXTENSIONS    = ['.pdf', '.md', '.txt', '.csv', '.json']
const HEIC_EXTENSIONS       = ['.heic', '.heif']

function isHeicFile(file: File): boolean {
  const lower = file.name.toLowerCase()
  return HEIC_EXTENSIONS.some(ext => lower.endsWith(ext))
    || file.type === 'image/heic'
    || file.type === 'image/heif'
}

function isAllowedFile(file: File): boolean {
  if (isHeicFile(file)) return true
  if (ALLOWED_MIME_PREFIXES.some(p => file.type.startsWith(p))) return true
  const lower = file.name.toLowerCase()
  return ALLOWED_EXTENSIONS.some(ext => lower.endsWith(ext))
}

export function ChatWindow({
  onSend,
  isStreaming,
  onStop,
  inputValue,
  onInputChange,
  activeConversationId,
  pendingContextSources,
  onRemoveContextSource,
  onEditNode,
  pendingProvider,
  pendingModel,
  onPendingProviderChange,
  onPendingModelChange,
  pendingAttachments,
  onPendingAttachmentsChange,
  thinkingEnabled,
  onThinkingToggle,
  onError,
}: ChatWindowProps) {
  const getThread       = useChatStore(s => s.getThread)
  const activeNodeId    = useChatStore(s => s.activeNodeId)
  const conversations   = useChatStore(s => s.conversations)

  const messagesEndRef  = useRef<HTMLDivElement>(null)
  const nodeRefs        = useRef<Record<string, HTMLDivElement | null>>({})
  const textareaRef     = useRef<HTMLTextAreaElement>(null)
  const prevActiveRef   = useRef<string | null>(null)
  const fileInputRef    = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef(0)  // tracks nested dragenter/dragleave

  // Derive thread from active node
  const thread: ConversationNode[] = useMemo(
    () => getThread(activeNodeId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeNodeId, conversations]
  )

  // Determine if we're branching mid-thread (active node has children)
  const conv = conversations.find(c => c.id === activeConversationId)
  const isLeafNode = useMemo(() => {
    if (!activeNodeId || !conv) return true
    return !conv.nodes.some(n => n.parentId === activeNodeId)
  }, [activeNodeId, conv])

  const activeNode = conv?.nodes.find(n => n.id === activeNodeId)
  const branchFromLabel = !isLeafNode && activeNode
    ? activeNode.userMessage.content.trim().split(/\s+/).slice(0, 5).join(' ') + '…'
    : null

  // Scroll to active node when it changes
  useEffect(() => {
    if (!activeNodeId || activeNodeId === prevActiveRef.current) return
    prevActiveRef.current = activeNodeId

    // Small delay to let the DOM update
    setTimeout(() => {
      const el = nodeRefs.current[activeNodeId]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    }, 50)
  }, [activeNodeId])

  // Auto-scroll on new streaming content
  useEffect(() => {
    if (isStreaming) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [isStreaming, thread])

  // Auto-grow textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onInputChange(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px'
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSend = () => {
    const text = inputValue.trim()
    if (!text || isStreaming) return
    onSend(text, activeNodeId, activeConversationId, pendingAttachments, thinkingEnabled)
    onInputChange('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  // ── Shared file processor (used by both + button and drag-drop) ───────────
  const processFiles = useCallback((files: File[]) => {
    const accepted: File[] = []
    const rejected: string[] = []

    for (const file of files) {
      if (isAllowedFile(file)) {
        accepted.push(file)
      } else {
        rejected.push(file.name)
      }
    }

    if (rejected.length > 0) {
      onError?.(`Unsupported file type${rejected.length > 1 ? 's' : ''}: ${rejected.join(', ')}`)
    }

    accepted.forEach(file => {
      const isImage = file.type.startsWith('image/') || isHeicFile(file)

      if (isHeicFile(file)) {
        // Convert HEIC/HEIF → JPEG in-browser so it can be displayed and sent
        heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
          .then(converted => {
            const blob = Array.isArray(converted) ? converted[0] : converted
            const reader = new FileReader()
            reader.onload = () => {
              const baseName = file.name.replace(/\.(heic|heif)$/i, '.jpg')
              const att: Attachment = {
                id:       `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                name:     baseName,
                mimeType: 'image/jpeg',
                kind:     'image',
                dataUrl:  reader.result as string,
              }
              onPendingAttachmentsChange([...pendingAttachments, att])
            }
            reader.readAsDataURL(blob)
          })
          .catch(() => {
            onError?.(`Could not convert HEIC file: ${file.name}`)
          })
        return
      }

      const reader = new FileReader()

      if (isImage) {
        reader.onload = () => {
          const att: Attachment = {
            id:       `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name:     file.name,
            mimeType: file.type,
            kind:     'image',
            dataUrl:  reader.result as string,
          }
          onPendingAttachmentsChange([...pendingAttachments, att])
        }
        reader.readAsDataURL(file)
      } else {
        reader.onload = () => {
          const att: Attachment = {
            id:            `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name:          file.name,
            mimeType:      file.type || 'text/plain',
            kind:          'file',
            dataUrl:       '',
            extractedText: reader.result as string,
          }
          onPendingAttachmentsChange([...pendingAttachments, att])
        }
        reader.readAsText(file)
      }
    })
  }, [pendingAttachments, onPendingAttachmentsChange, onError])

  // File picker handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    e.target.value = ''
    processFiles(files)
  }

  // ── Drag-and-drop handlers ─────────────────────────────────────────────────
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current += 1
    if (dragCounterRef.current === 1) setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current -= 1
    if (dragCounterRef.current === 0) setIsDragOver(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) processFiles(files)
  }

  const handleRemoveAttachment = (id: string) => {
    onPendingAttachmentsChange(pendingAttachments.filter(a => a.id !== id))
  }

  // Shared input area
  const inputArea = (
    <div className="chat-input-area">
      {branchFromLabel && (
        <div className="branching-from-badge">
          <div className="branching-from-badge-dot" />
          Branching from: {branchFromLabel}
        </div>
      )}
      <ContextSourcesBar sources={pendingContextSources} onRemove={onRemoveContextSource} />
      <AttachmentPreviewBar attachments={pendingAttachments} onRemove={handleRemoveAttachment} />
      <div className="chat-input-box">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.heic,.heif,text/*,.pdf,.md,.txt,.csv,.json"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
          id="attachment-file-input"
          aria-label="Attach files"
        />
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          placeholder={branchFromLabel ? 'Type to create a new branch…' : 'Ask anything'}
          value={inputValue}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <div className="chat-input-bottom-row">
          <div className="chat-input-actions-left">
            <button
              className="btn-icon-ghost"
              aria-label="Add attachment"
              id="btn-attachment"
              onClick={() => fileInputRef.current?.click()}
              title="Attach photo or file"
            >
              <Plus size={18} />
            </button>
            <button
              className={`btn-icon-ghost${thinkingEnabled && pendingProvider === 'claude' ? ' thinking-toggle-active' : ''}`}
              aria-label={thinkingEnabled ? 'Disable thinking' : 'Enable thinking'}
              id="btn-thinking-toggle"
              onClick={pendingProvider === 'claude' ? onThinkingToggle : undefined}
              disabled={pendingProvider !== 'claude'}
              title={pendingProvider === 'claude' ? (thinkingEnabled ? 'Thinking on' : 'Thinking off') : 'Thinking only available with Claude'}
            >
              <Lightbulb size={18} />
            </button>
            <button className="btn-icon-ghost" aria-label="Open chat settings" title="Chat settings">
              <MessageSquareDashed size={18} />
            </button>
            <button className="btn-icon-ghost" aria-label="Library" title="Library">
              <BookOpen size={18} />
            </button>
          </div>
          <div className="chat-input-actions-right">
            <ModelSelector
              pendingProvider={pendingProvider}
              pendingModel={pendingModel}
              onPendingProviderChange={onPendingProviderChange}
              onPendingModelChange={onPendingModelChange}
            />
            {isStreaming ? (
              <button className="btn-stop" onClick={onStop} id="btn-stop" aria-label="Stop generation">
                <Square size={14} />
              </button>
            ) : (
              <button
                className="btn-send"
                onClick={handleSend}
                disabled={!inputValue.trim() && pendingAttachments.length === 0}
                id="btn-send"
                aria-label="Send message"
              >
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  const dropOverlay = isDragOver && (
    <div className="drop-overlay" aria-hidden>
      <div className="drop-overlay-inner">
        <UploadCloud size={36} className="drop-overlay-icon" />
        <span className="drop-overlay-label">Drop files here</span>
        <span className="drop-overlay-hint">Images, text, PDF, CSV, JSON</span>
      </div>
    </div>
  )

  if (thread.length === 0) {
    return (
      <div
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {dropOverlay}
        <div className="chat-messages">
          <div className="chat-empty">
            <div className="chat-empty-icon">
              <Bot size={22} />
            </div>
            <h3>Start a conversation</h3>
            <p>Send a message to begin. Your conversation will grow into an interactive tree you can branch and explore.</p>
          </div>
        </div>
        {inputArea}
      </div>
    )
  }

  return (
    <div
      style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {dropOverlay}
      <div className="chat-messages">
        {thread.map((node, idx) => {
          const prevNode = idx > 0 ? thread[idx - 1] : null
          const modelChanged = prevNode && prevNode.aiMessage?.model !== node.userMessage.model &&
            prevNode.aiMessage?.model !== undefined

          const childCount = conv?.nodes.filter(n => n.parentId === node.id).length ?? 0
          const hasChildren = childCount > 0

          return (
            <div
              key={node.id}
              ref={el => { nodeRefs.current[node.id] = el }}
            >
              {/* Model change banner */}
              {modelChanged && (
                <div className="model-changed-banner">
                  <div className="model-changed-banner-inner">
                    <GitBranch size={10} />
                    Switched to {node.aiMessage?.model ?? 'unknown model'}
                  </div>
                </div>
              )}

              <div className="message-group">
                {/* User message */}
                <UserBubble
                  node={node}
                  hasChildren={hasChildren}
                  childCount={childCount}
                  onEdit={onEditNode}
                />

                {/* AI message — no avatar, copy button below */}
                {(node.aiMessage || node.status === 'processing') && (
                  <div className="message-ai">
                    <div className="message-ai-content">
                      <div className="message-ai-model-badge">
                        <Bot size={9} />
                        {node.aiMessage?.model ?? '…'}
                      </div>
                      {/* Thinking block (collapsible) */}
                      {node.aiMessage?.thinkingContent && (
                        <ThinkingBlock content={node.aiMessage.thinkingContent} />
                      )}
                      <div className="message-ai-bubble">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {node.aiMessage?.content ?? ''}
                        </ReactMarkdown>
                        {node.status === 'processing' && (
                          <span className="message-streaming-cursor" />
                        )}
                      </div>
                      {/* Copy button below AI bubble, left-aligned */}
                      {node.aiMessage && (
                        <div className="bubble-actions bubble-actions-ai">
                          <CopyButton text={node.aiMessage.content} />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {inputArea}
    </div>
  )
}
