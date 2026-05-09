export class PlanningDatePolicy {
  validateRcPoDates(input: {
    rcPoAwardDate?: string | null;
    rcPoValidityDate?: string | null;
  }): string[] {
    if (
      input.rcPoAwardDate &&
      input.rcPoValidityDate &&
      input.rcPoValidityDate < input.rcPoAwardDate
    ) {
      return ["RC/PO validity date cannot be before RC/PO award date."];
    }
    return [];
  }
}
