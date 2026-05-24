import { useCallback, useEffect, useRef, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { useChatStore } from './store/useChatStore'
import { useSettingsStore } from './store/useSettingsStore'
import { saveConversation, loadAllConversations, deleteConversation as dbDeleteConversation } from './store/db'
import { streamChat, type ContextBlock } from './api/llmService'
import { Sidebar } from './components/Sidebar'
import { TreeCanvas } from './components/TreeCanvas'
import { ChatWindow, type PendingContextSource } from './components/ChatWindow'
import { SettingsModal } from './components/SettingsModal'
import type { ContextSource } from './types'
import './index.css'

const MIN_CANVAS_WIDTH = 280
const MIN_CHAT_WIDTH   = 320

export default function App() {
  // ── Store ────────────────────────────────────────────────────────────────
  const conversations       = useChatStore(s => s.conversations)
  const activeConvId        = useChatStore(s => s.activeConversationId)
  const createConversation  = useChatStore(s => s.createConversation)
  const addNode             = useChatStore(s => s.addNode)
  const updateNodeStream    = useChatStore(s => s.updateNodeStream)
  const completeNode        = useChatStore(s => s.completeNode)
  const stopNode            = useChatStore(s => s.stopNode)
  const getThread           = useChatStore(s => s.getThread)
  const editNodeUserMessage = useChatStore(s => s.editNodeUserMessage)

  const ollamaBaseUrl  = useSettingsStore(s => s.ollamaBaseUrl)
  const selectedModel  = useSettingsStore(s => s.selectedModel)

  // ── Local UI state ───────────────────────────────────────────────────────
  const [sidebarOpen,    setSidebarOpen]    = useState(false)
  const [showSettings,   setShowSettings]   = useState(false)
  const [isStreaming,    setIsStreaming]     = useState(false)
  const [inputValue,     setInputValue]     = useState('')
  const [canvasVisible,  setCanvasVisible]  = useState(false)
  const [canvasWidth,    setCanvasWidth]    = useState<number | null>(null)

  // ── Context sources (Features 5 & 6) ─────────────────────────────────────
  const [pendingContextSources, setPendingContextSources] = useState<PendingContextSource[]>([])
  // ── Track newly created node for auto-focus (Feature 3) ──────────────────
  const [newNodeId, setNewNodeId] = useState<string | null>(null)

  const abortRef    = useRef<AbortController | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef  = useRef(false)
  const startXRef    = useRef(0)
  const startWRef    = useRef(0)

  // ── Load persisted conversations on mount ─────────────────────────────
  useEffect(() => {
    loadAllConversations().then(convs => {
      if (convs.length > 0) {
        useChatStore.setState({ conversations: convs })
      }
    })
  }, [])

  // ── Persist on change ────────────────────────────────────────────────
  useEffect(() => {
    if (!activeConvId) return
    const conv = conversations.find(c => c.id === activeConvId)
    if (conv) saveConversation(conv)
  }, [conversations, activeConvId])

  // ── Show canvas when the active conversation has nodes ────────────────
  useEffect(() => {
    const conv = conversations.find(c => c.id === activeConvId)
    const hasNodes = (conv?.nodes.length ?? 0) > 0
    setCanvasVisible(hasNodes)
  }, [conversations, activeConvId])

  // ── Initialise canvas width when it first appears ──────────────────
  useEffect(() => {
    if (canvasVisible && canvasWidth === null && containerRef.current) {
      const total = containerRef.current.offsetWidth
      setCanvasWidth(Math.floor(total / 2))
    }
  }, [canvasVisible, canvasWidth])

  // ── Drag-to-resize handle ─────────────────────────────────────────────
  const onDragStart = useCallback((e: React.MouseEvent) => {
    draggingRef.current = true
    startXRef.current   = e.clientX
    startWRef.current   = canvasWidth ?? 0
    document.body.style.cursor    = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return
      const delta    = ev.clientX - startXRef.current
      const total    = containerRef.current.offsetWidth
      const newW     = Math.max(MIN_CANVAS_WIDTH, Math.min(total - MIN_CHAT_WIDTH, startWRef.current + delta))
      setCanvasWidth(newW)
    }
    const onUp = () => {
      draggingRef.current = false
      document.body.style.cursor    = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  }, [canvasWidth])

  // ── New conversation ──────────────────────────────────────────────────
  const handleNewConversation = useCallback(() => {
    setSidebarOpen(false)
    useChatStore.setState({ activeConversationId: null, activeNodeId: null })
    setCanvasVisible(false)
    setCanvasWidth(null)
    setInputValue('')
    setPendingContextSources([])
    setNewNodeId(null)
  }, [])

  // ── Context source management ─────────────────────────────────────────

  const handleAddNodeContext = useCallback((nodeId: string) => {
    if (!activeConvId) return
    const conv = useChatStore.getState().conversations.find(c => c.id === activeConvId)
    if (!conv) return
    const node = conv.nodes.find(n => n.id === nodeId)
    if (!node) return

    // Avoid duplicates
    if (pendingContextSources.some(p => p.source.nodeId === nodeId && p.source.type === 'node')) return

    const label = node.userMessage.content.trim().split(/\s+/).slice(0, 5).join(' ') + '…'
    const source: ContextSource = { nodeId, conversationId: activeConvId, type: 'node' }
    setPendingContextSources(prev => [...prev, { source, label }])
  }, [activeConvId, pendingContextSources])

  const handleAddHistoryContext = useCallback((nodeId: string) => {
    if (!activeConvId) return
    const conv = useChatStore.getState().conversations.find(c => c.id === activeConvId)
    if (!conv) return
    const node = conv.nodes.find(n => n.id === nodeId)
    if (!node) return

    // Avoid duplicates
    if (pendingContextSources.some(p => p.source.nodeId === nodeId && p.source.type === 'history')) return

    const label = node.userMessage.content.trim().split(/\s+/).slice(0, 5).join(' ') + '…'
    const source: ContextSource = { nodeId, conversationId: activeConvId, type: 'history' }
    setPendingContextSources(prev => [...prev, { source, label }])
  }, [activeConvId, pendingContextSources])

  const handleRemoveContextSource = useCallback((nodeId: string) => {
    setPendingContextSources(prev => prev.filter(p => p.source.nodeId !== nodeId))
  }, [])

  // ── Build context blocks from pending sources ─────────────────────────

  const buildContextBlocks = useCallback((
    pendingSources: PendingContextSource[],
    currentActiveNodeId: string | null,
  ): ContextBlock[] => {
    const state = useChatStore.getState()
    const blocks: ContextBlock[] = []

    for (const pending of pendingSources) {
      const { source, label } = pending
      const srcConv = state.conversations.find(c => c.id === source.conversationId)
      if (!srcConv) continue

      const srcNode = srcConv.nodes.find(n => n.id === source.nodeId)
      if (!srcNode) continue

      if (source.type === 'node') {
        // Feature 5: just this node's messages
        const messages = []
        messages.push({ role: 'user' as const, content: srcNode.userMessage.content })
        if (srcNode.aiMessage) {
          messages.push({ role: 'assistant' as const, content: srcNode.aiMessage.content })
        }
        blocks.push({ label, messages })
      } else {
        // Feature 6: full history excluding common ancestors
        // Get ancestor chain of the source node
        const nodeMap = new Map(srcConv.nodes.map(n => [n.id, n]))
        const srcAncestors: string[] = []
        let curr = srcConv.nodes.find(n => n.id === source.nodeId)
        while (curr) {
          srcAncestors.unshift(curr.id)
          curr = curr.parentId ? nodeMap.get(curr.parentId) : undefined
        }

        // Get ancestor chain of the current active node
        const activeConvNodes = state.conversations.find(c => c.id === activeConvId)?.nodes ?? []
        const activeNodeMap = new Map(activeConvNodes.map(n => [n.id, n]))
        const activeAncestors = new Set<string>()
        let activeCurr = currentActiveNodeId ? activeConvNodes.find(n => n.id === currentActiveNodeId) : undefined
        while (activeCurr) {
          activeAncestors.add(activeCurr.id)
          activeCurr = activeCurr.parentId ? activeNodeMap.get(activeCurr.parentId) : undefined
        }

        // Find common ancestor IDs (only relevant within same conversation)
        const commonAncestors = new Set<string>()
        if (source.conversationId === activeConvId) {
          for (const id of srcAncestors) {
            if (activeAncestors.has(id)) commonAncestors.add(id)
          }
        }

        // Build messages only from non-common-ancestor nodes in the history
        const messages = []
        for (const nodeId of srcAncestors) {
          if (commonAncestors.has(nodeId)) continue
          const histNode = nodeMap.get(nodeId)
          if (!histNode) continue
          messages.push({ role: 'user' as const, content: histNode.userMessage.content })
          if (histNode.aiMessage) {
            messages.push({ role: 'assistant' as const, content: histNode.aiMessage.content })
          }
        }
        if (messages.length > 0) blocks.push({ label, messages })
      }
    }

    return blocks
  }, [activeConvId])

  // ── Send message ──────────────────────────────────────────────────────
  const handleSend = useCallback(async (
    text: string,
    parentNodeId: string | null,
    conversationId: string | null,
  ) => {
    if (!text.trim() || isStreaming || !selectedModel) return

    // Capture context before clearing
    const contextSourcesToUse = [...pendingContextSources]
    const contextBlocks = buildContextBlocks(contextSourcesToUse, parentNodeId)

    // Clear pending context
    setPendingContextSources([])

    // Create conversation if this is the first message
    let convId = conversationId
    if (!convId) {
      convId = createConversation(text)
    }

    const model = selectedModel
    const userMsg = {
      id:        `${Date.now()}-u`,
      role:      'user' as const,
      content:   text,
      model,
      timestamp: Date.now(),
    }

    const contextSourcesForNode: ContextSource[] = contextSourcesToUse.map(p => p.source)
    const nodeId = addNode(convId, parentNodeId, userMsg, contextSourcesForNode)
    setNewNodeId(nodeId)  // signal TreeCanvas to auto-focus this new node

    // Show canvas immediately with processing node
    setCanvasVisible(true)

    // Build thread context for LLM
    const thread = getThread(nodeId)

    setIsStreaming(true)
    abortRef.current = new AbortController()

    let accumulated = ''

    try {
      await streamChat(
        ollamaBaseUrl,
        model,
        thread,
        (chunk) => {
          accumulated += chunk
          updateNodeStream(convId!, nodeId, chunk)
        },
        abortRef.current.signal,
        contextBlocks.length > 0 ? contextBlocks : undefined,
      )

      completeNode(convId!, nodeId, {
        id:        `${Date.now()}-a`,
        role:      'assistant',
        content:   accumulated,
        model,
        timestamp: Date.now(),
      })
    } catch (err: unknown) {
      const error = err as Error
      if (error.name !== 'AbortError') {
        // Show error in the node
        completeNode(convId!, nodeId, {
          id:        `${Date.now()}-a`,
          role:      'assistant',
          content:   `⚠️ Error: ${error.message}`,
          model,
          timestamp: Date.now(),
        })
      } else {
        stopNode(convId!, nodeId, accumulated, model)
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [
    isStreaming, selectedModel, pendingContextSources, buildContextBlocks,
    createConversation, addNode, getThread, ollamaBaseUrl,
    updateNodeStream, completeNode, stopNode,
  ])

  // ── Edit node (Feature 2) ─────────────────────────────────────────────
  const handleEditNode = useCallback(async (nodeId: string, newContent: string) => {
    if (isStreaming || !selectedModel || !activeConvId) return

    const model = selectedModel

    // Update store: clear descendants, reset node
    editNodeUserMessage(activeConvId, nodeId, newContent)

    // Get the updated thread for this node
    const thread = useChatStore.getState().getThread.call(
      useChatStore.getState(),
      nodeId,
    )

    setIsStreaming(true)
    abortRef.current = new AbortController()

    let accumulated = ''

    try {
      await streamChat(
        ollamaBaseUrl,
        model,
        thread,
        (chunk) => {
          accumulated += chunk
          updateNodeStream(activeConvId, nodeId, chunk)
        },
        abortRef.current.signal,
      )

      completeNode(activeConvId, nodeId, {
        id:        `${Date.now()}-a`,
        role:      'assistant',
        content:   accumulated,
        model,
        timestamp: Date.now(),
      })
    } catch (err: unknown) {
      const error = err as Error
      if (error.name !== 'AbortError') {
        completeNode(activeConvId, nodeId, {
          id:        `${Date.now()}-a`,
          role:      'assistant',
          content:   `⚠️ Error: ${error.message}`,
          model,
          timestamp: Date.now(),
        })
      } else {
        stopNode(activeConvId, nodeId, accumulated, model)
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [isStreaming, selectedModel, activeConvId, editNodeUserMessage, ollamaBaseUrl, updateNodeStream, completeNode, stopNode])

  // ── Handle conversation deleted (Feature 4) ───────────────────────────
  const handleConversationDeleted = useCallback(async (conversationId: string) => {
    // Delete from IndexedDB
    await dbDeleteConversation(conversationId)
    handleNewConversation()
  }, [handleNewConversation])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const activeConv = conversations.find(c => c.id === activeConvId)

  return (
    <div className="app-layout">
      {/* Sidebar */}
      {sidebarOpen && (
        <Sidebar
          onNewConversation={handleNewConversation}
          onOpenSettings={() => setShowSettings(true)}
          onConversationDeleted={handleConversationDeleted}
        />
      )}

      {/* Sidebar backdrop */}
      {sidebarOpen && (
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 40,
            background: 'rgba(0,0,0,0.3)',
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar toggle */}
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen(v => !v)}
        id="btn-sidebar-toggle"
        aria-label="Toggle sidebar"
      >
        {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
      </button>

      {/* Main content */}
      <div className="main-content" ref={containerRef}>
        {/* Canvas */}
        <div
          className={`canvas-area ${canvasVisible ? '' : 'hidden'}`}
          style={canvasVisible && canvasWidth ? { width: canvasWidth } : {}}
        >
          <TreeCanvas
            onAddNodeContext={handleAddNodeContext}
            onAddHistoryContext={handleAddHistoryContext}
            newNodeId={newNodeId}
          />
        </div>

        {/* Drag handle */}
        {canvasVisible && (
          <div
            className="drag-handle"
            onMouseDown={onDragStart}
            title="Drag to resize"
          />
        )}

        {/* Chat */}
        <div className="chat-area">
          {/* Chat header */}
          <div className="chat-header">
            <div className="chat-header-title">
              {activeConv?.name ?? 'New conversation'}
            </div>
          </div>

          {/* Chat window */}
          <ChatWindow
            onSend={handleSend}
            isStreaming={isStreaming}
            onStop={handleStop}
            inputValue={inputValue}
            onInputChange={setInputValue}
            activeConversationId={activeConvId}
            pendingContextSources={pendingContextSources}
            onRemoveContextSource={handleRemoveContextSource}
            onEditNode={handleEditNode}
          />
        </div>
      </div>

      {/* Settings modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
