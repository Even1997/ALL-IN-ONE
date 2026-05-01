import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

type MacDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  contentClassName?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export const MacDialog = ({
  open,
  onOpenChange,
  title,
  description,
  contentClassName,
  children,
  footer,
}: MacDialogProps) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="mac-dialog-overlay" />
      <Dialog.Content className={contentClassName ? `mac-dialog-content ${contentClassName}` : 'mac-dialog-content'}>
        <div className="mac-dialog-header">
          <Dialog.Title className="mac-dialog-title">{title}</Dialog.Title>
          {description ? <Dialog.Description className="mac-dialog-description">{description}</Dialog.Description> : null}
        </div>
        <div className="mac-dialog-body">{children}</div>
        {footer ? <div className="mac-dialog-footer">{footer}</div> : null}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);
