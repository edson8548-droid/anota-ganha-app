import React from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import './ConfirmDialog.css';

export default function ConfirmDialog({ open, title, description, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', onConfirm, onCancel }) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(v) => { if (!v) onCancel?.(); }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="cd-overlay" />
        <AlertDialog.Content className="cd-content">
          <AlertDialog.Title className="cd-title">{title}</AlertDialog.Title>
          {description && (
            <AlertDialog.Description className="cd-desc">{description}</AlertDialog.Description>
          )}
          <div className="cd-actions">
            <AlertDialog.Cancel asChild>
              <button className="cd-btn cd-btn-cancel" onClick={onCancel}>{cancelLabel}</button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button className="cd-btn cd-btn-confirm" onClick={onConfirm}>{confirmLabel}</button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
