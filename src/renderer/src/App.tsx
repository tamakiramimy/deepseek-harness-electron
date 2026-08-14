import { useEffect, useState } from 'react'
import {
  Bot, ChevronRight, FileCode2, FolderOpen, FolderTree, Github, LayoutPanelLeft,
  MessageSquareText, PanelBottom, Play, Settings2, Sparkles, TerminalSquare,
} from 'lucide-react'
import type { DesktopSnapshot, HostStatus, WorkspaceSummary } from '../../shared/contracts.js'

type Section = 'explorer' | 'sessions' | 'search'

const files = [
  { name: 'src', kind: 'folder' },
  { name: 'packages', kind: 'folder' },
  { name: 'README.md', kind: 'file' },
  { name: 'package.json', kind: 'file' },
]

export function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<DesktopSnapshot | undefined>()
  const [activeSection, setActiveSection] = useState<Section>('explorer')
  const [detailsOpen, setDetailsOpen] = useState(true)

  useEffect(() => {
    void window.deepseekDesktop.getSnapshot().then(setSnapshot)
    return window.deepseekDesktop.onHostStatus((host) => {
      setSnapshot((current) => current === undefined ? undefined : { ...current, host })
    })
  }, [])

  const workspace = snapshot?.workspace
  const openWorkspace = async (): Promise<void> => {
    const next = await window.deepseekDesktop.chooseWorkspace()
    if (next !== undefined) setSnapshot((current) => withWorkspace(current, next))
  }
  const clearWorkspace = async (): Promise<void> => {
    await window.deepseekDesktop.clearWorkspace()
    setSnapshot((current) => current === undefined ? current : { ...current, workspace: undefined })
  }

  return (
    <main className="app-shell">
      <header className="titlebar">
        <div className="brand"><Sparkles size={17} aria-hidden="true" /> <span>DEEPSEEK HARNESS</span></div>
        <div className="titlebar-path">{workspace?.path ?? 'No workspace selected'}</div>
        <HostPill status={snapshot?.host} />
      </header>
      <section className="workbench">
        <nav className="activity-bar" aria-label="Primary views">
          <ActivityButton active={activeSection === 'explorer'} label="Explorer" onClick={() => setActiveSection('explorer')}><FolderTree /></ActivityButton>
          <ActivityButton active={activeSection === 'sessions'} label="Sessions" onClick={() => setActiveSection('sessions')}><MessageSquareText /></ActivityButton>
          <ActivityButton active={activeSection === 'search'} label="Search" onClick={() => setActiveSection('search')}><Github /></ActivityButton>
          <div className="activity-spacer" />
          <ActivityButton active={false} label="Settings"><Settings2 /></ActivityButton>
        </nav>
        <aside className="sidebar">
          <Sidebar
            activeSection={activeSection}
            workspace={workspace}
            onChooseWorkspace={openWorkspace}
            onClearWorkspace={clearWorkspace}
          />
        </aside>
        <section className="editor-area" aria-label="Editor workbench">
          <div className="editor-tabs">
            <span className="tab active"><FileCode2 size={15} /> Welcome</span>
            <button className="panel-toggle" type="button" title="Toggle AI panel" onClick={() => setDetailsOpen((open) => !open)}><LayoutPanelLeft size={16} /></button>
          </div>
          <div className="editor-content">
            <div className="welcome-mark"><Bot size={28} /></div>
            <h1>Desktop Harness</h1>
            <p>Choose a workspace to prepare the local coding environment.</p>
            <button className="command-button" type="button" onClick={() => void openWorkspace()}><FolderOpen size={17} /> Open workspace</button>
            <div className="command-list" aria-label="Next actions">
              <span><ChevronRight size={14} /> Configure a DeepSeek model</span>
              <span><ChevronRight size={14} /> Start a coding session</span>
              <span><ChevronRight size={14} /> Review an agent change</span>
            </div>
          </div>
          <footer className="status-bar">
            <span><Play size={13} /> {workspace?.name ?? 'Workspace not open'}</span>
            <span><TerminalSquare size={13} /> Local Desktop Host</span>
            <span><PanelBottom size={13} /> Harness IPC foundation</span>
          </footer>
        </section>
        {detailsOpen ? <aside className="assistant-panel"><AssistantPanel workspace={workspace} host={snapshot?.host} /></aside> : null}
      </section>
    </main>
  )
}

