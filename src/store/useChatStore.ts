import { create } from 'zustand'
import type { Conversation, ConversationNode, ContextSource, Message } from '../types'

// ─── Branch Color Palette ─────────────────────────────────────────────────────

const BRANCH_COLORS = [
  '#6366f1', // indigo (primary / root)
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
  '#84cc16', // lime
  '#14b8a6', // teal
]

/**
 * Picks the first color from BRANCH_COLORS not already used in the conversation.
 * Falls back to wrapping around if all colors are exhausted.
 */
function pickFreshColor(usedColors: Set<string>): string {
  const fresh = BRANCH_COLORS.find(c => !usedColors.has(c))
  // all colors exhausted — wrap with a simple hash to keep variety
  if (!fresh) return BRANCH_COLORS[usedColors.size % BRANCH_COLORS.length]
  return fresh
}

// ─── ID Generator ─────────────────────────────────────────────────────────────

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns all descendant node IDs (not including the node itself). */
function getDescendantIds(nodes: ConversationNode[], nodeId: string): string[] {
  const result: string[] = []
  const queue = [nodeId]
  while (queue.length > 0) {
    const current = queue.shift()!
    const children = nodes.filter(n => n.parentId === current)
    for (const child of children) {
      result.push(child.id)
      queue.push(child.id)
    }
  }
  return result
}

// ─── Store Shape ──────────────────────────────────────────────────────────────

interface ChatStoreState {
  conversations: Conversation[]
  activeConversationId: string | null
  activeNodeId: string | null

  // Selectors
  getThread: (nodeId: string | null) => ConversationNode[]
  getActiveConversation: () => Conversation | null
  getAncestors: (conversationId: string, nodeId: string) => ConversationNode[]

  // Actions
  createConversation: (firstUserMessage: string) => string
  addNode: (
    conversationId: string,
    parentId: string | null,
    userMessage: Message,
    contextSources?: ContextSource[]
  ) => string
  updateNodeStream: (conversationId: string, nodeId: string, chunk: string) => void
  completeNode: (conversationId: string, nodeId: string, aiMessage: Message) => void
  stopNode: (conversationId: string, nodeId: string, partialContent: string, model: string) => void
  setActiveConversation: (conversationId: string) => void
  setActiveNode: (nodeId: string) => void
  renameConversation: (conversationId: string, name: string) => void

  // New actions (Features 1–6)
  deleteNode: (conversationId: string, nodeId: string) => void
  deleteConversation: (conversationId: string) => void
  editNodeUserMessage: (conversationId: string, nodeId: string, newContent: string) => void
  setNodeContextLines: (conversationId: string, nodeId: string, show: boolean) => void
}

// ─── Store Implementation ─────────────────────────────────────────────────────

