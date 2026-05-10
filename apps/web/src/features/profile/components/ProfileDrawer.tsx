import { useMutation } from "@tanstack/react-query";
import { KeyRound, Save, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { changeOwnPassword, updateOwnProfile } from "../api/profileApi";
import { useAuth } from "../../../shared/auth/AuthProvider";
import { Button } from "../../../shared/ui/button/Button";
import { Drawer } from "../../../shared/ui/drawer/Drawer";
import { FormField, TextInput } from "../../../shared/ui/form/FormField";
import { useToast } from "../../../shared/ui/toast/ToastProvider";

type ProfileDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function ProfileDrawer({ isOpen, onClose }: ProfileDrawerProps) {
  const { notify } = useToast();
  const { updateUser, user } = useAuth();
  const [fullName, setFullName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setFullName(user?.fullName ?? "");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }, [isOpen, user?.fullName]);

  const hasProfileChanges = fullName.trim() !== (user?.fullName ?? "");
  const passwordError = useMemo(() => {
    if (!newPassword && !confirmPassword) return "";
    if (newPassword.length < 12) return "Password must be at least 12 characters.";
    if (newPassword !== confirmPassword) return "New password and confirmation must match.";
    if (!currentPassword) return "Current password is required.";
    return "";
  }, [confirmPassword, currentPassword, newPassword]);

  const profileMutation = useMutation({
    mutationFn: () => updateOwnProfile({ fullName: fullName.trim() }),
    onSuccess: (result) => {
      updateUser(result.user);
      notify({ message: "Profile updated.", tone: "success" });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: () => changeOwnPassword({ currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      notify({ message: "Password changed.", tone: "success" });
    },
  });

  function saveProfile() {
    if (!fullName.trim() || !hasProfileChanges) return;
    profileMutation.mutate();
  }

  function savePassword() {
    if (passwordError || !currentPassword || !newPassword) return;
    passwordMutation.mutate();
  }

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="My Profile">
      <div className="profile-drawer-content">
        <section className="profile-summary-card">
          <div aria-hidden="true" className="profile-summary-avatar">
            {user?.fullName?.[0]?.toUpperCase() ?? user?.username?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div>
            <strong>{user?.fullName}</strong>
            <span>{user?.email}</span>
          </div>
        </section>

        <section className="profile-section">
          <div className="profile-section-header">
            <UserRound size={17} />
            <div>
              <p className="eyebrow">Profile</p>
              <h3>Personal Details</h3>
            </div>
          </div>
          <FormField
            error={profileMutation.error instanceof Error ? profileMutation.error.message : undefined}
            label="Full name"
            required
          >
            <TextInput
              autoComplete="name"
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Your full name"
              value={fullName}
            />
          </FormField>
          <FormField helperText="Email is managed by an administrator." label="Email">
            <TextInput disabled value={user?.email ?? ""} />
          </FormField>
          <FormField helperText="Username is managed by an administrator." label="Username">
            <TextInput disabled value={user?.username ?? ""} />
          </FormField>
          <Button disabled={!hasProfileChanges || !fullName.trim() || profileMutation.isPending} onClick={saveProfile}>
            <Save size={16} />
            Save Profile
          </Button>
        </section>

        <section className="profile-section">
          <div className="profile-section-header">
            <KeyRound size={17} />
            <div>
              <p className="eyebrow">Security</p>
              <h3>Change Password</h3>
            </div>
          </div>
          <FormField label="Current password" required>
            <TextInput
              autoComplete="current-password"
              onChange={(event) => setCurrentPassword(event.target.value)}
              type="password"
              value={currentPassword}
            />
          </FormField>
          <FormField
            error={passwordMutation.error instanceof Error ? passwordMutation.error.message : passwordError || undefined}
            helperText="Use at least 12 characters with uppercase, lowercase, number, and special character."
            label="New password"
            required
          >
            <TextInput
              autoComplete="new-password"
              onChange={(event) => setNewPassword(event.target.value)}
              type="password"
              value={newPassword}
            />
          </FormField>
          <FormField label="Confirm new password" required>
            <TextInput
              autoComplete="new-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              value={confirmPassword}
            />
          </FormField>
          <Button
            disabled={Boolean(passwordError) || !currentPassword || !newPassword || passwordMutation.isPending}
            onClick={savePassword}
          >
            <KeyRound size={16} />
            Change Password
          </Button>
        </section>
      </div>
    </Drawer>
  );
}
