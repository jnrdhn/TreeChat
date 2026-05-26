import { useCallback, useEffect, useRef, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { useChatStore } from './store/useChatStore'
import { useSettingsStore } from './store/useSettingsStore'
import { saveConversation, loadAllConversations, deleteConversation as dbDeleteConversation } from './store/db'
import {
  streamOllamaChat,
  streamClaudeChat,
  buildSystemPrompt,
  type ContextBlock,
} from './api/llmService'
import { Sidebar } from './components/Sidebar'
import { TreeCanvas } from './components/TreeCanvas'
import { ChatWindow, type PendingContextSource } from './components/ChatWindow'
import { SettingsModal } from './components/SettingsModal'
import type { ContextSource, Provider } from './types'
import './index.css'

const MIN_CANVAS_WIDTH = 280
const MIN_CHAT_WIDTH   = 320

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast {
  id: string
  message: string
  type: 'error' | 'info'
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span>{t.message}</span>
          <button className="toast-close" onClick={() => onDismiss(t.id)} aria-label="Dismiss">
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

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

  const providerConfigs    = useSettingsStore(s => s.providerConfigs)
  const globalSystemPrompt = useSettingsStore(s => s.globalSystemPrompt)

  // ── Local UI state ───────────────────────────────────────────────────────
  const [sidebarOpen,    setSidebarOpen]    = useState(false)
  const [showSettings,   setShowSettings]   = useState(false)
  const [isStreaming,    setIsStreaming]     = useState(false)
  const [inputValue,     setInputValue]     = useState('')
  const [canvasVisible,  setCanvasVisible]  = useState(false)
  const [canvasWidth,    setCanvasWidth]    = useState<number | null>(null)
  const [toasts,         setToasts]         = useState<Toast[]>([])

  // Pending provider+model for new conversations (before first message is sent)
  const [pendingProvider, setPendingProvider] = useState<Provider>('ollama')
  const [pendingModel,    setPendingModel]    = useState<string>('')

  // ── Context sources (Features 5 & 6) ─────────────────────────────────────
  const [pendingContextSources, setPendingContextSources] = useState<PendingContextSource[]>([])
  // ── Track newly created node for auto-focus (Feature 3) ──────────────────
  const [newNodeId, setNewNodeId] = useState<string | null>(null)

  const abortRef    = useRef<AbortController | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef  = useRef(false)
  const startXRef    = useRef(0)
  const startWRef    = useRef(0)

  // ── Toast helpers ─────────────────────────────────────────────────────────
  const showToast = useCallback((message: string, type: Toast['type'] = 'error') => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

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
    // Keep pending provider/model so user doesn't have to re-select after New Chat
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
        const nodeMap = new Map(srcConv.nodes.map(n => [n.id, n]))
        const srcAncestors: string[] = []
        let curr = srcConv.nodes.find(n => n.id === source.nodeId)
        while (curr) {
          srcAncestors.unshift(curr.id)
          curr = curr.parentId ? nodeMap.get(curr.parentId) : undefined
        }

        const activeConvNodes = state.conversations.find(c => c.id === activeConvId)?.nodes ?? []
        const activeNodeMap = new Map(activeConvNodes.map(n => [n.id, n]))
        const activeAncestors = new Set<string>()
        let activeCurr = currentActiveNodeId ? activeConvNodes.find(n => n.id === currentActiveNodeId) : undefined
        while (activeCurr) {
          activeAncestors.add(activeCurr.id)
          activeCurr = activeCurr.parentId ? activeNodeMap.get(activeCurr.parentId) : undefined
        }

        const commonAncestors = new Set<string>()
        if (source.conversationId === activeConvId) {
          for (const id of srcAncestors) {
            if (activeAncestors.has(id)) commonAncestors.add(id)
          }
        }

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
    if (!text.trim() || isStreaming) return

    // Determine which conversation / provider we're using
    const existingConv = conversationId
      ? conversations.find(c => c.id === conversationId)
      : null

    // Use per-conversation values if available, otherwise fall back to pending (new conv)
    const provider = existingConv?.provider ?? pendingProvider
    const model    = existingConv?.model    ?? pendingModel

    if (!model) {
      showToast('Please select a model before sending.', 'error')
      return
    }

    // Capture context before clearing
    const contextSourcesToUse = [...pendingContextSources]
    const contextBlocks = buildContextBlocks(contextSourcesToUse, parentNodeId)
    setPendingContextSources([])

    // Create conversation if first message
    let convId = conversationId
    if (!convId) {
      convId = createConversation(text, provider, model)
    }

    const userMsg = {
      id:        `${Date.now()}-u`,
      role:      'user' as const,
      content:   text,
      model,
      timestamp: Date.now(),
    }

    const contextSourcesForNode: ContextSource[] = contextSourcesToUse.map(p => p.source)
    const nodeId = addNode(convId, parentNodeId, userMsg, contextSourcesForNode)
    setNewNodeId(nodeId)
    setCanvasVisible(true)

    const thread = getThread(nodeId)

    // Compose system prompt (global + conv override + context blocks)
    const conv = useChatStore.getState().conversations.find(c => c.id === convId)
    const systemPrompt = buildSystemPrompt(
      globalSystemPrompt,
      conv?.conversationSystemPrompt,
      conv?.systemPromptMode,
      contextBlocks.length > 0 ? contextBlocks : undefined,
    )

    setIsStreaming(true)
    abortRef.current = new AbortController()

    let accumulated = ''

    try {
      if (provider === 'claude') {
        const apiKey = providerConfigs.claude.apiKey
        if (!apiKey) throw new Error('Invalid Claude API key — check Settings.')
        await streamClaudeChat(apiKey, model, systemPrompt, thread, (chunk) => {
          accumulated += chunk
          updateNodeStream(convId!, nodeId, chunk)
        }, abortRef.current.signal)
      } else {
        await streamOllamaChat(
          providerConfigs.ollama.baseUrl,
          model,
          systemPrompt,
          thread,
          (chunk) => {
            accumulated += chunk
            updateNodeStream(convId!, nodeId, chunk)
          },
          abortRef.current.signal,
        )
      }

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
        showToast(error.message, 'error')
        completeNode(convId!, nodeId, {
          id:        `${Date.now()}-a`,
          role:      'assistant',
          content:   `⚠️ ${error.message}`,
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
    isStreaming, conversations, pendingContextSources, buildContextBlocks,
    createConversation, addNode, getThread,
    providerConfigs, globalSystemPrompt,
    pendingProvider, pendingModel,
    updateNodeStream, completeNode, stopNode, showToast,
  ])

  // ── Edit node (Feature 2) ─────────────────────────────────────────────
  const handleEditNode = useCallback(async (nodeId: string, newContent: string) => {
    if (isStreaming || !activeConvId) return

    const conv = conversations.find(c => c.id === activeConvId)
    if (!conv || !conv.model) return

    const { provider, model } = conv

    editNodeUserMessage(activeConvId, nodeId, newContent)

    const thread = useChatStore.getState().getThread.call(
      useChatStore.getState(),
      nodeId,
    )

    const systemPrompt = buildSystemPrompt(
      globalSystemPrompt,
      conv.conversationSystemPrompt,
      conv.systemPromptMode,
    )

    setIsStreaming(true)
    abortRef.current = new AbortController()

    let accumulated = ''

    try {
      if (provider === 'claude') {
        const apiKey = providerConfigs.claude.apiKey
        if (!apiKey) throw new Error('Invalid Claude API key — check Settings.')
        await streamClaudeChat(apiKey, model, systemPrompt, thread, (chunk) => {
          accumulated += chunk
          updateNodeStream(activeConvId, nodeId, chunk)
        }, abortRef.current.signal)
      } else {
        await streamOllamaChat(
          providerConfigs.ollama.baseUrl,
          model,
          systemPrompt,
          thread,
          (chunk) => {
            accumulated += chunk
            updateNodeStream(activeConvId, nodeId, chunk)
          },
          abortRef.current.signal,
        )
      }

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
        showToast(error.message, 'error')
        completeNode(activeConvId, nodeId, {
          id:        `${Date.now()}-a`,
          role:      'assistant',
          content:   `⚠️ ${error.message}`,
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
  }, [
    isStreaming, activeConvId, conversations, editNodeUserMessage,
    providerConfigs, globalSystemPrompt,
    updateNodeStream, completeNode, stopNode, showToast,
  ])

  // ── Handle conversation deleted (Feature 4) ───────────────────────────
  const handleConversationDeleted = useCallback(async (conversationId: string) => {
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
            {activeConv && (
              <div className={`provider-badge provider-badge-${activeConv.provider}`}>
                {activeConv.provider}
              </div>
            )}
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
            pendingProvider={pendingProvider}
            pendingModel={pendingModel}
            onPendingProviderChange={setPendingProvider}
            onPendingModelChange={setPendingModel}
          />
        </div>
      </div>

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Settings modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
