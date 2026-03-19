type Props = {
  label: string;
  value: string | number;
  detail?: string;
};

export function StatCard({ label, value, detail }: Props) {
  return (
    <article className="stat-card">
      <p className="stat-card__label">{label}</p>
      <p className="stat-card__value">{value}</p>
      {detail ? <p className="stat-card__detail">{detail}</p> : null}
    </article>
  );
}

