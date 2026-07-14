// PageLoader.tsx — Branded tab-loading fallback for React.Suspense
export default function PageLoader() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center h-full gap-4 select-none">
      <div className="relative">
        {/* Outer ring */}
        <div className="w-14 h-14 rounded-full border-4 border-orange-100 dark:border-orange-900/30" />
        {/* Spinning arc */}
        <div className="absolute inset-0 w-14 h-14 rounded-full border-4 border-transparent border-t-orange-500 animate-spin" />
        {/* Center icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-5 h-5 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg shadow-sm shadow-orange-300/50 dark:shadow-orange-900/30" />
        </div>
      </div>
      <p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest animate-pulse">
        Loading...
      </p>
    </div>
  );
}
