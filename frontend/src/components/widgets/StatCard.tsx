type StatCardProps = {
  title: string;
  value: string;
  caption?: string;
  accent?: 'primary' | 'warning';
};

export function StatCard({ title, value, caption, accent = 'primary' }: StatCardProps) {
  const accentClasses =
    accent === 'primary'
      ? 'bg-accent/10 text-accent border-accent/30'
      : 'bg-accent-alt/10 text-accent-alt border-accent-alt/30';

  return (
    <article className={`rounded-card border ${accentClasses} p-4 shadow-soft bg-card`}>
      <p className="text-xs uppercase tracking-wide text-muted">{title}</p>
      <p className="text-2xl font-bold text-heading">{value}</p>
      {caption ? <p className="text-sm text-muted">{caption}</p> : null}
    </article>
  );
}

export default StatCard;
