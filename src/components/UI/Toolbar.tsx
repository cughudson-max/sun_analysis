import React, { useState, useEffect, useRef } from 'react';
import measureIcon from '../../icon/measure.svg';
import measureActiveIcon from '../../icon/measure_active.svg';
import undoIcon from '../../icon/undo.svg';
import redoIcon from '../../icon/redo.svg';
import deleteIcon from '../../icon/delete.svg';
import parallelIcon from '../../icon/Parallel.svg';
import perspectiveIcon from '../../icon/Perspective.svg';
import shadeIcon from '../../icon/shade.svg';
import shadeWithEdgeIcon from '../../icon/shadeWithEdge.svg';
import wireframeIcon from '../../icon/wireframe.svg';

interface ToolbarProps {
    isMeasureActive: boolean;
    isOrtho: boolean;
    displayMode: 'shade' | 'shadeWithEdge' | 'wireframe';
    onMeasureClick: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onClear: () => void;
    onToggleProjection: () => void;
    onChangeDisplayMode: (mode: 'shade' | 'shadeWithEdge' | 'wireframe') => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
    isMeasureActive,
    isOrtho,
    displayMode,
    onMeasureClick,
    onUndo,
    onRedo,
    onClear,
    onToggleProjection,
    onChangeDisplayMode
}) => {
    const [isDisplayMenuOpen, setIsDisplayMenuOpen] = useState(false);
    const displayModeRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!isDisplayMenuOpen) return;
        const handleClick = (event: MouseEvent) => {
            if (!displayModeRef.current) return;
            if (!displayModeRef.current.contains(event.target as Node)) {
                setIsDisplayMenuOpen(false);
            }
        };
        window.addEventListener('mousedown', handleClick);
        return () => {
            window.removeEventListener('mousedown', handleClick);
        };
    }, [isDisplayMenuOpen]);

    const currentDisplayIcon =
        displayMode === 'shade'
            ? shadeIcon
            : displayMode === 'wireframe'
            ? wireframeIcon
            : shadeWithEdgeIcon;

    return (
        <div className="toolbar">
          <div className="toolbar-display-mode" ref={displayModeRef}>
              <button
                  className="toolbar-btn"
                  onClick={() => setIsDisplayMenuOpen((prev) => !prev)}
                  title="Display Mode"
              >
                  <img src={currentDisplayIcon} alt="Display Mode" width={18} height={18} />
              </button>
              {isDisplayMenuOpen && (
                  <div className="toolbar-menu">
                      <button
                          className={`toolbar-menu-item ${displayMode === 'shade' ? 'active' : ''}`}
                          onClick={() => {
                              onChangeDisplayMode('shade');
                              setIsDisplayMenuOpen(false);
                          }}
                          title="Shade"
                      >
                          <img src={shadeIcon} alt="Shade" width={18} height={18} />
                      </button>
                      <button
                          className={`toolbar-menu-item ${displayMode === 'shadeWithEdge' ? 'active' : ''}`}
                          onClick={() => {
                              onChangeDisplayMode('shadeWithEdge');
                              setIsDisplayMenuOpen(false);
                          }}
                          title="Shade With Edge"
                      >
                          <img src={shadeWithEdgeIcon} alt="Shade With Edge" width={18} height={18} />
                      </button>
                      <button
                          className={`toolbar-menu-item ${displayMode === 'wireframe' ? 'active' : ''}`}
                          onClick={() => {
                              onChangeDisplayMode('wireframe');
                              setIsDisplayMenuOpen(false);
                          }}
                          title="Wireframe"
                      >
                          <img src={wireframeIcon} alt="Wireframe" width={18} height={18} />
                      </button>
                  </div>
              )}
          </div>
          <button 
              className={`toolbar-btn ${isMeasureActive ? 'active' : ''}`}
              onClick={onMeasureClick}
              title="Measure Distance (M)"
          >
              <img src={isMeasureActive ? measureActiveIcon : measureIcon} alt="Measure" width={18} height={18} />
          </button>

          <button
              className="toolbar-btn"
              onClick={onUndo}
              title="Undo Measurement"
          >
              <img src={undoIcon} alt="Undo" width={18} height={18} />
          </button>

          <button
              className="toolbar-btn"
              onClick={onRedo}
              title="Redo Measurement"
          >
              <img src={redoIcon} alt="Redo" width={18} height={18} />
          </button>

          <button 
              className={`toolbar-btn ${isOrtho ? 'active' : ''}`}
              onClick={onToggleProjection}
              title="Toggle Projection (Perspective/Parallel)"
          >
              <img
                  src={isOrtho ? parallelIcon : perspectiveIcon}
                  alt={isOrtho ? 'Parallel projection' : 'Perspective projection'}
                  width={18}
                  height={18}
              />
          </button>

          <button
              className="toolbar-btn"
              onClick={onClear}
              title="Clear Measurements"
          >
              <img src={deleteIcon} alt="Clear" width={18} height={18} />
          </button>
      </div>
    );
};
