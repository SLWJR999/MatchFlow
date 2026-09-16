export default function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line py-10 text-center">
      <p className="font-display font-medium text-ink-900">{title}</p>
      {hint && <p className="mt-1 text-sm text-ink-600">{hint}</p>}
    </div>
  );
}