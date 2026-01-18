import React from 'react';

interface LoaderProps {
    progress: number;
}

export const Loader: React.FC<LoaderProps> = ({ progress }) => {
    return (
        <>
            <div className="loader" title={`Loading: ${progress}%`}></div>
            <div className="loader-text">模型加载中，请稍等...</div>
        </>
    );
};
