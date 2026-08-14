import { useEffect, useState } from 'react'
import { Bot, LoaderCircle, Sparkles } from 'lucide-react'
import type { DesktopSnapshot, HostStatus } from '../../shared/contracts.js'

export function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<DesktopSnapshot | undefined>()

  useEffect(() => {
    void window.deepseekDesktop.getSnapshot().then(setSnapshot)
    return window.deepseekDesktop.onHostStatus((host) => {
      setSnapshot((current) => current === undefined ? undefined : { ...current, host })
    })
  }, [])

  const host = snapshot?.host

  return (
    <main className="desktop-shell">
      <header className="desktop-statusbar">
        <div className="desktop-brand"><Sparkles size={15} aria-hidden="true" /><span>DEEPSEEK HARNESS</span></div>
        <div className="desktop-status">{host?.state === 'ready' ? 'Official Harness' : host?.detail ?? 'Starting official Harness...'}</div>
        <HostPill status={host} />
      </header>
      <section className="harness-stage" aria-label="Official DeepSeek Harness">
        {host?.url !== undefined
          ? <iframe className="harness-frame" src={host.url} title="Official DeepSeek Harness" referrerPolicy="no-referrer" />
          : <HarnessStartupState host={host} />}
      </section>
    </main>
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
