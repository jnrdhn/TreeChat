import { memo, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { GitBranch, Loader2, Square, Trash2, Network, GitFork, Layers, AlertTriangle } from 'lucide-react'

export interface ConversationNodeData {
  label: string          // first 5-7 words of user message
  status: 'processing' | 'complete' | 'stopped'
  branchColor: string
  isActive: boolean
  model: string
  hasChildren: boolean
  hasContextSources: boolean
  showContextLines: boolean
  childCount: number
  onDelete: (nodeId: string) => void
  onAddNodeContext: (nodeId: string) => void
  onAddHistoryContext: (nodeId: string) => void
  onToggleContextLines: (nodeId: string) => void
}

function ConversationNodeComponent({ id, data }: NodeProps) {
  // data comes from react-flow and has a broad type; cast via unknown to satisfy TypeScript
  const d = data as unknown as ConversationNodeData
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)


  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (d.hasChildren) {
      setShowDeleteConfirm(true)
    } else {
      d.onDelete(id)
    }
  }

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowDeleteConfirm(false)
    d.onDelete(id)
  }

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowDeleteConfirm(false)
  }

  const handleNodeContext = (e: React.MouseEvent) => {
    e.stopPropagation()
    d.onAddNodeContext(id)
  }

  const handleHistoryContext = (e: React.MouseEvent) => {
    e.stopPropagation()
    d.onAddHistoryContext(id)
  }

  const handleToggleLines = (e: React.MouseEvent) => {
    e.stopPropagation()
    d.onToggleContextLines(id)
  }

  return (
    <div
      className={`conv-node ${d.isActive ? 'active' : ''} ${d.status !== 'complete' ? d.status : ''}`}
      style={{ borderColor: d.isActive ? d.branchColor : d.status === 'processing' ? 'var(--color-processing)' : `${d.branchColor}55` }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}
      />

      {/* Delete button — top right, shown on hover */}
      {!showDeleteConfirm && (
        <button
          className="conv-node-action-btn conv-node-delete-btn"
          onClick={handleDeleteClick}
          title="Delete node"
          aria-label="Delete node"
        >
          <Trash2 size={11} />
        </button>
      )}


      {/* Label */}
      <div className="conv-node-label" title={d.label}>
        {d.label}
      </div>

      {/* Meta */}
      <div className="conv-node-meta">
        {d.status === 'processing' && (
          <><Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} /> streaming</>
        )}
        {d.status === 'stopped' && (
          <><Square size={9} /> stopped</>
        )}
        {d.status === 'complete' && (
          <><GitBranch size={9} style={{ color: d.branchColor }} /> {d.model?.split(':')[0] || 'model'}</>
        )}
      </div>

      {/* Bottom action bar — context buttons, always rendered */}
      <div className="conv-node-bottom-actions">
        <button
          className="conv-node-action-btn conv-node-ctx-btn"
          onClick={handleNodeContext}
          title="Add this node's messages as context"
          aria-label="Add node context"
        >
          <Network size={10} />
        </button>
        <button
          className="conv-node-action-btn conv-node-ctx-btn"
          onClick={handleHistoryContext}
          title="Add full history (excluding common ancestors) as context"
          aria-label="Add history context"
        >
          <GitFork size={10} />
        </button>
        {/* Layers toggle — visible only when context sources exist, invisible otherwise to hold space */}
        <button
          className={`conv-node-action-btn conv-node-ctx-btn conv-node-layers-btn ${d.hasContextSources ? '' : 'invisible'} ${d.showContextLines ? 'active' : ''}`}
          onClick={handleToggleLines}
          title={d.showContextLines ? 'Hide context lines' : 'Show context lines'}
          aria-label="Toggle context lines"
          disabled={!d.hasContextSources}
        >
          <Layers size={10} />
        </button>
      </div>

      {/* Delete confirmation popover */}
      {showDeleteConfirm && (
        <div className="conv-node-delete-popover" onClick={e => e.stopPropagation()}>
          <div className="conv-node-delete-popover-header">
            <AlertTriangle size={12} style={{ color: 'var(--color-error)' }} />
            <span>Delete node + {d.childCount} descendant{d.childCount !== 1 ? 's' : ''}?</span>
          </div>
          <div className="conv-node-delete-popover-actions">
            <button className="conv-node-popover-btn confirm" onClick={handleConfirmDelete}>
              Delete
            </button>
            <button className="conv-node-popover-btn cancel" onClick={handleCancelDelete}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}
      />
    </div>
  )
}

export const ConversationNode = memo(ConversationNodeComponent)
