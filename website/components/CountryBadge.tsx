// Country badges as circles with text (flag emojis render as plain letters on Windows).
const COUNTRIES: Record<string, { code: string; from: string; to: string }> = {
  "🇵🇰": { code: "PK", from: "#0f6b3f", to: "#1b9a5c" }, PK: { code: "PK", from: "#0f6b3f", to: "#1b9a5c" },
  "🇺🇸": { code: "USA", from: "#1d2f6f", to: "#3b57b5" }, USA: { code: "USA", from: "#1d2f6f", to: "#3b57b5" },
  "🇬🇧": { code: "UK", from: "#5b1230", to: "#b3123b" }, UK: { code: "UK", from: "#5b1230", to: "#b3123b" },
  "🇦🇪": { code: "UAE", from: "#2d2d2d", to: "#c4000d" }, UAE: { code: "UAE", from: "#2d2d2d", to: "#c4000d" },
};

export default function CountryBadge({ flag, size = 40, className = "" }: { flag: string; size?: number; className?: string }) {
  const c = COUNTRIES[flag] ?? COUNTRIES["🇵🇰"];
  return (
    <span
      role="img" aria-label={c.code}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold tracking-wide text-white ring-2 ring-white shadow-md ${className}`}
      style={{ width: size, height: size, fontSize: size * (c.code.length > 2 ? 0.27 : 0.34), background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}
    >
      {c.code}
    </span>
  );
}
