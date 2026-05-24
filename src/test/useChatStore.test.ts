/**
 * Tests for useChatStore — the core state manager.
 * Tests verify BEHAVIOR through the public store interface, not implementation.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useChatStore } from '../store/useChatStore'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeNode(id: string, parentId: string | null, userContent: string) {
  return {
    id,
    parentId,
    branchColor: '#6366f1',
    userMessage: { id: `${id}-u`, role: 'user' as const, content: userContent, model: 'llama3', timestamp: Date.now() },
    aiMessage: null,
    status: 'processing' as const,
  }
}

// Reset store between tests so state doesn't bleed
beforeEach(() => {
  useChatStore.setState({
    conversations: [],
    activeConversationId: null,
    activeNodeId: null,
  })
})

// ─── Slice 1: Thread Derivation ──────────────────────────────────────────────

describe('getThread(nodeId)', () => {
  it('returns an empty array when there are no conversations', () => {
    const { result } = renderHook(() => useChatStore())
    expect(result.current.getThread(null)).toEqual([])
  })

  it('returns the single root node for a root-only conversation', () => {
    const root = makeNode('root', null, 'Hello')
    act(() => {
      useChatStore.setState({
        conversations: [{ id: 'conv1', name: 'Test', nodes: [root], createdAt: 0, updatedAt: 0 }],
        activeConversationId: 'conv1',
        activeNodeId: 'root',
      })
    })
    const { result } = renderHook(() => useChatStore())
    expect(result.current.getThread('root')).toEqual([root])
  })

  it('returns the correct ancestor chain from root to the given node', () => {
    const root = makeNode('n1', null, 'First')
    const child = makeNode('n2', 'n1', 'Second')
    const grandchild = makeNode('n3', 'n2', 'Third')
    act(() => {
      useChatStore.setState({
        conversations: [{
          id: 'conv1', name: 'Test', nodes: [root, child, grandchild], createdAt: 0, updatedAt: 0
        }],
        activeConversationId: 'conv1',
        activeNodeId: 'n3',
      })
    })
    const { result } = renderHook(() => useChatStore())
    expect(result.current.getThread('n3')).toEqual([root, child, grandchild])
  })

  it('returns only the branch path, not nodes from a sibling branch', () => {
    const root = makeNode('n1', null, 'Root')
    const mainBranch = makeNode('n2', 'n1', 'Main')
    const sideBranch = makeNode('n3', 'n1', 'Side') // branches from root, sibling of n2
    act(() => {
      useChatStore.setState({
        conversations: [{
          id: 'conv1', name: 'Test', nodes: [root, mainBranch, sideBranch], createdAt: 0, updatedAt: 0
        }],
        activeConversationId: 'conv1',
        activeNodeId: 'n2',
      })
    })
    const { result } = renderHook(() => useChatStore())
    // Thread for n2 should NOT include n3 (the sibling branch)
    expect(result.current.getThread('n2')).toEqual([root, mainBranch])
  })
})

// ─── Slice 2: addNode ────────────────────────────────────────────────────────

describe('addNode(conversationId, parentId, userMessage)', () => {
  it('creates a new node with processing status and correct parentId', () => {
    const root = makeNode('root', null, 'First message')
    act(() => {
      useChatStore.setState({
        conversations: [{
          id: 'conv1', name: 'Test', nodes: [root], createdAt: 0, updatedAt: 0
        }],
        activeConversationId: 'conv1',
        activeNodeId: 'root',
      })
    })

    const { result } = renderHook(() => useChatStore())
    let newNodeId: string = ''

    act(() => {
      newNodeId = result.current.addNode('conv1', 'root', {
        id: 'msg-u2', role: 'user', content: 'Second message', model: 'llama3', timestamp: Date.now()
      })
    })

    const conv = result.current.conversations.find(c => c.id === 'conv1')!
    const newNode = conv.nodes.find(n => n.id === newNodeId)!
    expect(newNode).toBeDefined()
    expect(newNode.parentId).toBe('root')
    expect(newNode.status).toBe('processing')
    expect(newNode.aiMessage).toBeNull()
  })
})

// ─── Slice 3: completeNode ───────────────────────────────────────────────────

describe('completeNode(conversationId, nodeId, aiMessage)', () => {
  it('transitions a processing node to complete and sets the aiMessage', () => {
    const node = makeNode('n1', null, 'Question')
    act(() => {
      useChatStore.setState({
        conversations: [{ id: 'conv1', name: 'Test', nodes: [node], createdAt: 0, updatedAt: 0 }],
        activeConversationId: 'conv1',
        activeNodeId: 'n1',
      })
    })

    const aiMsg = { id: 'ai-1', role: 'assistant' as const, content: 'Answer', model: 'llama3', timestamp: Date.now() }
    const { result } = renderHook(() => useChatStore())
    act(() => {
      result.current.completeNode('conv1', 'n1', aiMsg)
    })

    const conv = result.current.conversations.find(c => c.id === 'conv1')!
    const updatedNode = conv.nodes.find(n => n.id === 'n1')!
    expect(updatedNode.status).toBe('complete')
    expect(updatedNode.aiMessage).toEqual(aiMsg)
  })
})

// ─── Slice 4: stopNode ───────────────────────────────────────────────────────

describe('stopNode(conversationId, nodeId, partialContent)', () => {
  it('transitions a processing node to stopped and preserves partial aiMessage', () => {
    const node = makeNode('n1', null, 'Question')
    act(() => {
      useChatStore.setState({
        conversations: [{ id: 'conv1', name: 'Test', nodes: [node], createdAt: 0, updatedAt: 0 }],
        activeConversationId: 'conv1',
        activeNodeId: 'n1',
      })
    })

    const { result } = renderHook(() => useChatStore())
    act(() => {
      result.current.stopNode('conv1', 'n1', 'Partial answ', 'llama3')
    })

    const conv = result.current.conversations.find(c => c.id === 'conv1')!
    const updatedNode = conv.nodes.find(n => n.id === 'n1')!
    expect(updatedNode.status).toBe('stopped')
    expect(updatedNode.aiMessage?.content).toBe('Partial answ')
  })
})
