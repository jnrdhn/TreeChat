import { useEffect, useRef, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowUp, Square, GitBranch, Bot, Plus, Lightbulb,
  MessageSquareDashed, BookOpen, Copy, Pencil, Check,
  X, Network, GitFork, AlertTriangle
} from 'lucide-react'
import { useChatStore } from '../store/useChatStore'
import type { ConversationNode, ContextSource } from '../types'
import { ModelSelector } from './ModelSelector'

export interface PendingContextSource {
  source: ContextSource
  label: string         // first 4-5 words of the source node's user message
}

interface ChatWindowProps {
  onSend: (text: string, parentNodeId: string | null, conversationId: string | null) => void
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
}: ChatWindowProps) {
  const getThread       = useChatStore(s => s.getThread)
  const activeNodeId    = useChatStore(s => s.activeNodeId)
  const conversations   = useChatStore(s => s.conversations)

  const messagesEndRef  = useRef<HTMLDivElement>(null)
  const nodeRefs        = useRef<Record<string, HTMLDivElement | null>>({})
  const textareaRef     = useRef<HTMLTextAreaElement>(null)
  const prevActiveRef   = useRef<string | null>(null)

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
    onSend(text, activeNodeId, activeConversationId)
    onInputChange('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
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
      <div className="chat-input-box">
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
            <button className="btn-icon-ghost" aria-label="Add attachment"><Plus size={18} /></button>
            <button className="btn-icon-ghost" aria-label="Use prompt template"><Lightbulb size={18} /></button>
            <button className="btn-icon-ghost" aria-label="Open chat settings"><MessageSquareDashed size={18} /></button>
            <button className="btn-icon-ghost" aria-label="Library"><BookOpen size={18} /></button>
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
                disabled={!inputValue.trim()}
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

  if (thread.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
