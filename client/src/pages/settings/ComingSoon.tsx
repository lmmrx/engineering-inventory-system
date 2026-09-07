export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="card p-5 max-w-lg">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="font-semibold text-ink-100">{title}</h2>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-navy-800 text-ink-500">Coming soon</span>
      </div>
      <p className="text-sm text-ink-500">{description}</p>
    </div>
  );
}
