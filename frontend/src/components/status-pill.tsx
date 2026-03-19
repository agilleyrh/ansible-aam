type Props = {
  status: string | undefined | null;
};

export function StatusPill({ status }: Props) {
  const normalized = (status ?? "unknown").toLowerCase();
  return <span className={`status-pill status-${normalized}`}>{normalized.replaceAll("_", " ")}</span>;
}

