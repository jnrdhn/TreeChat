import { useState, useEffect } from 'react'
import { X, Eye, EyeOff, Check, AlertCircle, Loader } from 'lucide-react'
import { useSettingsStore } from '../store/useSettingsStore'
import { fetchClaudeModels } from '../api/llmService'

type ProviderTab = 'ollama' | 'claude'

type KeyStatus = 'idle' | 'checking' | 'valid' | 'invalid'

interface SettingsModalProps {
  onClose: () => void
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const providerConfigs      = useSettingsStore(s => s.providerConfigs)
  const globalSystemPrompt   = useSettingsStore(s => s.globalSystemPrompt)
  const setOllamaBaseUrl     = useSettingsStore(s => s.setOllamaBaseUrl)
  const setClaudeApiKey      = useSettingsStore(s => s.setClaudeApiKey)
  const setGlobalSystemPrompt = useSettingsStore(s => s.setGlobalSystemPrompt)

  const [activeTab, setActiveTab] = useState<ProviderTab>('ollama')

  // Ollama
  const [ollamaUrl, setOllamaUrl] = useState(providerConfigs.ollama.baseUrl)

  // Claude
  const [claudeKey, setClaudeKey] = useState(providerConfigs.claude.apiKey)
  const [showKey, setShowKey] = useState(false)
  const [keyStatus, setKeyStatus] = useState<KeyStatus>('idle')

  // System prompt
  const [systemPrompt, setSystemPrompt] = useState(globalSystemPrompt)

  // Auto-validate Claude key if it was previously saved
  useEffect(() => {
    if (providerConfigs.claude.apiKey) {
      setKeyStatus('checking')
      fetchClaudeModels(providerConfigs.claude.apiKey).then(models => {
        setKeyStatus(models.length > 0 ? 'valid' : 'invalid')
      })
    }
  }, []) // eslint-disable-line

  const handleValidateKey = async () => {
    if (!claudeKey.trim()) return
    setKeyStatus('checking')
    const models = await fetchClaudeModels(claudeKey.trim())
    setKeyStatus(models.length > 0 ? 'valid' : 'invalid')
  }

  const handleSave = () => {
    setOllamaBaseUrl(ollamaUrl.trim().replace(/\/$/, ''))
    setClaudeApiKey(claudeKey.trim())
    setGlobalSystemPrompt(systemPrompt)
    onClose()
  }

  const KeyStatusIcon = () => {
    if (keyStatus === 'checking') return <Loader size={14} className="icon-spin" style={{ color: 'var(--text-muted)' }} />
    if (keyStatus === 'valid')    return <Check size={14} style={{ color: 'var(--color-success)' }} />
    if (keyStatus === 'invalid')  return <AlertCircle size={14} style={{ color: 'var(--color-error)' }} />
    return null
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-settings" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal-header">
          <span className="modal-title" id="settings-title">Settings</span>
          <button className="modal-close" onClick={onClose} aria-label="Close settings">
            <X size={14} />
          </button>
        </div>

        {/* Provider tabs */}
        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'ollama' ? 'active' : ''}`}
            onClick={() => setActiveTab('ollama')}
            id="tab-ollama"
          >
            Ollama
          </button>
          <button
            className={`settings-tab ${activeTab === 'claude' ? 'active' : ''}`}
            onClick={() => setActiveTab('claude')}
            id="tab-claude"
          >
            Claude
            {keyStatus === 'valid' && (
              <span className="tab-status-dot tab-status-valid" title="API key valid" />
            )}
            {keyStatus === 'invalid' && (
              <span className="tab-status-dot tab-status-invalid" title="API key invalid" />
            )}
          </button>
        </div>

        {/* Ollama tab */}
        {activeTab === 'ollama' && (
          <div className="settings-tab-content">
            <div className="form-group">
              <label className="form-label" htmlFor="input-ollama-url">Base URL</label>
              <input
                id="input-ollama-url"
                className="form-input"
                type="text"
                value={ollamaUrl}
                onChange={e => setOllamaUrl(e.target.value)}
                placeholder="http://localhost:11434"
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
              <p className="form-hint">The local Ollama server address.</p>
            </div>
          </div>
        )}

        {/* Claude tab */}
        {activeTab === 'claude' && (
          <div className="settings-tab-content">
            <div className="form-group">
              <label className="form-label" htmlFor="input-claude-key">API Key</label>
              <div className="input-with-suffix">
                <input
                  id="input-claude-key"
                  className="form-input"
                  type={showKey ? 'text' : 'password'}
                  value={claudeKey}
                  onChange={e => { setClaudeKey(e.target.value); setKeyStatus('idle') }}
                  placeholder="sk-ant-…"
                  autoComplete="off"
                />
                <div className="input-suffix-icons">
                  <KeyStatusIcon />
                  <button
                    className="btn-icon-ghost btn-icon-sm"
                    type="button"
                    onClick={() => setShowKey(v => !v)}
                    title={showKey ? 'Hide key' : 'Show key'}
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              {keyStatus === 'invalid' && (
                <p className="form-hint form-hint-error">Key appears invalid — double-check it at console.anthropic.com</p>
              )}
              {keyStatus === 'valid' && (
                <p className="form-hint form-hint-success">Key is valid ✓</p>
              )}
              <button
                className="btn-secondary btn-sm"
                onClick={handleValidateKey}
                disabled={!claudeKey.trim() || keyStatus === 'checking'}
                style={{ marginTop: 8 }}
                id="btn-validate-claude-key"
              >
                {keyStatus === 'checking' ? 'Checking…' : 'Validate Key'}
              </button>
              <p className="form-hint" style={{ marginTop: 6 }}>
                Stored locally in your browser. Never sent to any server except Anthropic.
              </p>
            </div>
          </div>
        )}

        {/* Global System Prompt — always visible */}
        <div className="settings-divider" />
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="input-global-system-prompt">
            Global System Prompt
          </label>
          <textarea
            id="input-global-system-prompt"
            className="form-input form-textarea"
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            placeholder="e.g. You are a helpful, concise assistant."
            rows={4}
          />
          <p className="form-hint">Applied to all conversations. Can be overridden per-conversation.</p>
        </div>

        <button className="btn-primary" onClick={handleSave} style={{ marginTop: 20 }} id="btn-settings-save">
          Save
        </button>
      </div>
    </div>
  )
}
