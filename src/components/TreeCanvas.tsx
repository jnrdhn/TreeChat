import { useCallback, useMemo, useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'
import { useChatStore } from '../store/useChatStore'
import { ConversationNode, type ConversationNodeData } from './ConversationNode'

const nodeTypes = { conversationNode: ConversationNode }

const NODE_WIDTH  = 200
const NODE_HEIGHT = 72

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', ranksep: 60, nodesep: 40, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))

  nodes.forEach(n => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }))
  edges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)

  return nodes.map(n => {
    const pos = g.node(n.id)
    return { ...n, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } }
  })
}

interface TreeCanvasInnerProps {
  onAddNodeContext: (nodeId: string) => void
  onAddHistoryContext: (nodeId: string) => void
  newNodeId: string | null   // ID of the most recently CREATED node (not just selected)
}

function TreeCanvasInner({ onAddNodeContext, onAddHistoryContext, newNodeId }: TreeCanvasInnerProps) {
  const conversations       = useChatStore(s => s.conversations)
  const activeConvId        = useChatStore(s => s.activeConversationId)
  const activeNodeId        = useChatStore(s => s.activeNodeId)
  const setActiveNode       = useChatStore(s => s.setActiveNode)
  const deleteNode          = useChatStore(s => s.deleteNode)
  const setNodeContextLines = useChatStore(s => s.setNodeContextLines)

  const { fitView } = useReactFlow()
  const prevNewNodeId = useRef<string | null>(null)

  const conv = useMemo(
    () => conversations.find(c => c.id === activeConvId),
    [conversations, activeConvId]
  )

  // ── Callbacks for node actions ─────────────────────────────────────────────

  const handleDeleteNode = useCallback((nodeId: string) => {
    if (!activeConvId) return
    deleteNode(activeConvId, nodeId)
  }, [activeConvId, deleteNode])

  const handleAddNodeContext = useCallback((nodeId: string) => {
    onAddNodeContext(nodeId)
  }, [onAddNodeContext])

  const handleAddHistoryContext = useCallback((nodeId: string) => {
    onAddHistoryContext(nodeId)
  }, [onAddHistoryContext])

  const handleToggleContextLines = useCallback((nodeId: string) => {
    if (!activeConvId || !conv) return
    const node = conv.nodes.find(n => n.id === nodeId)
    if (!node) return
    setNodeContextLines(activeConvId, nodeId, !node.showContextLines)
  }, [activeConvId, conv, setNodeContextLines])

  // ── Build nodes & edges ────────────────────────────────────────────────────

  const { nodes: layoutNodes, edges } = useMemo(() => {
    if (!conv || conv.nodes.length === 0) return { nodes: [], edges: [] }

    const rawNodes: Node[] = conv.nodes.map(n => {
      const childCount = conv.nodes.filter(c => c.parentId === n.id).length
      return {
        id: n.id,
        type: 'conversationNode',
        position: { x: 0, y: 0 }, // overridden by dagre
        data: {
          label: n.userMessage.content.trim().split(/\s+/).slice(0, 6).join(' ') + '…',
          status: n.status,
          branchColor: n.branchColor,
          isActive: n.id === activeNodeId,
          model: n.aiMessage?.model ?? '',
          hasChildren: childCount > 0,
          childCount,
          hasContextSources: (n.contextSources?.length ?? 0) > 0,
          showContextLines: n.showContextLines ?? false,
          onDelete: handleDeleteNode,
          onAddNodeContext: handleAddNodeContext,
          onAddHistoryContext: handleAddHistoryContext,
          onToggleContextLines: handleToggleContextLines,
        } satisfies ConversationNodeData,
      }
    })

    // Structural edges (from parent → child)
    const structuralEdges: Edge[] = conv.nodes
      .filter(n => n.parentId !== null)
      .map(n => ({
        id:     `e-${n.parentId}-${n.id}`,
        source: n.parentId!,
        target: n.id,
        style:  { stroke: n.branchColor, opacity: 0.5 },
        animated: n.status === 'processing',
        zIndex: 0,
      }))

    const layouted = applyDagreLayout(rawNodes, structuralEdges)

    // Context edges (gray dashed) — added AFTER layout so they don't affect dagre
    const contextEdges: Edge[] = []
    for (const n of conv.nodes) {
      if (!n.showContextLines || !n.contextSources?.length) continue
      for (const src of n.contextSources) {
        const isHistory = src.type === 'history'
        contextEdges.push({
          id: `ctx-${src.nodeId}-${n.id}-${src.type}`,
          source: src.nodeId,
          target: n.id,
          // Feature 5 (node): auto-route — no hardcoded handles, ReactFlow picks shortest path
          // Feature 6 (history): bottom → top via default handles
          sourceHandle: isHistory ? undefined : undefined,
          targetHandle: isHistory ? undefined : undefined,
          style: {
            stroke: 'rgba(160,160,160,0.45)',
            strokeDasharray: isHistory ? '' : '5 4',
            strokeWidth: 1.5,
          },
          animated: false,
          zIndex: -1,
          type: 'default',  // smoothstep auto-routes around nodes cleanly
        })
      }
    }

    return { nodes: layouted, edges: [...structuralEdges, ...contextEdges] }
  }, [conv, activeNodeId, handleDeleteNode, handleAddNodeContext, handleAddHistoryContext, handleToggleContextLines])

  // ── Feature 3: Auto-focus only on node CREATION (not selection) ────────────

  useEffect(() => {
    if (!newNodeId || newNodeId === prevNewNodeId.current) return
    prevNewNodeId.current = newNodeId
    // Small delay to let ReactFlow update its internal node positions
    setTimeout(() => {
      fitView({
        nodes: [{ id: newNodeId }],
        duration: 500,
        padding: 0.4,
        maxZoom: 1.2,
      })
    }, 80)
  }, [newNodeId, fitView])

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setActiveNode(node.id)
    },
    [setActiveNode]
  )

  return (
    <ReactFlow
      nodes={layoutNodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      fitView
      fitViewOptions={{ padding: 0.3, maxZoom: 1.2 }}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(255,255,255,0.04)" />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}

interface TreeCanvasProps {
  onAddNodeContext: (nodeId: string) => void
  onAddHistoryContext: (nodeId: string) => void
  newNodeId: string | null
}

export function TreeCanvas(props: TreeCanvasProps) {
  return (
    <ReactFlowProvider>
      <TreeCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
