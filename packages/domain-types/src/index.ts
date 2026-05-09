export const AccessLevel = {
  User: "user",
  Entity: "entity",
  Group: "group",
} as const;

export type AccessLevel = (typeof AccessLevel)[keyof typeof AccessLevel];

export const CaseStatus = {
  Running: "running",
  Completed: "completed",
} as const;

export type CaseStatus = (typeof CaseStatus)[keyof typeof CaseStatus];

