interface EmptyStateProps {
  emoji: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}

export function EmptyState({ emoji, title, body, action }: EmptyStateProps) {
  return (
    // `text-plate` does nothing on an ordinary theme; under a wallpaper it puts
    // this text on a plate instead of on the raw photograph. See globals.css.
    <div className="text-plate flex flex-col items-center text-center gap-2 py-12 px-6">
      <span className="text-4xl" aria-hidden>
        {emoji}
      </span>
      <h3 className="font-extrabold tracking-tight text-lg text-ink">{title}</h3>
      <p className="text-sm text-ink-faint max-w-xs leading-relaxed">{body}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
