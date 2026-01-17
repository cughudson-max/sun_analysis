import React from 'react';
import measureIcon from '../../icon/measure.svg';
import measureActiveIcon from '../../icon/measure_active.svg';
import undoIcon from '../../icon/undo.svg';
import redoIcon from '../../icon/redo.svg';
import deleteIcon from '../../icon/delete.svg';
import parallelIcon from '../../icon/Parallel.svg';
import perspectiveIcon from '../../icon/Perspective.svg';

interface ToolbarProps {
    isMeasureActive: boolean;
    isOrtho: boolean;
    onMeasureClick: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onClear: () => void;
    onToggleProjection: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
    isMeasureActive,
    isOrtho,
    onMeasureClick,
    onUndo,
    onRedo,
    onClear,
    onToggleProjection
}) => {
    return (
        <div className="toolbar">
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
