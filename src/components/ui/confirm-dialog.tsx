"use client";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
}

export function ConfirmDialog({
  open, onClose, onConfirm,
  title, description,
  confirmLabel = "확인", cancelLabel = "취소",
  danger = true, loading,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title} maxWidth="max-w-sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-risk-bg flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-safety-high" />
          </div>
          <div>
            {description && <p className="text-body-sm text-text-secondary leading-relaxed">{description}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose}>{cancelLabel}</Button>
          <Button
            size="sm"
            variant={danger ? "danger" : "primary"}
            loading={loading}
            onClick={() => { onConfirm(); onClose(); }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
