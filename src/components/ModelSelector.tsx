import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Bot } from 'lucide-react'
import { fetchOllamaModels, fetchClaudeModels } from '../api/llmService'
import { useSettingsStore } from '../store/useSettingsStore'
import { useChatStore } from '../store/useChatStore'
import type { Provider } from '../types'

interface ModelSelectorProps {
  // Used when no active conversation exists yet (new chat screen)
  pendingProvider: Provider
  pendingModel: string
  onPendingProviderChange: (p: Provider) => void
  onPendingModelChange: (m: string) => void
}

interface ModelGroup {
  provider: Provider
  label: string
  models: string[]
  disabled?: boolean
  disabledReason?: string
}

export function ModelSelector({
  pendingProvider,
  pendingModel,
  onPendingProviderChange,
  onPendingModelChange,
}: ModelSelectorProps) {
  const providerConfigs = useSettingsStore(s => s.providerConfigs)
  const activeConvId    = useChatStore(s => s.activeConversationId)
  const conversations   = useChatStore(s => s.conversations)

  const activeConv = conversations.find(c => c.id === activeConvId)
  const hasActiveConv = Boolean(activeConv)

  // Local model lists
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [claudeModels, setClaudeModels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  // Currently selected value = "provider:model" string
  // If active conv exists, use its values; otherwise use pending
  const effectiveProvider = activeConv?.provider ?? pendingProvider
  const effectiveModel    = activeConv?.model    ?? pendingModel
  const currentValue = effectiveModel ? `${effectiveProvider}:${effectiveModel}` : ''

  const loadModels = useCallback(async () => {
    setLoading(true)
    const [ollama, claude] = await Promise.all([
      fetchOllamaModels(providerConfigs.ollama.baseUrl),
      providerConfigs.claude.apiKey
        ? fetchClaudeModels(providerConfigs.claude.apiKey)
        : Promise.resolve([]),
    ])
    setOllamaModels(ollama)
    setClaudeModels(claude)
    setLoading(false)
  }, [providerConfigs.ollama.baseUrl, providerConfigs.claude.apiKey])

  // Auto-select first model in pending state once models load
  useEffect(() => {
    loadModels().then(() => {
      // This effect runs after loadModels resolves, but state is async
      // We'll do the auto-select in the next effect
    })
  }, [loadModels])

  // Auto-set pending model when models first load and nothing is selected
  useEffect(() => {
    if (!hasActiveConv && !pendingModel) {
      if (ollamaModels.length > 0) {
        onPendingProviderChange('ollama')
        onPendingModelChange(ollamaModels[0])
      } else if (claudeModels.length > 0) {
        onPendingProviderChange('claude')
        onPendingModelChange(claudeModels[0])
      }
    }
  }, [ollamaModels, claudeModels, hasActiveConv, pendingModel, onPendingProviderChange, onPendingModelChange])

  const hasClaudeKey = Boolean(providerConfigs.claude.apiKey)

  const groups: ModelGroup[] = [
    {
      provider: 'ollama',
      label: 'Ollama',
      models: ollamaModels,
      disabled: ollamaModels.length === 0,
      disabledReason: ollamaModels.length === 0 ? 'No Ollama models found' : undefined,
    },
    {
      provider: 'claude',
      label: 'Claude',
      models: claudeModels,
      disabled: !hasClaudeKey,
      disabledReason: !hasClaudeKey ? 'Add Claude API key in Settings' : undefined,
    },
  ]

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    if (!value) return

    const colonIdx = value.indexOf(':')
    const provider = value.slice(0, colonIdx) as Provider
    const model = value.slice(colonIdx + 1)

    if (activeConvId && activeConv) {
      // Update the active conversation's provider and model
      useChatStore.setState(state => ({
        conversations: state.conversations.map(c =>
          c.id === activeConvId
            ? { ...c, provider, model, updatedAt: Date.now() }
            : c
        ),
      }))
    } else {
      // No active conversation — update pending state
      onPendingProviderChange(provider)
      onPendingModelChange(model)
    }
  }

  const allModelsEmpty = ollamaModels.length === 0 && claudeModels.length === 0

  return (
    <div className="model-selector-wrapper">
      <Bot size={14} style={{ color: 'var(--text-muted)' }} />
      <select
        className="model-selector"
        value={currentValue}
        onChange={handleChange}
        id="model-selector"
        aria-label="Select LLM model"
        disabled={loading || allModelsEmpty}
      >
        {allModelsEmpty && !loading && (
          <option value="">No models available</option>
        )}
        {loading && (
          <option value="">Loading…</option>
        )}
        {groups.map(group => (
          <optgroup key={group.provider} label={group.label}>
            {group.disabled && group.disabledReason ? (
              <option value="" disabled>{group.disabledReason}</option>
            ) : (
              group.models.map(m => (
                <option key={`${group.provider}:${m}`} value={`${group.provider}:${m}`}>
                  {m}
                </option>
              ))
            )}
          </optgroup>
        ))}
      </select>

      {/* Provider badge */}
      {effectiveModel && (
        <span className={`provider-badge provider-badge-${effectiveProvider}`}>
          {effectiveProvider}
        </span>
      )}

      <button
        className="btn-icon"
        onClick={loadModels}
        title="Refresh models"
        aria-label="Refresh model list"
        disabled={loading}
        id="btn-refresh-models"
      >
        <RefreshCw size={13} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
      </button>
    </div>
  )
}
