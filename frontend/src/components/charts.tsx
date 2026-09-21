type Slice = {
  label: string;
  value: number;
  color: string;
};

type DonutProps = {
  slices: Slice[];
  caption: string;
};

export function DonutChart({ slices, caption }: DonutProps) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  if (total === 0) {
    return <p className="aam-muted">Nothing to chart yet.</p>;
  }

  return (
    <div className="aam-donut">
      <svg viewBox="0 0 120 120" role="img" aria-label={caption}>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--pf-t--global--border--color--default)" strokeWidth="14" />
        {slices
          .filter((slice) => slice.value > 0)
          .map((slice) => {
            const length = (slice.value / total) * circumference;
            const element = (
              <circle
                key={slice.label}
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth="14"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 60 60)"
              />
            );
            offset += length;
            return element;
          })}
        <text x="60" y="56" textAnchor="middle" className="aam-donut__value">
          {total.toLocaleString()}
        </text>
        <text x="60" y="72" textAnchor="middle" className="aam-donut__caption">
          {caption}
        </text>
      </svg>
      <ul className="aam-chart-legend">
        {slices.map((slice) => (
          <li key={slice.label}>
            <span className="aam-chart-legend__swatch" style={{ background: slice.color }} />
            {slice.label}
            <strong>{slice.value.toLocaleString()}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Column = {
  label: string;
  value: number | null;
};

export function ColumnChart({
  items,
  emptyText = "No activity in this range.",
  label = "Activity by day",
}: {
  items: Column[];
  emptyText?: string;
  label?: string;
}) {
  const hasNumber = items.some((item) => typeof item.value === "number");
  const allZero = items.every((item) => item.value == null || item.value === 0);
  const anyGap = items.some((item) => item.value == null);
  if (!hasNumber || (allZero && !anyGap)) {
    return <p className="aam-muted">{emptyText}</p>;
  }

  const max = Math.max(...items.map((item) => (typeof item.value === "number" ? item.value : 0)), 1);

  return (
    <div className="aam-columns" role="img" aria-label={label}>
      {items.map((item) => {
        const missing = item.value == null;
        const value = item.value ?? 0;
        return (
          <div key={item.label} className="aam-columns__item">
            <div className="aam-columns__value">{missing ? "–" : item.value}</div>
            <div className="aam-columns__track">
              <div
                className="aam-columns__bar"
                style={{ height: missing ? "0%" : `${Math.max((value / max) * 100, value > 0 ? 8 : 0)}%` }}
              />
            </div>
            <div className="aam-columns__label">{item.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export function activityByDay(timestamps: string[], days = 7): Column[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: days }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (days - 1 - index));
    return { day, value: 0 };
  });
  for (const timestamp of timestamps) {
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) {
      continue;
    }
    parsed.setHours(0, 0, 0, 0);
    const match = buckets.find((bucket) => bucket.day.getTime() === parsed.getTime());
    if (match) {
      match.value += 1;
    }
  }
  return buckets.map((bucket) => ({
    label: bucket.day.toLocaleDateString(undefined, { weekday: "short" }),
    value: bucket.value,
  }));
}

export function averageScoreByDay(
  samples: Array<{ collected_at: string; health_score: number }>,
  days = 7,
): Column[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: days }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (days - 1 - index));
    return { day, total: 0, count: 0 };
  });
  for (const sample of samples) {
    const parsed = new Date(sample.collected_at);
    if (Number.isNaN(parsed.getTime())) {
      continue;
    }
    parsed.setHours(0, 0, 0, 0);
    const match = buckets.find((bucket) => bucket.day.getTime() === parsed.getTime());
    if (match) {
      match.total += sample.health_score;
      match.count += 1;
    }
  }
  return buckets.map((bucket) => ({
    label: bucket.day.toLocaleDateString(undefined, { weekday: "short" }),
    value: bucket.count ? Math.round(bucket.total / bucket.count) : null,
  }));
}
