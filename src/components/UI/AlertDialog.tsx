import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './dialog';
import { Button } from './button';
import { Info } from 'lucide-react';

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
}

export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = 'OK',
}: AlertDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle className="pl-4 border-b flex items-center">
          <Info className="mr-2" /><span className="uppercase text-sm font-bold">{title}</span></DialogTitle>
        <DialogDescription className="pl-4">{description}</DialogDescription>
        <DialogFooter className="rounded-ee-sm rounded-es-sm">
          <Button className="h-8 px-4 uppercase" onClick={() => onOpenChange(false)}>{confirmText}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}