export const useChatStore = create<ChatStoreState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  activeNodeId: null,

  // ── Selectors ──────────────────────────────────────────────────────────────

  getThread(nodeId) {
    if (!nodeId) return []
    const { conversations, activeConversationId } = get()
    const conv = conversations.find(c => c.id === activeConversationId)
    if (!conv) return []

    // Walk the ancestor chain from nodeId → root
    const nodeMap = new Map(conv.nodes.map(n => [n.id, n]))
    const chain: ConversationNode[] = []
    let current = nodeMap.get(nodeId)
    while (current) {
      chain.unshift(current)
      current = current.parentId ? nodeMap.get(current.parentId) : undefined
    }
    return chain
  },

  getActiveConversation() {
    const { conversations, activeConversationId } = get()
    return conversations.find(c => c.id === activeConversationId) ?? null
  },

  getAncestors(conversationId, nodeId) {
    const { conversations } = get()
    const conv = conversations.find(c => c.id === conversationId)
    if (!conv) return []
    const nodeMap = new Map(conv.nodes.map(n => [n.id, n]))
    const ancestors: ConversationNode[] = []
    let current = nodeMap.get(nodeId)
    while (current?.parentId) {
      const parent = nodeMap.get(current.parentId)
      if (!parent) break
      ancestors.unshift(parent)
      current = parent
    }
    return ancestors
  },

  // ── Actions ────────────────────────────────────────────────────────────────

  createConversation(firstUserMessage) {
    const id = generateId()
    const name = firstUserMessage.trim().split(/\s+/).slice(0, 5).join(' ')
    const newConv: Conversation = {
      id,
      name,
      nodes: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set(state => ({
      conversations: [newConv, ...state.conversations],
      activeConversationId: id,
      activeNodeId: null,
    }))
    return id
  },

  addNode(conversationId, parentId, userMessage, contextSources) {
    const { conversations } = get()
    const conv = conversations.find(c => c.id === conversationId)
    if (!conv) throw new Error(`Conversation ${conversationId} not found`)

    // How many siblings already branch off this parent?
    const siblingCount = conv.nodes.filter(n => n.parentId === parentId).length

    let branchColor: string
    if (parentId === null) {
      // Root node → always primary color
      branchColor = BRANCH_COLORS[0]
    } else if (siblingCount === 0) {
      // First (and only) child → inherit parent's color
      const parent = conv.nodes.find(n => n.id === parentId)
      branchColor = parent?.branchColor ?? BRANCH_COLORS[0]
    } else {
      // A genuine branch (second+ child off the same parent) → pick a fresh color
      const usedColors = new Set(conv.nodes.map(n => n.branchColor))
      branchColor = pickFreshColor(usedColors)
    }

    const newNode: ConversationNode = {
      id: generateId(),
      parentId,
      branchColor,
      userMessage,
      aiMessage: null,
      status: 'processing',
      contextSources: contextSources && contextSources.length > 0 ? contextSources : undefined,
      showContextLines: contextSources && contextSources.length > 0 ? true : undefined,
    }

    set(state => ({
      conversations: state.conversations.map(c =>
        c.id === conversationId
          ? { ...c, nodes: [...c.nodes, newNode], updatedAt: Date.now() }
          : c
      ),
      activeNodeId: newNode.id,
    }))

    return newNode.id
  },

  updateNodeStream(conversationId, nodeId, chunk) {
    set(state => ({
      conversations: state.conversations.map(c => {
        if (c.id !== conversationId) return c
        return {
          ...c,
          nodes: c.nodes.map(n => {
            if (n.id !== nodeId) return n
            const existing = n.aiMessage?.content ?? ''
            return {
              ...n,
              aiMessage: {
                id: n.aiMessage?.id ?? generateId(),
                role: 'assistant',
                content: existing + chunk,
                model: n.aiMessage?.model ?? '',
                timestamp: n.aiMessage?.timestamp ?? Date.now(),
              },
            }
          }),
        }
      }),
    }))
  },

  completeNode(conversationId, nodeId, aiMessage) {
    set(state => ({
      conversations: state.conversations.map(c => {
        if (c.id !== conversationId) return c
        return {
          ...c,
          nodes: c.nodes.map(n =>
            n.id === nodeId
              ? { ...n, aiMessage, status: 'complete', showContextLines: false }
              : n
          ),
          updatedAt: Date.now(),
        }
      }),
    }))
  },

  stopNode(conversationId, nodeId, partialContent, model) {
    set(state => ({
      conversations: state.conversations.map(c => {
        if (c.id !== conversationId) return c
        return {
          ...c,
          nodes: c.nodes.map(n => {
            if (n.id !== nodeId) return n
            return {
              ...n,
              status: 'stopped',
              showContextLines: false,
              aiMessage: {
                id: n.aiMessage?.id ?? generateId(),
                role: 'assistant',
                content: partialContent,
                model,
                timestamp: n.aiMessage?.timestamp ?? Date.now(),
              },
            }
          }),
          updatedAt: Date.now(),
        }
      }),
    }))
  },

  setActiveConversation(conversationId) {
    const { conversations } = get()
    const conv = conversations.find(c => c.id === conversationId)
    // Set active node to the deepest node in the main thread (last complete leaf)
    const leafNode = conv?.nodes[conv.nodes.length - 1]
    set({ activeConversationId: conversationId, activeNodeId: leafNode?.id ?? null })
  },

  setActiveNode(nodeId) {
    set({ activeNodeId: nodeId })
  },

  renameConversation(conversationId, name) {
    set(state => ({
      conversations: state.conversations.map(c =>
        c.id === conversationId ? { ...c, name } : c
      ),
    }))
  },

  // ── Feature 1: Delete node ─────────────────────────────────────────────────

  deleteNode(conversationId, nodeId) {
    const { conversations, activeNodeId } = get()
    const conv = conversations.find(c => c.id === conversationId)
    if (!conv) return

    // Collect the node and all its descendants
    const descendantIds = getDescendantIds(conv.nodes, nodeId)
    const idsToDelete = new Set([nodeId, ...descendantIds])

    // Find the node being deleted to determine its parent
    const deletedNode = conv.nodes.find(n => n.id === nodeId)
    const parentId = deletedNode?.parentId ?? null

    // Determine new active node if the active node is being deleted
    let newActiveNodeId = activeNodeId
    if (activeNodeId && idsToDelete.has(activeNodeId)) {
      // Closest surviving ancestor = parent of deleted node
      if (parentId !== null) {
        newActiveNodeId = parentId
      } else {
        // Deleted root node — find any remaining node or null
        const remaining = conv.nodes.filter(n => !idsToDelete.has(n.id))
        newActiveNodeId = remaining.length > 0 ? remaining[remaining.length - 1].id : null
      }
    }

    set(state => ({
      conversations: state.conversations.map(c =>
        c.id === conversationId
          ? {
              ...c,
              nodes: c.nodes.filter(n => !idsToDelete.has(n.id)),
              updatedAt: Date.now(),
            }
          : c
      ),
      activeNodeId: newActiveNodeId,
    }))
  },

  // ── Feature 4: Delete conversation ────────────────────────────────────────

  deleteConversation(conversationId) {
    set(state => ({
      conversations: state.conversations.filter(c => c.id !== conversationId),
      activeConversationId:
        state.activeConversationId === conversationId ? null : state.activeConversationId,
      activeNodeId:
        state.activeConversationId === conversationId ? null : state.activeNodeId,
    }))
  },

  // ── Feature 2: Edit node user message ─────────────────────────────────────

  editNodeUserMessage(conversationId, nodeId, newContent) {
    const { conversations } = get()
    const conv = conversations.find(c => c.id === conversationId)
    if (!conv) return

    // Delete all descendants
    const descendantIds = new Set(getDescendantIds(conv.nodes, nodeId))

    set(state => ({
      conversations: state.conversations.map(c => {
        if (c.id !== conversationId) return c
        return {
          ...c,
          nodes: c.nodes
            .filter(n => !descendantIds.has(n.id))
            .map(n =>
              n.id === nodeId
                ? {
                    ...n,
                    userMessage: { ...n.userMessage, content: newContent, timestamp: Date.now() },
                    aiMessage: null,
                    status: 'processing' as const,
                  }
                : n
            ),
          updatedAt: Date.now(),
        }
      }),
      activeNodeId: nodeId,
    }))
  },

  // ── Features 5 & 6: Toggle context lines ──────────────────────────────────

  setNodeContextLines(conversationId, nodeId, show) {
    set(state => ({
      conversations: state.conversations.map(c => {
        if (c.id !== conversationId) return c
        return {
          ...c,
          nodes: c.nodes.map(n =>
            n.id === nodeId ? { ...n, showContextLines: show } : n
          ),
        }
      }),
    }))
  },
}))
