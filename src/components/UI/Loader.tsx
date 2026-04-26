import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoaderProps {
    progress: number;
}

export const Loader: React.FC<LoaderProps> = () => {
    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-background/50 pointer-events-none">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <div className="mt-4 text-sm text-white">模型加载中</div>
        </div>
    );
};
