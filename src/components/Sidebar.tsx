import { useState, useRef } from 'react'
import { PlusCircle, Settings, MessageSquare, Trash2 } from 'lucide-react'
import { useChatStore } from '../store/useChatStore'

interface SidebarProps {
  onNewConversation: () => void
  onOpenSettings: () => void
  onConversationDeleted: (conversationId: string) => void
}

export function Sidebar({ onNewConversation, onOpenSettings, onConversationDeleted }: SidebarProps) {
  const conversations         = useChatStore(s => s.conversations)
  const activeConvId          = useChatStore(s => s.activeConversationId)
  const setActiveConversation = useChatStore(s => s.setActiveConversation)
  const renameConversation    = useChatStore(s => s.renameConversation)
  const deleteConversation    = useChatStore(s => s.deleteConversation)

  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [editValue,    setEditValue]    = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  const startRename = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(id)
    setEditValue(name)
    setTimeout(() => inputRef.current?.select(), 50)
  }

  const commitRename = (id: string) => {
    if (editValue.trim()) renameConversation(id, editValue.trim())
    setEditingId(null)
  }

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmDeleteId(id)
  }

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirmDeleteId) return
    const idToDelete = confirmDeleteId
    deleteConversation(idToDelete)
    setConfirmDeleteId(null)
    onConversationDeleted(idToDelete)
  }

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmDeleteId(null)
  }

  return (
    <div className="sidebar open">
      <div className="sidebar-header">
        <span className="sidebar-logo">🌿 TreeChat</span>
      </div>

      <button className="btn-new-conversation" onClick={onNewConversation} id="btn-new-conversation">
        <PlusCircle size={15} />
        New Conversation
      </button>

      <div className="conversation-list">
        {conversations.length === 0 && (
          <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            No conversations yet
          </div>
        )}
        {conversations.map(conv => (
          <div
            key={conv.id}
            className={`conversation-item ${conv.id === activeConvId ? 'active' : ''}`}
            onClick={() => setActiveConversation(conv.id)}
            id={`conv-${conv.id}`}
          >
            <MessageSquare size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />

            {/* Name / rename input */}
            {editingId === conv.id ? (
              <input
                ref={inputRef}
                className="conversation-item-name-input"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => commitRename(conv.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename(conv.id)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span
                className="conversation-item-name"
                onDoubleClick={e => startRename(conv.id, conv.name, e)}
                title="Double-click to rename"
              >
                {conv.name}
              </span>
            )}

            {/* Delete action area */}
            {confirmDeleteId === conv.id ? (
              <div className="conv-delete-confirm" onClick={e => e.stopPropagation()}>
                <button className="conv-delete-btn yes" onClick={handleConfirmDelete} title="Confirm delete">
                  Yes
                </button>
                <button className="conv-delete-btn no" onClick={handleCancelDelete} title="Cancel delete">
                  No
                </button>
              </div>
            ) : (
              <button
                className="conv-trash-btn"
                onClick={e => handleDeleteClick(conv.id, e)}
                title="Delete conversation"
                aria-label="Delete conversation"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
        </span>
        <button className="btn-icon" onClick={onOpenSettings} id="btn-settings" aria-label="Open settings">
          <Settings size={14} />
        </button>
      </div>
    </div>
  )
}
