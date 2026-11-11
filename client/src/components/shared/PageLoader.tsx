/** Shown for a moment while a page's code downloads (pages load on demand to keep the app fast). */
export default function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24" role="status" aria-label="Loading">
      <span className="w-8 h-8 rounded-full border-[3px] border-blue-100 border-t-[#2563EB] animate-spin" />
    </div>
  );
}
