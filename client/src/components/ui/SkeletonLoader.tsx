interface SkeletonLoaderProps {
  lines?: number;
  className?: string;
}

export default function SkeletonLoader({ lines = 3, className = '' }: SkeletonLoaderProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton h-4 rounded"
          style={{ width: `${Math.random() * 30 + 60}%` }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm">
      <div className="skeleton h-3 w-24 rounded mb-4" />
      <div className="skeleton h-8 w-32 rounded mb-3" />
      <div className="skeleton h-3 w-20 rounded" />
    </div>
  );
}
