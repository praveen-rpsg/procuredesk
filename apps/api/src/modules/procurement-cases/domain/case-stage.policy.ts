import {
  diffDateOnlyDays,
  todayDateOnlyString,
} from "../../../common/utils/date-only.js";
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

    const totalDays =
      diffDateOnlyDays(input.tentativeCompletionDate, input.prReceiptDate) ?? 0;
    if (totalDays <= 0) return null;

    const elapsedDays =
      diffDateOnlyDays(todayDateOnlyString(), input.prReceiptDate) ?? 0;
    const pct = (elapsedDays / totalDays) * 100;
    return desiredStageForElapsedPercent(pct);
  }

  isDelayed(actualStageCode: number, desiredStageCode: number | null): boolean {
    return desiredStageCode !== null && actualStageCode < desiredStageCode;
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
