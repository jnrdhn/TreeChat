import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  ollamaBaseUrl: string
  selectedModel: string
  setOllamaBaseUrl: (url: string) => void
  setSelectedModel: (model: string) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ollamaBaseUrl: 'http://localhost:11434',
      selectedModel: '',
      setOllamaBaseUrl: (url) => set({ ollamaBaseUrl: url }),
      setSelectedModel: (model) => set({ selectedModel: model }),
    }),
    { name: 'treechat-settings' }
  )
)
