import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpinnerProps {
  className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ className }) => {
  return (
    <Loader2 className={cn('w-4 h-4 animate-spin', className)} />
  );
};