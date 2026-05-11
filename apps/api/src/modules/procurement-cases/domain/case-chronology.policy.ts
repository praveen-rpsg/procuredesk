import type { CaseMilestones } from "./case-aggregate.js";

export class CaseChronologyPolicy {
  validate(input: {
    estimateBenchmark?: number | null;
    milestones: CaseMilestones;
    prReceiptDate?: string | null;
  }): string[] {
    const errors: string[] = [];
    const m = input.milestones;

    const evalDates = [m.commercialEvaluationDate, m.technicalEvaluationDate].filter(
      (value): value is string => Boolean(value),
    );
    const evalStart = this.minDate(evalDates);
    const evalEnd = this.maxDate(evalDates);

    const chain = [
      ["PR Receipt", input.prReceiptDate, input.prReceiptDate],
      ["NIT Initiation", m.nitInitiationDate, m.nitInitiationDate],
      ["NIT Approval", m.nitApprovalDate, m.nitApprovalDate],
      ["NIT Publish", m.nitPublishDate, m.nitPublishDate],
      ["Bid Receipt", m.bidReceiptDate, m.bidReceiptDate],
      ["Commercial / Technical Evaluation", evalStart, evalEnd],
      ["NFA Submission", m.nfaSubmissionDate, m.nfaSubmissionDate],
      ["NFA Approval", m.nfaApprovalDate, m.nfaApprovalDate],
      ["LOI Issued", m.loiIssuedDate, m.loiIssuedDate],
      ["RC/PO Award", m.rcPoAwardDate, m.rcPoAwardDate],
    ] as const;

    let previousLabel: string | null = null;
    let previousEnd: string | null = null;
    for (const [label, start, end] of chain) {
      if (!start) continue;
      if (previousEnd && start < previousEnd) {
        errors.push(`${label} cannot be before ${previousLabel}.`);
      }
      previousLabel = label;
      previousEnd = end ?? start;
    }

    const requiredBefore = [
      ["NIT Initiation", m.nitInitiationDate, "PR Receipt", input.prReceiptDate],
      ["NIT Approval", m.nitApprovalDate, "NIT Initiation", m.nitInitiationDate],
      ["NIT Publish", m.nitPublishDate, "NIT Approval", m.nitApprovalDate],
      ["Bid Receipt", m.bidReceiptDate, "NIT Publish", m.nitPublishDate],
      ["Commercial Evaluation", m.commercialEvaluationDate, "Bid Receipt", m.bidReceiptDate],
      ["Technical Evaluation", m.technicalEvaluationDate, "Bid Receipt", m.bidReceiptDate],
      ["NFA Submission", m.nfaSubmissionDate, "Bid Receipt", m.bidReceiptDate],
      ["NFA Approval", m.nfaApprovalDate, "NFA Submission", m.nfaSubmissionDate],
      ["RC/PO Award", m.rcPoAwardDate, "NFA Approval", m.nfaApprovalDate],
    ] as const;

    for (const [childLabel, childDate, parentLabel, parentDate] of requiredBefore) {
      if (childDate && !parentDate) {
        errors.push(`${childLabel} is filled but ${parentLabel} is blank.`);
      }
    }

    if (m.nfaSubmissionDate) {
      const missingPriorFields = [
        ["NIT Initiation", m.nitInitiationDate],
        ["NIT Approval", m.nitApprovalDate],
        ["NIT Publish", m.nitPublishDate],
        ["Bid Receipt", m.bidReceiptDate],
        ["Bidders Participated", m.biddersParticipated],
        ["Commercial Evaluation", m.commercialEvaluationDate],
        ["Technical Evaluation", m.technicalEvaluationDate],
        ["Qualified Bidders", m.qualifiedBidders],
        ["Estimate / Benchmark", input.estimateBenchmark],
      ]
        .filter(([, value]) => this.isBlank(value))
        .map(([label]) => label);

      if (missingPriorFields.length) {
        errors.push(
          `NFA Submission can be saved only after all prior milestone fields are filled. Missing: ${missingPriorFields.join(", ")}.`,
        );
      }
    }

    this.validateConditionalRequirements(errors, m);

    return errors;
  }

  private validateConditionalRequirements(errors: string[], milestones: CaseMilestones): void {
    const rules: Array<[boolean, string]> = [
      [
        Boolean(milestones.bidReceiptDate && milestones.biddersParticipated == null),
        "Bidders participated count is required when bid receipt date exists.",
      ],
      [
        Boolean(
          milestones.commercialEvaluationDate &&
            milestones.technicalEvaluationDate &&
            milestones.qualifiedBidders == null,
        ),
        "Qualified bidders count is required when both evaluation dates exist.",
      ],
      [
        Boolean(milestones.loiIssued && !milestones.loiIssuedDate),
        "LOI issued date is required when LOI is marked as issued.",
      ],
    ];

    for (const [isInvalid, message] of rules) {
      if (isInvalid) errors.push(message);
    }
  }

  private minDate(values: string[]): string | null {
    return values.length ? values.sort()[0] ?? null : null;
  }

  private maxDate(values: string[]): string | null {
    return values.length ? values.sort()[values.length - 1] ?? null : null;
  }

  private isBlank(value: unknown): boolean {
    return value === null || value === undefined || value === "";
  }
}
