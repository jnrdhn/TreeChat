import type { ConversationNode } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ContextBlock {
  label: string            // node label / first words of user message
  messages: LLMMessage[]  // the context messages
}

// ─── fetchModels ──────────────────────────────────────────────────────────────

/**
 * Fetches available models from the Ollama instance at `baseUrl`.
 * Returns an empty array if the server is unreachable.
 */
export async function fetchModels(baseUrl: string): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.models ?? [])
      .map((m: { name: string }) => m.name)
      .filter((name: string) => !/(embed|embedding)/i.test(name))
  } catch {
    return []
  }
}

// ─── Thread → Messages ────────────────────────────────────────────────────────

/**
 * Flattens a thread of ConversationNodes into an ordered array of LLM messages.
 * Each node contributes a user message and (if complete) an assistant message.
 */
export function threadToMessages(thread: ConversationNode[]): LLMMessage[] {
  const messages: LLMMessage[] = []
  for (const node of thread) {
    messages.push({ role: 'user', content: node.userMessage.content })
    if (node.aiMessage) {
      messages.push({ role: 'assistant', content: node.aiMessage.content })
    }
  }
  return messages
}

// ─── streamChat ───────────────────────────────────────────────────────────────

/**
 * Streams a chat response from Ollama.
 * Calls `onChunk` for each text chunk received.
 * Respects an AbortSignal for stop-generation support.
 *
 * If `contextBlocks` are provided they are prepended to the message array
 * as labeled user/assistant turns BEFORE the main thread — not as a system message.
 */
export async function streamChat(
  baseUrl: string,
  model: string,
  thread: ConversationNode[],
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  contextBlocks?: ContextBlock[]
): Promise<void> {
  const contextMessages: LLMMessage[] = []
  if (contextBlocks && contextBlocks.length > 0) {
    for (const block of contextBlocks) {
      // Open with a user turn announcing the context
      contextMessages.push({
        role: 'user',
        content: `[Context from "${block.label}"]:\n${block.messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')}`,
      })
      // Acknowledge with an assistant turn so the conversation stays valid
      contextMessages.push({
        role: 'assistant',
        content: 'I have noted the above context and will use it to inform my response.',
      })
    }
  }

  const mainMessages = threadToMessages(thread)
  const messages = [...contextMessages, ...mainMessages]

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  })

  if (!res.ok || !res.body) {
    throw new Error(`Ollama API error: ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const text = decoder.decode(value, { stream: true })
    // Each line from Ollama is a JSON object
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const parsed = JSON.parse(trimmed)
        const chunk = parsed?.message?.content
        if (chunk) onChunk(chunk)
      } catch {
        // Ignore malformed lines
      }
    }
  }
}
