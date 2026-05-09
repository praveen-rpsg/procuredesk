import type { PropsWithChildren, ReactNode } from "react";

import { Button } from "../button/Button";
import { Modal } from "../modal/Modal";

type ConfirmationDialogProps = PropsWithChildren<{
  confirmLabel?: string;
  description: ReactNode;
  isOpen: boolean;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  tone?: "danger" | "neutral";
}>;

export function ConfirmationDialog({
  confirmLabel = "Confirm",
  description,
  children,
  isOpen,
  isPending = false,
  onCancel,
  onConfirm,
  title,
  tone = "neutral",
}: ConfirmationDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title}>
      <div className="confirmation-dialog">
        <p>{description}</p>
        {children}
        <div className="row-actions">
          <Button className="button-secondary" disabled={isPending} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className={tone === "danger" ? "button-danger" : ""}
            disabled={isPending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
