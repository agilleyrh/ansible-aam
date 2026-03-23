export function formatDateTime(value: string | null | undefined, fallback = "Never"): string {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toLocaleString();
}

export function humanize(value: string | null | undefined, fallback = "Unknown"): string {
  if (!value) {
    return fallback;
  }

  return value.replaceAll("_", " ");
}

export function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "Not available";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}
