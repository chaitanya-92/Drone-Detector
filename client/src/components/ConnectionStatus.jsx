export default function ConnectionStatus({ connected }) {
  return (
    <div className={`conn ${connected ? 'conn-ok' : 'conn-bad'}`}>
      <span className="conn-dot" />
      {connected ? 'Live' : 'Reconnecting…'}
    </div>
  );
}
