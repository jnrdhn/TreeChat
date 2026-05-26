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

// ─── System Prompt Builder ────────────────────────────────────────────────────

/**
 * Composes the final system prompt string from:
 *  - globalPrompt: the user's global default
 *  - convPrompt:   per-conversation override (optional)
 *  - mode:         'append' (prepend global) | 'replace' (ignore global)
 *  - contextBlocks: sibling-branch content injected as ## Additional Context
 */
export function buildSystemPrompt(
  globalPrompt: string,
  convPrompt?: string,
  mode?: 'append' | 'replace',
  contextBlocks?: ContextBlock[]
): string {
  let base = ''

  if (convPrompt) {
    if (mode === 'replace') {
      base = convPrompt
    } else {
      // 'append' — prepend global, then conversation prompt
      const parts = [globalPrompt, convPrompt].filter(Boolean)
      base = parts.join('\n\n')
    }
  } else {
    base = globalPrompt
  }

  if (!contextBlocks || contextBlocks.length === 0) {
    return base
  }

  const contextSection = [
    '## Additional Context',
    '',
    ...contextBlocks.map(block => {
      const lines = [
        `### From "${block.label}"`,
        ...block.messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`),
      ]
      return lines.join('\n')
    }),
  ].join('\n')

  return base ? `${base}\n\n${contextSection}` : contextSection
}

// ─── Ollama: fetchModels ──────────────────────────────────────────────────────

/**
 * Fetches available models from the Ollama instance at `baseUrl`.
 * Returns an empty array if the server is unreachable.
 */
export async function fetchOllamaModels(baseUrl: string): Promise<string[]> {
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

/** Legacy alias kept for callers that haven't been updated. */
export const fetchModels = fetchOllamaModels

// ─── Claude: fetchModels ──────────────────────────────────────────────────────

/**
 * Fetches available Claude models from Anthropic's /v1/models endpoint.
 * Returns an empty array if the key is invalid or the request fails.
 */
export async function fetchClaudeModels(apiKey: string): Promise<string[]> {
  if (!apiKey) return []
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    })
    if (!res.ok) return []
    const data = await res.json()
    // Filter to chat-capable models only (exclude embedding/moderation models)
    return (data.data ?? [])
      .map((m: { id: string }) => m.id)
      .filter((id: string) => id.startsWith('claude-'))
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

// ─── Anthropic Error Mapping ──────────────────────────────────────────────────

export function mapAnthropicError(status: number): string {
  if (status === 401) return 'Invalid Claude API key — check Settings.'
  if (status === 403) return 'Claude API key lacks permission for this request.'
  if (status === 429) return 'Rate limited by Claude — please wait a moment.'
  if (status === 529) return 'Claude API is overloaded — try again shortly.'
  return `Claude API error (${status})`
}

// ─── Ollama: streamChat ───────────────────────────────────────────────────────

/**
 * Streams a chat response from Ollama.
 * Context blocks are now handled via `buildSystemPrompt` — do NOT pass them here.
 * The caller should compose a full systemPrompt and pass the final message list.
 */
export async function streamOllamaChat(
  baseUrl: string,
  model: string,
  systemPrompt: string,
  thread: ConversationNode[],
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const messages = threadToMessages(thread)

  const body: Record<string, unknown> = { model, messages, stream: true }
  if (systemPrompt) {
    // Ollama supports a top-level 'system' field
    body.system = systemPrompt
  }

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

/** Legacy alias — kept so App.tsx callers work before migration. */
export async function streamChat(
  baseUrl: string,
  model: string,
  thread: ConversationNode[],
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  _contextBlocks?: ContextBlock[]
): Promise<void> {
  // Legacy path: context blocks ignored (now handled via buildSystemPrompt in App.tsx)
  return streamOllamaChat(baseUrl, model, '', thread, onChunk, signal)
}

// ─── Claude: streamChat ───────────────────────────────────────────────────────

/**
 * Streams a chat response from Claude (Anthropic) using SSE.
 * Calls `onChunk` for each text delta received.
 * Throws with a user-friendly message on API errors.
 */
export async function streamClaudeChat(
  apiKey: string,
  model: string,
  systemPrompt: string,
  thread: ConversationNode[],
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const messages = threadToMessages(thread)

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: 8096,
    stream: true,
  }
  if (systemPrompt) {
    body.system = systemPrompt
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok || !res.body) {
    throw new Error(mapAnthropicError(res.status))
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // SSE lines end with \n\n; process complete events
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''  // keep incomplete tail

    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (!line.startsWith('data: ')) continue
        const jsonStr = line.slice('data: '.length).trim()
        if (jsonStr === '[DONE]') return
        try {
          const parsed = JSON.parse(jsonStr)
          // content_block_delta carries text chunks
          if (
            parsed.type === 'content_block_delta' &&
            parsed.delta?.type === 'text_delta'
          ) {
            onChunk(parsed.delta.text)
          }
        } catch {
          // Ignore malformed SSE lines
        }
      }
    }
  }
}
