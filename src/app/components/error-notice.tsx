import type { ReactNode } from 'react';

export default function ErrorNotice({
  children,
  title,
  compact = false,
}: {
  children: ReactNode;
  title?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`error-notice${compact ? ' error-notice-compact' : ''}`}
      role="alert"
    >
      <span className="error-notice-icon" aria-hidden="true">
        !
      </span>
      <span>
        {title && <strong>{title}</strong>}
        {children}
      </span>
    </div>
  );
}
