const tones: Record<string, string> = {
  neutral: "bg-pitch-100 text-ink-600",
  gold: "bg-gold-100 text-[#7a5215]",
  brick: "bg-brick-100 text-brick-600",
  pitch: "bg-pitch-100 text-pitch-700",
};

export default function Badge({
  children, tone = "neutral",
}: { children: React.ReactNode; tone?: keyof typeof tones }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}