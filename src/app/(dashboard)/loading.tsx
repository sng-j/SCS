export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-6 w-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        <p className="text-body-sm text-text-tertiary animate-pulse">Loading...</p>
      </div>
    </div>
  );
}
