type SkeletonProps = {
  height?: number;
  width?: number | string;
};

export function Skeleton({ height = 16, width = "100%" }: SkeletonProps) {
  return <span className="skeleton" style={{ height, width }} />;
}

