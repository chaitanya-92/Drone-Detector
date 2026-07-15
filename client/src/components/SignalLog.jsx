export default function SignalLog({ log }) {
  return (
    <section className="panel panel-grow">
      <div className="panel-title">▶ SIGNAL LOG</div>
      <div className="log-body">
        {log.length === 0 && <p className="empty">LOG EMPTY</p>}
        {log.map((entry) => (
          <div key={entry.key} className={`log-line log-${entry.level}`}>
            <span className="log-time">{entry.time}</span> {entry.text}
          </div>
        ))}
      </div>
    </section>
  );
}
