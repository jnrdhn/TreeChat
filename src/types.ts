// Core domain types for TreeChat

export type MessageRole = 'user' | 'assistant'

export interface Message {
  id: string
  role: MessageRole
  content: string
  model: string
  timestamp: number
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

export interface Conversation {
  id: string
  name: string   // auto-set from first user message; editable
  nodes: ConversationNode[]
  createdAt: number
  updatedAt: number
}
