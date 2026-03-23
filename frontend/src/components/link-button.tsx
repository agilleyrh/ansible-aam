import { Button, type ButtonProps } from "@patternfly/react-core";
import { useNavigate } from "react-router-dom";

type Props = ButtonProps & {
  to: string;
  replace?: boolean;
};

export function LinkButton({ to, replace = false, onClick, ...props }: Props) {
  const navigate = useNavigate();

  return (
    <Button
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          navigate(to, { replace });
        }
      }}
    />
  );
}
