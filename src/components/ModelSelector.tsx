import { useEffect, useState } from 'react'
import { RefreshCw, Bot } from 'lucide-react'
import { fetchModels } from '../api/llmService'
import { useSettingsStore } from '../store/useSettingsStore'

export function ModelSelector() {
  const ollamaBaseUrl  = useSettingsStore(s => s.ollamaBaseUrl)
  const selectedModel  = useSettingsStore(s => s.selectedModel)
  const setModel       = useSettingsStore(s => s.setSelectedModel)

  const [models, setModels]     = useState<string[]>([])
  const [loading, setLoading]   = useState(false)

  const load = async () => {
    setLoading(true)
    const list = await fetchModels(ollamaBaseUrl)
    setModels(list)
    if (list.length > 0 && (!selectedModel || !list.includes(selectedModel))) {
      setModel(list[0])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [ollamaBaseUrl]) // eslint-disable-line

  return (
    <div className="model-selector-wrapper">
      <Bot size={14} style={{ color: 'var(--text-muted)' }} />
      <select
        className="model-selector"
        value={selectedModel}
        onChange={e => setModel(e.target.value)}
        id="model-selector"
        aria-label="Select LLM model"
        disabled={loading || models.length === 0}
      >
        {models.length === 0 && (
          <option value="">No models found</option>
        )}
        {models.map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <button
        className="btn-icon"
        onClick={load}
        title="Refresh models"
        aria-label="Refresh model list"
        disabled={loading}
      >
        <RefreshCw size={13} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
      </button>
    </div>
  )
}
