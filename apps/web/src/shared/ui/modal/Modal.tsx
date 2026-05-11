import type { MouseEvent, PropsWithChildren } from "react";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

import { IconButton } from "../icon-button/IconButton";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

type ModalProps = PropsWithChildren<{
  isOpen: boolean;
  onClose: () => void;
  size?: "default" | "wide";
  title: string;
}>;

export function Modal({ children, isOpen, onClose, size = "default", title }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const prevFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";

    const raf = requestAnimationFrame(() => {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      focusable?.[0]?.focus();
    });

    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      prevFocus?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="overlay" role="presentation" onClick={handleOverlayClick}>
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={`modal${size === "wide" ? " modal-wide" : ""}`}
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <IconButton aria-label="Close modal" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </header>
        <div>{children}</div>
      </section>
    </div>
  );
}
