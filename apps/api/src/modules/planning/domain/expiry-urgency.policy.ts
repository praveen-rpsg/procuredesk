export class ExpiryUrgencyPolicy {
  classify(daysToExpiry: number | null): "expired" | "critical" | "warning" | "normal" {
    if (daysToExpiry == null) return "normal";
    if (daysToExpiry < 0) return "expired";
    if (daysToExpiry <= 30) return "critical";
    if (daysToExpiry <= 90) return "warning";
    return "normal";
  }
}
