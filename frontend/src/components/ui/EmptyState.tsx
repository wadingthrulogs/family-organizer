interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-card border border-dashed border-th-border bg-hover-bg px-6 py-12 text-center">
      <p className="text-sm font-medium text-muted">{title}</p>
      {description && <p className="mt-1 text-xs text-faint">{description}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 rounded-full bg-btn-primary px-4 py-2 text-sm text-btn-primary-text"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
