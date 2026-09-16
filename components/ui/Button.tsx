"use client";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

const styles: Record<string, string> = {
  primary: "bg-pitch-700 text-white hover:bg-pitch-900 disabled:bg-pitch-100 disabled:text-ink-600",
  secondary: "bg-pitch-100 text-pitch-900 hover:bg-pitch-100/70",
  ghost: "bg-transparent text-ink-900 hover:bg-pitch-100",
  danger: "bg-brick-600 text-white hover:opacity-90",
};

export default function Button({ variant = "primary", className = "", ...props }: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    />
  );
}