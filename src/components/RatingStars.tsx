import { Star } from "lucide-react";

export default function RatingStars({
  rating,
  reviewCount,
  size = "sm",
}: {
  rating: number;
  reviewCount?: number;
  size?: "sm" | "md";
}) {
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <div className="flex items-center gap-1 text-ink-700">
      <Star className={`${iconSize} fill-terracotta-500 text-terracotta-500`} />
      <span className="text-sm font-semibold">{rating.toFixed(1)}</span>
      {reviewCount !== undefined && (
        <span className="text-sm text-ink-500">({reviewCount})</span>
      )}
    </div>
  );
}
