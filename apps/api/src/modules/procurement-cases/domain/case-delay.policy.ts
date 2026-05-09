export class CaseDelayPolicy {
  validate(input: { delayExternalDays?: number | null; delayReason?: string | null }): string[] {
    if ((input.delayExternalDays ?? 0) > 0 && !input.delayReason?.trim()) {
      return ["Delay reason is required when uncontrollable delay days are greater than zero."];
    }
    return [];
  }
}

