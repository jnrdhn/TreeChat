import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── Provider Configs ─────────────────────────────────────────────────────────

export interface OllamaConfig {
  baseUrl: string
}

export interface ClaudeConfig {
  apiKey: string
}

export interface ProviderConfigs {
  ollama: OllamaConfig
  claude: ClaudeConfig
}

// ─── Settings State ───────────────────────────────────────────────────────────

interface SettingsState {
  // Per-provider configuration
  providerConfigs: ProviderConfigs

  // Global system prompt applied to all conversations
  globalSystemPrompt: string

  // Actions
  setOllamaBaseUrl: (url: string) => void
  setClaudeApiKey: (key: string) => void
  setGlobalSystemPrompt: (prompt: string) => void

  // Convenience selectors (backwards-compat shims)
  getOllamaBaseUrl: () => string
  getClaudeApiKey: () => string
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      providerConfigs: {
        ollama: { baseUrl: 'http://localhost:11434' },
        claude: { apiKey: '' },
      },
      globalSystemPrompt: '',

      setOllamaBaseUrl: (url) =>
        set(state => ({
          providerConfigs: {
            ...state.providerConfigs,
            ollama: { baseUrl: url },
          },
        })),

      setClaudeApiKey: (key) =>
        set(state => ({
          providerConfigs: {
            ...state.providerConfigs,
            claude: { apiKey: key },
          },
        })),

      setGlobalSystemPrompt: (prompt) => set({ globalSystemPrompt: prompt }),

      getOllamaBaseUrl: () => get().providerConfigs.ollama.baseUrl,
      getClaudeApiKey:  () => get().providerConfigs.claude.apiKey,
    }),
    { name: 'treechat-settings' }
  )
)
