import { Badge } from "@/components/ui/badge";
import { PositionRecordTier } from "@workspace/api-client-react/src/generated/api.schemas";

export function TierBadge({ tier, className = "" }: { tier: PositionRecordTier | string, className?: string }) {
  const getTierClass = () => {
    switch (tier) {
      case "will":
        return "badge-tier-will";
      case "should":
        return "badge-tier-should";
      case "more_likely_than_not":
        return "badge-tier-more-likely";
      case "substantial_authority":
        return "badge-tier-substantial";
      case "reasonable_basis":
        return "badge-tier-reasonable";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getTierLabel = () => {
    switch (tier) {
      case "will": return "Will";
      case "should": return "Should";
      case "more_likely_than_not": return "More Likely Than Not";
      case "substantial_authority": return "Substantial Authority";
      case "reasonable_basis": return "Reasonable Basis";
      default: return tier;
    }
  };

  return (
    <Badge 
      variant="outline" 
      className={`font-mono uppercase text-[10px] tracking-wider py-0.5 px-2 border border-solid ${getTierClass()} ${className}`}
    >
      {getTierLabel()}
    </Badge>
  );
}