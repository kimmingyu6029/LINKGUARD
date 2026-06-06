export default function StatusPill({ tone = "blue", children, icon: Icon }) {
  return (
    <span className={`status-pill tone-${tone}`}>
      {Icon ? <Icon size={14} /> : null}
      {children}
    </span>
  );
}
