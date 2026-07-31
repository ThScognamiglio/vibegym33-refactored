import React from 'react';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => {
  return (
    <div className={`animate-pulse bg-gray-200 dark:bg-gray-800 rounded-xl ${className}`} />
  );
};

export const DashboardSkeleton = () => {
  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 p-4 space-y-6 overflow-hidden">
      {/* Header Area */}
      <div className="flex items-center gap-4 mb-2">
        <Skeleton className="w-12 h-12 rounded-full shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
      
      {/* Main Hero Card (Adherence) */}
      <Skeleton className="w-full h-40 rounded-3xl" />
      
      {/* Scrollable Horizontal Cards (Days) */}
      <div className="flex gap-3 overflow-hidden">
        <Skeleton className="w-24 h-32 rounded-2xl shrink-0" />
        <Skeleton className="w-24 h-32 rounded-2xl shrink-0" />
        <Skeleton className="w-24 h-32 rounded-2xl shrink-0" />
        <Skeleton className="w-24 h-32 rounded-2xl shrink-0" />
      </div>

      {/* Grid of 2 small stats */}
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>

      {/* Chart Placeholder */}
      <div className="flex-1 min-h-[200px]">
        <Skeleton className="h-6 w-1/3 mb-4" />
        <Skeleton className="w-full h-48 rounded-3xl" />
      </div>
    </div>
  );
};

export const AppLoadingSkeleton = () => {
  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-950 flex flex-col md:flex-row">
      <div className="flex-1 flex flex-col items-center justify-center px-6 opacity-60">
        <div className="animate-pulse flex flex-col items-center">
            {/* Logo Silhouette */}
            <div className="w-16 h-16 bg-gray-200 dark:bg-gray-800 rounded-2xl mb-6 shadow-xl flex items-center justify-center">
              <Skeleton className="w-8 h-8 rounded-md bg-gray-300 dark:bg-gray-700" />
            </div>
            <Skeleton className="h-4 w-32 mb-2 rounded-full" />
            <Skeleton className="h-2 w-20 rounded-full bg-gray-200 dark:bg-gray-800" />
        </div>
      </div>
    </div>
  );
};
