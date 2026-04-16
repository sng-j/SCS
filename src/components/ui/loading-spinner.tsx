import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  className?: string;
  /** Whether to center in parent with min-height */
  fullPage?: boolean;
}

export function LoadingSpinner({ className, fullPage }: LoadingSpinnerProps) {
  const spinner = (
    <div
      className={cn(
        "h-6 w-6 border-2 border-brand border-t-transparent rounded-full animate-spin",
        className,
      )}
    />
  );

  if (fullPage) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        {spinner}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-8">
      {spinner}
    </div>
  );
}
