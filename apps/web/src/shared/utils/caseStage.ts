const caseStageNames: Record<number, string> = {
  0: "PR Receipt",
  1: "NIT Initiation",
  2: "NIT Approval",
  3: "NIT Publish",
  4: "Bid Receipt",
  5: "Technical / Commercial Evaluation",
  6: "NFA Submission",
  7: "NFA Approval / LOI Issued",
  8: "RC/PO Award",
};

export function formatCaseStage(stageCode: number | null | undefined): string {
  if (stageCode == null) return "-";
  const stageName = caseStageNames[stageCode];
  return stageName ? `Stage ${stageCode} - ${stageName}` : `Stage ${stageCode}`;
}

export function formatCaseStageTransition(
  stageCode: number,
  desiredStageCode: number | null | undefined,
): string {
  if (desiredStageCode == null) return formatCaseStage(stageCode);
  return `${formatCaseStage(stageCode)} -> ${formatCaseStage(desiredStageCode)}`;
}
