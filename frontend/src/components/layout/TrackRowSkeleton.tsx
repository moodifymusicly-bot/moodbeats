export const TrackRowSkeleton = () => (
  <div className="flex items-center gap-4 p-3 rounded-2xl w-full">
    <div className="w-14 h-14 rounded-xl flex-none skeleton-shimmer" />
    <div className="flex-1 min-w-0">
      <div className="h-3.5 w-3/4 rounded-full mb-2 skeleton-shimmer" />
      <div className="h-2.5 w-1/3 rounded-full skeleton-shimmer" />
    </div>
  </div>
);

export const PlaylistRowSkeleton = () => (
  <div className="w-full flex items-center gap-3 p-3">
    <div className="w-6 flex justify-center">
      <div className="w-4 h-3 rounded-sm skeleton-shimmer" />
    </div>
    <div className="w-11 h-11 rounded-lg flex-none skeleton-shimmer" />
    <div className="flex-1 min-w-0">
      <div className="h-3.5 w-3/4 rounded-full mb-2 skeleton-shimmer" />
      <div className="h-2.5 w-1/3 rounded-full skeleton-shimmer" />
    </div>
    <div className="w-8 h-3 rounded-full skeleton-shimmer" />
  </div>
);
