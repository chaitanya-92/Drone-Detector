export default function Header({ connected, companies }) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        DRONE-TRACK <span className="accent">v1.0</span>
        <span className="topbar-sep">·</span>
        MULTI-COMPANY FLEET TRACKING
        {companies > 0 && <span className="topbar-sep">·</span>}
        {companies > 0 && <span className="dim">{companies} COMPANIES</span>}
      </div>
      <div className={`system-status ${connected ? 'online' : 'offline'}`}>
        <span className="status-dot" />
        {connected ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE'}
      </div>
    </header>
  );
}
