/**
 * Tests for llmService — the LLM provider abstraction.
 * Uses fetch mocking (via vitest's global vi) to avoid real network calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchModels, streamChat } from '../api/llmService'
import type { ConversationNode } from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCompleteNode(id: string, parentId: string | null, userContent: string, aiContent: string): ConversationNode {
  return {
    id,
    parentId,
    branchColor: '#6366f1',
    userMessage: { id: `${id}-u`, role: 'user', content: userContent, model: 'llama3', timestamp: Date.now() },
    aiMessage: { id: `${id}-a`, role: 'assistant', content: aiContent, model: 'llama3', timestamp: Date.now() },
    status: 'complete',
  }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── fetchModels ─────────────────────────────────────────────────────────────

describe('fetchModels(baseUrl)', () => {
  it('returns a list of model name strings from Ollama /api/tags', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        models: [
          { name: 'llama3:latest' },
          { name: 'mistral:latest' },
        ],
      }),
    } as Response)

    const models = await fetchModels('http://localhost:11434')
    expect(models).toEqual(['llama3:latest', 'mistral:latest'])
  })

  it('returns empty array when Ollama is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const models = await fetchModels('http://localhost:11434')
    expect(models).toEqual([])
  })
})

// ─── streamChat ──────────────────────────────────────────────────────────────

describe('streamChat(baseUrl, model, thread, onChunk, signal)', () => {
  it('calls Ollama /api/chat with the correct model and messages derived from the thread', async () => {
    const thread = [
      makeCompleteNode('n1', null, 'Hello', 'Hi there!'),
      makeCompleteNode('n2', 'n1', 'How are you?', 'I am fine!'),
    ]

    const mockStream = new ReadableStream({
      start(controller) {
        // Simulate two streaming chunks then done
        controller.enqueue(new TextEncoder().encode(
          JSON.stringify({ message: { content: 'Great' }, done: false }) + '\n'
        ))
        controller.enqueue(new TextEncoder().encode(
          JSON.stringify({ message: { content: ' answer' }, done: true }) + '\n'
        ))
        controller.close()
      },
    })

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      body: mockStream,
    } as Response)

    const chunks: string[] = []
    await streamChat('http://localhost:11434', 'llama3', thread, (chunk) => {
      chunks.push(chunk)
    })

    // Verify fetch was called with correct endpoint and payload
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"model":"llama3"'),
      })
    )

    // The payload messages should flatten the thread into user/assistant pairs
    const callBody = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(callBody.messages).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'How are you?' },
      { role: 'assistant', content: 'I am fine!' },
    ])

    // Verify chunks were streamed correctly
    expect(chunks).toEqual(['Great', ' answer'])
  })
})
