import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './dialog';

import { AppName, AppDescription } from '@/config';

interface WelcomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFileSelect?: (files: FileList) => void;
  isLoading: boolean;
}

export function WelcomeDialog({
  open,
  onOpenChange,
  isLoading,
}: WelcomeDialogProps) {
  const [bannerDimensions, setBannerDimensions] = useState<{ width: number; height: number } | null>(null);
  const bannerUrl = '/banner.jpg';

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setBannerDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = bannerUrl;
  }, []);

  const handleClose = () => {
    if (!isLoading) {
      onOpenChange(false);
    }
  };

  const getDialogStyle = () => {
    if (!bannerDimensions) return {};
    const maxWidth = 800;
    const maxHeight = 600;
    const aspectRatio = bannerDimensions.width / bannerDimensions.height;

    let width = maxWidth;
    let height = width / aspectRatio;

    if (height > maxHeight) {
      height = maxHeight;
      width = height * aspectRatio;
    }

    return {
      width: `${width}px`,
      maxWidth: '90vw',
      height: `${height}px`,
      maxHeight: '90vh',
    };
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="p-0 overflow-hidden border-0 ring-1"
        style={getDialogStyle()}
      >
        <div
          className="relative w-full h-full flex flex-col"
          style={{
            backgroundImage: `url(${bannerUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 bg-black/10 backdrop-blur-sm" />

          <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-8 text-white text-center">
              <img src="/icon.svg" className="w-24 h-24" alt="logo" />
              <DialogTitle className="text-4xl font-bold text-white drop-shadow-lg">
                {AppName}
              </DialogTitle>
              <DialogDescription className="text-slate-200 text-base -mt-1 drop-shadow">
                {AppDescription}
              </DialogDescription>
              </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
