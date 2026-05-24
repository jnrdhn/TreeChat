import { useState } from 'react'
import { X } from 'lucide-react'
import { useSettingsStore } from '../store/useSettingsStore'

interface SettingsModalProps {
  onClose: () => void
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const ollamaBaseUrl    = useSettingsStore(s => s.ollamaBaseUrl)
  const setOllamaBaseUrl = useSettingsStore(s => s.setOllamaBaseUrl)

  const [url, setUrl] = useState(ollamaBaseUrl)

  const handleSave = () => {
    setOllamaBaseUrl(url.trim().replace(/\/$/, ''))
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal-header">
          <span className="modal-title" id="settings-title">Settings</span>
          <button className="modal-close" onClick={onClose} aria-label="Close settings">
            <X size={14} />
          </button>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="input-ollama-url">Ollama Base URL</label>
          <input
            id="input-ollama-url"
            className="form-input"
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="http://localhost:11434"
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">API Keys (Coming Soon)</label>
          <input
            className="form-input"
            type="text"
            placeholder="OpenAI, Gemini, Claude — coming soon"
            disabled
            style={{ opacity: 0.5, cursor: 'not-allowed' }}
          />
        </div>

        <button className="btn-primary" onClick={handleSave} style={{ marginTop: 20 }}>
          Save & Reconnect
        </button>
      </div>
    </div>
  )
}
