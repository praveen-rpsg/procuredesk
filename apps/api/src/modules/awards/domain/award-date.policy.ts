export class AwardDatePolicy {
  validate(input: {
    poAwardDate?: string | null;
    poValidityDate?: string | null;
  }): string[] {
    if (
      input.poAwardDate &&
      input.poValidityDate &&
      input.poValidityDate < input.poAwardDate
    ) {
      return ["PO validity date cannot be before PO award date."];
    }
    return [];
  }
}