function withWorkspace(snapshot: DesktopSnapshot | undefined, workspace: WorkspaceSummary): DesktopSnapshot {
  return snapshot === undefined
    ? { apiVersion: 1, host: { state: 'starting', detail: 'Loading desktop status.' }, workspace }
    : { ...snapshot, workspace }
}

function ActivityButton({ active, label, onClick, children }: {
  active: boolean
  label: string
  onClick?: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return <button className={active ? 'activity-button active' : 'activity-button'} type="button" title={label} aria-label={label} onClick={onClick}>{children}</button>
}

function Sidebar({ activeSection, workspace, onChooseWorkspace, onClearWorkspace }: {
  activeSection: Section
  workspace: WorkspaceSummary | undefined
  onChooseWorkspace: () => Promise<void>
  onClearWorkspace: () => Promise<void>
}): React.JSX.Element {
  if (activeSection === 'sessions') {
    return <><h2>SESSIONS</h2><div className="empty-sidebar"><MessageSquareText size={22} /><p>No session is connected yet.</p></div></>
  }
  if (activeSection === 'search') {
    return <><h2>SEARCH</h2><div className="empty-sidebar"><Github size={22} /><p>Repository search joins the Harness Host next.</p></div></>
  }
  return <>
    <div className="sidebar-heading"><h2>EXPLORER</h2><button type="button" title="Open workspace" aria-label="Open workspace" onClick={() => void onChooseWorkspace()}><FolderOpen size={16} /></button></div>
    {workspace === undefined ? <div className="empty-sidebar"><FolderTree size={22} /><p>Open a folder to begin.</p><button type="button" className="text-button" onClick={() => void onChooseWorkspace()}>Open workspace</button></div> : <>
      <div className="workspace-root"><FolderOpen size={15} /><span title={workspace.path}>{workspace.name}</span><button type="button" title="Close workspace" aria-label="Close workspace" onClick={() => void onClearWorkspace()}>x</button></div>
      <ul className="file-tree">
        {files.map((file) => <li key={file.name}>{file.kind === 'folder' ? <FolderOpen size={15} /> : <FileCode2 size={15} />}<span>{file.name}</span></li>)}
      </ul>
    </>}
  </>
}

function AssistantPanel({ workspace, host }: { workspace: WorkspaceSummary | undefined; host: HostStatus | undefined }): React.JSX.Element {
  return <>
    <div className="assistant-heading"><div><Bot size={17} /><h2>HARNESS</h2></div><span className="live-dot" /></div>
    <div className="assistant-body">
      <div className="assistant-card"><span className="eyebrow">HOST</span><strong>{host?.state === 'ready' ? 'Ready for adapter' : 'Starting'}</strong><p>{host?.detail ?? 'Connecting to the Desktop Host.'}</p></div>
      <div className="assistant-card"><span className="eyebrow">WORKSPACE</span><strong>{workspace?.name ?? 'Not selected'}</strong><p>{workspace?.path ?? 'The native workspace picker is ready.'}</p></div>
      <div className="assistant-note">The next implementation slice mounts the official DeepSeek Harness client through the isolated Host transport.</div>
    </div>
    <div className="composer"><button type="button" aria-label="Attach context" title="Attach context"><Sparkles size={16} /></button><input disabled value="Harness connection adapter is being prepared" aria-label="Harness prompt" /><button type="button" aria-label="Send prompt" title="Send prompt" disabled><ChevronRight size={16} /></button></div>
  </>
}

function HostPill({ status }: { status: HostStatus | undefined }): React.JSX.Element {
  const state = status?.state ?? 'starting'
  return <span className={`host-pill ${state}`}><i />{state === 'ready' ? 'Host ready' : state === 'failed' ? 'Host error' : 'Host starting'}</span>
}
