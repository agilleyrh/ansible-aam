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

export function deploymentTypeLabel(value: string | null | undefined): string {
  switch (value) {
    case "podman":
      return "RHEL / Podman";
    case "openshift":
      return "OpenShift";
    case "aws":
      return "AWS";
    case "gcp":
      return "GCP";
    case "azure":
      return "Azure";
    case "other":
      return "Other";
    default:
      return humanize(value, "Unknown");
  }
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
