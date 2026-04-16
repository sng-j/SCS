import { cn } from "@/lib/utils";

interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  status?: "online" | "offline" | "busy";
  className?: string;
}

const sizeStyles = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-9 w-9 text-body-xs",
  lg: "h-11 w-11 text-body-sm",
};

const statusSize = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
};

const statusColor = {
  online: "bg-safety-low",
  offline: "bg-text-tertiary",
  busy: "bg-safety-high",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Deterministic color from name
function getColor(name: string): string {
  const colors = [
    "bg-brand", "bg-safety-elevated", "bg-[#7C3AED]",
    "bg-safety-low", "bg-[#0891B2]", "bg-surface-dark",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function Avatar({ name, size = "md", status, className }: AvatarProps) {
  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      <div
        className={cn(
          "flex items-center justify-center rounded-full font-bold text-white select-none",
          "transition-transform duration-200",
          sizeStyles[size],
          getColor(name),
        )}
        title={name}
      >
        {getInitials(name)}
      </div>
      {status && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full border-2 border-white",
            statusSize[size],
            statusColor[status],
          )}
        />
      )}
    </div>
  );
}
