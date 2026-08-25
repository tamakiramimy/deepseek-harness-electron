import { useEffect, useState, type ChangeEvent } from 'react'
import { Bot, LoaderCircle, Settings, Sparkles } from 'lucide-react'
import type { DesktopSnapshot, HostStatus, ProxySettings } from '../../shared/contracts.js'

export function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<DesktopSnapshot | undefined>()
  const [proxy, setProxy] = useState<ProxySettings>({ httpProxy: '', httpsProxy: '', noProxy: '' })
  const [proxyOpen, setProxyOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void window.deepseekDesktop.getSnapshot().then((snap) => {
      setSnapshot(snap)
      setProxy(snap.proxy)
    })
    return window.deepseekDesktop.onHostStatus((host) => {
      setSnapshot((current) => current === undefined ? undefined : { ...current, host })
    })
  }, [])

  const host = snapshot?.host

  async function saveProxy(): Promise<void> {
    setSaving(true)
    try {
      await window.deepseekDesktop.setProxySettings(proxy)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="desktop-shell">
      <header className="desktop-statusbar">
        <div className="desktop-brand"><Sparkles size={15} aria-hidden="true" /><span>DEEPSEEK HARNESS</span></div>
        <div className="desktop-status">{host?.state === 'ready' ? 'Official Harness' : host?.detail ?? 'Starting official Harness...'}</div>
        <div className="desktop-actions">
          <HostPill status={host} />
          <button type="button" className="proxy-toggle" aria-expanded={proxyOpen} onClick={() => setProxyOpen((open) => !open)}>
            <Settings size={14} aria-hidden="true" /> Proxy
          </button>
        </div>
      </header>
      <section className="harness-stage" aria-label="Official DeepSeek Harness">
        {host?.url !== undefined
          ? <iframe className="harness-frame" src={host.url} title="Official DeepSeek Harness" referrerPolicy="no-referrer" />
          : <HarnessStartupState host={host} />}
      </section>
      {
  /** Proxy configuration panel: HTTP_PROXY, HTTPS_PROXY, NO_PROXY inputs.
   *  Saving triggers a harness restart so the new proxy takes effect immediately. */
  proxyOpen && <ProxyPanel proxy={proxy} saving={saving} onChange={setProxy} onSave={saveProxy} />
}
    </main>
  )
}

function ProxyPanel({ proxy, saving, onChange, onSave }: {
  proxy: ProxySettings
  saving: boolean
  onChange: (proxy: ProxySettings) => void
  onSave: () => void
}): React.JSX.Element {
  const field = (key: keyof ProxySettings) => (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...proxy, [key]: event.target.value })
  }
  return (
    <div className="proxy-panel">
      <h2>Proxy settings</h2>
      <label>HTTP Proxy
        <input value={proxy.httpProxy} onChange={field('httpProxy')} placeholder="http://127.0.0.1:7890" spellCheck={false} />
      </label>
      <label>HTTPS Proxy
        <input value={proxy.httpsProxy} onChange={field('httpsProxy')} placeholder="http://127.0.0.1:7890" spellCheck={false} />
      </label>
      <label>No Proxy
        <input value={proxy.noProxy} onChange={field('noProxy')} placeholder="localhost,127.0.0.1" spellCheck={false} />
      </label>
      <div className="proxy-actions">
        <button type="button" className="proxy-save" onClick={onSave} disabled={saving}>{saving ? 'Applying…' : 'Save & apply'}</button>
      </div>
    </div>
  )
}

function HarnessStartupState({ host }: { host: HostStatus | undefined }): React.JSX.Element {
  const failed = host?.state === 'failed'
  return <div className="harness-startup">
    {failed ? <Bot size={26} /> : <LoaderCircle className="startup-spinner" size={26} />}
    <h1>{failed ? 'Harness could not start' : 'Starting DeepSeek Harness'}</h1>
    <p>{host?.detail ?? 'Preparing the isolated official runtime.'}</p>
  </div>
}

function HostPill({ status }: { status: HostStatus | undefined }): React.JSX.Element {
  const state = status?.state ?? 'starting'
  return <span className={`host-pill ${state}`}><i />{state === 'ready' ? 'Host ready' : state === 'failed' ? 'Host error' : 'Host starting'}</span>
}