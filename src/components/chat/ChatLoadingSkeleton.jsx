export function ChatSessionListSkeleton({ rows = 4 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          // eslint-disable-next-line react/no-array-index-key
          key={idx}
          className="h-8 w-full animate-pulse rounded-lg bg-[rgba(148,163,184,0.25)]/40"
        />
      ))}
    </div>
  );
}

export function ChatThreadSkeleton({ bubbles = 3 }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: bubbles }).map((_, idx) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={idx} className={`flex ${idx % 2 === 0 ? "justify-start" : "justify-end"}`}>
          <div className="max-w-[75%] animate-pulse rounded-2xl bg-slate-100 px-4 py-3" />
        </div>
      ))}
    </div>
  );
}

