import type { ReactNode } from "react";

type Props = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: Props) {
  return (
    <section className="empty-state">
      <div className="empty-state__icon" aria-hidden="true">
        +
      </div>
      <div className="empty-state__content">
        <h3>{title}</h3>
        <p>{description}</p>
        {action ? <div className="empty-state__action">{action}</div> : null}
      </div>
    </section>
  );
}
