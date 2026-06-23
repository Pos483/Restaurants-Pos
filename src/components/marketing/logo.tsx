import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-sm">
        <svg
          width="22"
          height="22"
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M12 9.5C12 8.67 12.67 8 13.5 8H26.5C27.33 8 28 8.67 28 9.5V30.5C28 30.82 27.65 31.03 27.36 30.88L25 29.6L22.64 30.88C22.42 31 22.15 31 21.93 30.88L19.57 29.6L17.21 30.88C16.99 31 16.72 31 16.5 30.88L14.14 29.6L12.64 30.88C12.35 31.03 12 30.82 12 30.5V9.5Z"
            fill="white"
          />
          <rect x="15.5" y="12.5" width="9" height="2" rx="1" fill="#f59e0b" />
          <rect x="15.5" y="17" width="9" height="2" rx="1" fill="#fb923c" />
          <rect x="15.5" y="21.5" width="6" height="2" rx="1" fill="#fdba74" />
        </svg>
      </span>
      <span className="font-display text-xl font-extrabold tracking-tight text-stone-900">
        Siya<span className="text-amber-600">Bill</span>
      </span>
    </span>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-sm",
        className,
      )}
    >
      <svg width="22" height="22" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <path
          d="M12 9.5C12 8.67 12.67 8 13.5 8H26.5C27.33 8 28 8.67 28 9.5V30.5C28 30.82 27.65 31.03 27.36 30.88L25 29.6L22.64 30.88C22.42 31 22.15 31 21.93 30.88L19.57 29.6L17.21 30.88C16.99 31 16.72 31 16.5 30.88L14.14 29.6L12.64 30.88C12.35 31.03 12 30.82 12 30.5V9.5Z"
          fill="white"
        />
        <rect x="15.5" y="12.5" width="9" height="2" rx="1" fill="#f59e0b" />
        <rect x="15.5" y="17" width="9" height="2" rx="1" fill="#fb923c" />
        <rect x="15.5" y="21.5" width="6" height="2" rx="1" fill="#fdba74" />
      </svg>
    </span>
  );
}
