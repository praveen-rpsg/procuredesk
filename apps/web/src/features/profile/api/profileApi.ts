import { apiRequest } from "../../../shared/api/client";
import type { CurrentUser } from "../../../shared/auth/AuthProvider";

export function updateOwnProfile(payload: { fullName: string }) {
  return apiRequest<{ user: CurrentUser }>("/auth/me/profile", {
    body: JSON.stringify(payload),
    method: "PATCH",
  });
}

export function changeOwnPassword(payload: { currentPassword: string; newPassword: string }) {
  return apiRequest<{ updated: true }>("/auth/me/password", {
    body: JSON.stringify(payload),
    method: "PUT",
  });
}
