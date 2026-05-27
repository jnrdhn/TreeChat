// Core domain types for TreeChat

export type MessageRole = 'user' | 'assistant'

export type Provider = 'ollama' | 'claude'

// ── Attachments ───────────────────────────────────────────────────────────────

export type AttachmentKind = 'image' | 'file'

export interface Attachment {
  id: string
  name: string
  mimeType: string
  kind: AttachmentKind
  /** base64 data-URL for images; used as vision block content */
  dataUrl: string
  /** Plain-text extracted from the file; injected into the prompt for non-image files */
  extractedText?: string
}

// ─────────────────────────────────────────────────────────────────────────────

export interface Message {
  id: string
  role: MessageRole
  content: string
  model: string
  timestamp: number
  /** Files/images attached to this user message */
  attachments?: Attachment[]
  /** Claude extended-thinking reasoning trace (assistant messages only) */
  thinkingContent?: string
}

export type NodeStatus = 'processing' | 'complete' | 'stopped'

export interface ContextSource {
  nodeId: string
  conversationId: string
  type: 'node' | 'history'   // 'node' = Feature 5, 'history' = Feature 6
}

export interface ConversationNode {
  id: string
  parentId: string | null  // null = root node
  branchColor: string
  userMessage: Message
  aiMessage: Message | null  // null while streaming
  status: NodeStatus
  contextSources?: ContextSource[]   // nodes used as context for this message
  showContextLines?: boolean          // whether to render gray dashed lines on canvas
}

export type SystemPromptMode = 'append' | 'replace'

export interface Conversation {
  id: string
  name: string   // auto-set from first user message; editable
  nodes: ConversationNode[]
  createdAt: number
  updatedAt: number
  // Provider & model (per-conversation)
  provider: Provider
  model: string
  // Optional per-conversation system prompt override
  conversationSystemPrompt?: string
  systemPromptMode?: SystemPromptMode  // 'append' = prepend global, 'replace' = ignore global
}
