const caseStageNames: Record<number, string> = {
  0: "PR under review by Buyer",
  1: "NIT Approval Awaited",
  2: "NIT Approved, Tender to be published",
  3: "NIT published, Bids awaited",
  4: "Bids under evaluation",
  5: "Evaluation completed, in Negotiation stage",
  6: "NFA Note under approval",
  7: "NFA Note Approved, RC/PO to be issued",
  8: "RC/PO issued",
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
