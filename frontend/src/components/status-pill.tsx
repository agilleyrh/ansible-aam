import { Label } from "@patternfly/react-core";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InfoCircleIcon,
  OutlinedClockIcon,
} from "@patternfly/react-icons";

import { humanize } from "../utils";

type Props = {
  status: string | undefined | null;
};

export function StatusPill({ status }: Props) {
  const normalized = (status ?? "unknown").toLowerCase();

  if (["healthy", "success", "completed", "enabled", "compliant", "ok"].includes(normalized)) {
    return (
      <Label color="green" icon={<CheckCircleIcon />} isCompact>
        {humanize(normalized)}
      </Label>
    );
  }

  if (["warning", "queued", "running", "pending", "in_progress"].includes(normalized)) {
    return (
      <Label color="orange" icon={<OutlinedClockIcon />} isCompact>
        {humanize(normalized)}
      </Label>
    );
  }

  if (["critical", "failed", "error", "disabled", "non_compliant", "degraded"].includes(normalized)) {
    return (
      <Label color="red" icon={normalized === "warning" ? <ExclamationTriangleIcon /> : <ExclamationCircleIcon />} isCompact>
        {humanize(normalized)}
      </Label>
    );
  }

  return (
    <Label color="blue" icon={<InfoCircleIcon />} isCompact>
      {humanize(normalized)}
    </Label>
  );
}
