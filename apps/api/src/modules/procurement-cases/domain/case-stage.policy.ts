import type { CaseMilestones } from "./case-aggregate.js";

export class CaseStagePolicy {
  deriveActualStageCode(milestones: CaseMilestones): number {
    if (milestones.rcPoAwardDate) return 8;
    if (milestones.nfaApprovalDate) return 7;
    if (milestones.nfaSubmissionDate) return 6;
    if (milestones.commercialEvaluationDate && milestones.technicalEvaluationDate) return 5;
    if (milestones.bidReceiptDate) return 4;
    if (milestones.nitPublishDate) return 3;
    if (milestones.nitApprovalDate) return 2;
    if (milestones.nitInitiationDate) return 1;
    return 0;
  }

  deriveStatus(milestones: CaseMilestones): "running" | "completed" {
    return milestones.rcPoAwardDate ? "completed" : "running";
  }

  deriveDesiredStageCode(input: {
    prReceiptDate?: string | null;
    status: "running" | "completed";
    tentativeCompletionDate?: string | null;
  }): number | null {
    if (input.status === "completed") return null;
    if (!input.prReceiptDate || !input.tentativeCompletionDate) return null;

    const prDate = this.toDate(input.prReceiptDate);
    const targetDate = this.toDate(input.tentativeCompletionDate);
    const today = this.startOfDay(new Date());
    const totalDays = this.diffDays(targetDate, prDate);
    if (totalDays <= 0) return null;

    const elapsedDays = this.diffDays(today, prDate);
    const pct = (elapsedDays / totalDays) * 100;
    return desiredStageForElapsedPercent(pct);
  }

  isDelayed(actualStageCode: number, desiredStageCode: number | null): boolean {
    return desiredStageCode !== null && actualStageCode < desiredStageCode;
  }

  private diffDays(later: Date, earlier: Date): number {
    return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000);
  }

  private startOfDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private toDate(value: string): Date {
    return this.startOfDay(new Date(`${value}T00:00:00.000Z`));
  }
}

const desiredStageThresholds: Array<{ maxPercent: number; stageCode: number }> = [
  { maxPercent: 8, stageCode: 0 },
  { maxPercent: 13, stageCode: 1 },
  { maxPercent: 17, stageCode: 2 },
  { maxPercent: 52, stageCode: 3 },
  { maxPercent: 68, stageCode: 4 },
  { maxPercent: 88, stageCode: 5 },
  { maxPercent: 97, stageCode: 6 },
  { maxPercent: 100, stageCode: 7 },
];

function desiredStageForElapsedPercent(percent: number): number {
  return desiredStageThresholds.find((threshold) => percent < threshold.maxPercent)?.stageCode ?? 8;
}
