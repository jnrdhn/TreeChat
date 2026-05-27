import type { ConversationNode } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────

/** Anthropic vision content block (image) */
export interface AnthropicImageBlock {
  type: 'image'
  source: {
    type: 'base64'
    media_type: string
    data: string  // base64 without the data-URL prefix
  }
}

/** Anthropic text content block */
export interface AnthropicTextBlock {
  type: 'text'
  text: string
}

export type AnthropicContentBlock = AnthropicTextBlock | AnthropicImageBlock

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | AnthropicContentBlock[]
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
 *
 * When a user message carries image attachments, the content is emitted as an
 * Anthropic multi-part content array (text + image blocks).
 * Non-image file text is prepended to the text content block.
 */
export function threadToMessages(thread: ConversationNode[]): LLMMessage[] {
  const messages: LLMMessage[] = []
  for (const node of thread) {
    const { content, attachments } = node.userMessage

    if (attachments && attachments.length > 0) {
      // Build a multi-part Anthropic content array
      const blocks: AnthropicContentBlock[] = []

      // Prepend text from non-image file attachments
      const fileTexts = attachments
        .filter(a => a.kind === 'file' && a.extractedText)
        .map(a => `[Attached file: ${a.name}]\n${a.extractedText}`)
        .join('\n\n')

      const textContent = fileTexts ? `${fileTexts}\n\n${content}` : content
      blocks.push({ type: 'text', text: textContent })

      // Add image blocks (images only)
      for (const att of attachments) {
        if (att.kind === 'image') {
          // Strip "data:<mime>;base64," prefix
          const base64 = att.dataUrl.split(',')[1] ?? att.dataUrl
          blocks.push({
            type: 'image',
            source: { type: 'base64', media_type: att.mimeType, data: base64 },
          })
        }
      }

      messages.push({ role: 'user', content: blocks })
    } else {
      messages.push({ role: 'user', content })
    }

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
  thinkingEnabled?: boolean,
  onThinkingChunk?: (chunk: string) => void,
): Promise<void> {
  const messages = threadToMessages(thread)

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: thinkingEnabled ? 16000 : 8096,
    stream: true,
  }
  if (systemPrompt) {
    body.system = systemPrompt
  }
  if (thinkingEnabled) {
    body.thinking = { type: 'enabled', budget_tokens: 8000 }
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'interleaved-thinking-2025-05-14',
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

  // Track which content block index is a thinking block vs text block
  const blockTypes = new Map<number, 'thinking' | 'text'>()

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

          // Track block types when they start
          if (parsed.type === 'content_block_start') {
            const idx = parsed.index as number
            const blockType = parsed.content_block?.type as string
            if (blockType === 'thinking') blockTypes.set(idx, 'thinking')
            else if (blockType === 'text') blockTypes.set(idx, 'text')
          }

          // Route deltas to the right callback
          if (parsed.type === 'content_block_delta') {
            const idx = parsed.index as number
            const deltaType = parsed.delta?.type as string
            if (deltaType === 'thinking_delta' && onThinkingChunk) {
              onThinkingChunk(parsed.delta.thinking ?? '')
            } else if (deltaType === 'text_delta') {
              // Confirm it's a text block (not thinking)
              if (blockTypes.get(idx) !== 'thinking') {
                onChunk(parsed.delta.text ?? '')
              }
            }
          }
        } catch {
          // Ignore malformed SSE lines
        }
      }
    }
  }
}
