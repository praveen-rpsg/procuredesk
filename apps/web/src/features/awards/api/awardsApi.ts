import { apiRequest } from "../../../shared/api/client";

export type CaseAward = {
  caseId: string;
  createdAt: string;
  id: string;
  notes: string | null;
  poAwardDate: string | null;
  poNumber: string | null;
  poValue: number | null;
  poValidityDate: string | null;
  updatedAt: string;
  vendorCode: string | null;
  vendorName: string;
};

export function listAwards(caseId: string) {
  return apiRequest<CaseAward[]>(`/cases/${caseId}/awards`);
}

export function createAward(
  caseId: string,
  payload: {
    notes?: string | null;
    poAwardDate?: string | null;
    poNumber?: string | null;
    poValue?: number | null;
    poValidityDate?: string | null;
    vendorCode?: string | null;
    vendorName: string;
  },
) {
  return apiRequest<{ id: string }>(`/cases/${caseId}/awards`, {
    body: JSON.stringify(payload),
    method: "POST",
  });
}

export function updateAward(
  caseId: string,
  awardId: string,
  payload: {
    notes?: string | null;
    poAwardDate?: string | null;
    poNumber?: string | null;
    poValue?: number | null;
    poValidityDate?: string | null;
    vendorCode?: string | null;
    vendorName?: string;
  },
) {
  return apiRequest<void>(`/cases/${caseId}/awards/${awardId}`, {
    body: JSON.stringify(payload),
    method: "PATCH",
  });
}

export function deleteAward(caseId: string, awardId: string) {
  return apiRequest<void>(`/cases/${caseId}/awards/${awardId}`, {
    method: "DELETE",
  });
}
