export interface BankAvatarProps {
  name: string;
  size?: number;
  className?: string;
}

const PALETTE = [
  "#F6D9CE", // coral tint
  "#D9EEE0", // mint tint
  "#D8E6F5", // sky tint
  "#F7E7C4", // gold tint
  "#E5DDF3", // lavender tint
  "#D5EFE9", // teal tint
  "#F5DCE7", // pink tint
  "#E4E9D6", // sage tint
];

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) =>
      word
        .replace(/[^a-zA-Z]/g, "")
        .charAt(0)
        .toUpperCase(),
    )
    .join("");
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function BankAvatar({ name, size = 36, className }: BankAvatarProps) {
  const initials = initialsFor(name);
  const background = PALETTE[hashString(name) % PALETTE.length];

  return (
    <span
      role="img"
      aria-label={name}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: background,
        color: "#1F2A24",
        fontSize: size * 0.4,
        fontWeight: 600,
        fontFamily: "Manrope, Inter, system-ui, sans-serif",
      }}
    >
      {initials}
    </span>
  );
}
