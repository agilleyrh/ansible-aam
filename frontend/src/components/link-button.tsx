import { Button, type ButtonProps } from "@patternfly/react-core";
import { Link } from "react-router-dom";

type Props = Omit<ButtonProps, "component"> & {
  to: string;
  replace?: boolean;
};

export function LinkButton({ to, replace = false, ...props }: Props) {
  return <Button {...props} component={(linkProps) => <Link {...linkProps} to={to} replace={replace} />} />;
}
