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
import penIcon from '../../icon/pen.svg';
import sectionIcon from '../../icon/section.svg';
import sectionActiveIcon from '../../icon/section_active.svg';
import type { DisplayMode } from '../../hooks/useSettings';

interface ToolbarProps {
    isMeasureActive: boolean;
    isOrtho: boolean;
    displayMode: DisplayMode;
    onMeasureClick: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onClear: () => void;
    onToggleProjection: () => void;
    onChangeDisplayMode: (mode: DisplayMode) => void;
    isClippingActive: boolean;
    onToggleClipping: () => void;
    onFlipClipping: () => void;
    onAlignToAxis: (axis: 'x' | 'y' | 'z') => void;
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
    onChangeDisplayMode,
    isClippingActive,
    onToggleClipping,
    onFlipClipping,
    onAlignToAxis
}) => {
    const [isDisplayMenuOpen, setIsDisplayMenuOpen] = useState(false);
    const displayModeRef = useRef<HTMLDivElement | null>(null);
    const [isClippingMenuOpen, setIsClippingMenuOpen] = useState(false);
    const clippingModeRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const handleClick = (event: MouseEvent) => {
            if (isDisplayMenuOpen && displayModeRef.current && !displayModeRef.current.contains(event.target as Node)) {
                setIsDisplayMenuOpen(false);
            }
            if (isClippingMenuOpen && clippingModeRef.current && !clippingModeRef.current.contains(event.target as Node)) {
                setIsClippingMenuOpen(false);
            }
        };

        if (isDisplayMenuOpen || isClippingMenuOpen) {
            window.addEventListener('mousedown', handleClick);
        }
        return () => {
            window.removeEventListener('mousedown', handleClick);
        };
    }, [isDisplayMenuOpen, isClippingMenuOpen]);

    const normalizedDisplayMode = displayMode === 'wireframe' ? 'edge' : displayMode;
    const currentDisplayIcon =
        normalizedDisplayMode === 'shade'
            ? shadeIcon
            : normalizedDisplayMode === 'shadeWithEdge'
            ? shadeWithEdgeIcon
            : normalizedDisplayMode === 'pen'
            ? penIcon
            : wireframeIcon;

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
                          className={`toolbar-menu-item ${normalizedDisplayMode === 'shadeWithEdge' ? 'active' : ''}`}
                          onClick={() => {
                              onChangeDisplayMode('shadeWithEdge');
                              setIsDisplayMenuOpen(false);
                          }}
                          title="Shade With Edge"
                      >
                          <img src={shadeWithEdgeIcon} alt="Shade With Edge" width={18} height={18} />
                      </button>
                      <button
                          className={`toolbar-menu-item ${normalizedDisplayMode === 'shade' ? 'active' : ''}`}
                          onClick={() => {
                              onChangeDisplayMode('shade');
                              setIsDisplayMenuOpen(false);
                          }}
                          title="Shade"
                      >
                          <img src={shadeIcon} alt="Shade" width={18} height={18} />
                      </button>
                      <button
                          className={`toolbar-menu-item ${normalizedDisplayMode === 'pen' ? 'active' : ''}`}
                          onClick={() => {
                              onChangeDisplayMode('pen');
                              setIsDisplayMenuOpen(false);
                          }}
                          title="Pen"
                      >
                          <img src={penIcon} alt="Pen" width={18} height={18} />
                      </button>
                      <button
                          className={`toolbar-menu-item ${normalizedDisplayMode === 'edge' ? 'active' : ''}`}
                          onClick={() => {
                              onChangeDisplayMode('edge');
                              setIsDisplayMenuOpen(false);
                          }}
                          title="Edge"
                      >
                          <img src={wireframeIcon} alt="Edge" width={18} height={18} />
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

          <div className="toolbar-display-mode" ref={clippingModeRef}>
              <button
                  className={`toolbar-btn ${isClippingActive ? 'active' : ''}`}
                  onClick={() => setIsClippingMenuOpen((prev) => !prev)}
                  title="剖切"
              >
                  <img src={isClippingActive ? sectionActiveIcon : sectionIcon} alt="剖切" width={18} height={18} />
              </button>
              {isClippingMenuOpen && (
                  <div className="toolbar-menu" style={{ width: '120px' }}>
                      <button
                          className={`toolbar-menu-item ${isClippingActive ? 'active' : ''}`}
                          onClick={() => {
                              onToggleClipping();
                          }}
                          title={isClippingActive ? "禁用剖切" : "启用剖切"}
                          style={{ width: '100%', color: '#fff', height: '24px' }}
                      >
                          <span style={{ fontSize: '12px' }}>{isClippingActive ? "禁用" : "启用"}</span>
                      </button>
                      {isClippingActive && (
                          <>
                              <div style={{ height: 1, background: '#eee', margin: '4px 0' }} />
                              <button
                                  className="toolbar-menu-item"
                                  onClick={() => onAlignToAxis('x')}
                                  title="X 轴对齐"
                                  style={{ width: '100%', color: '#fff', height: '24px' }}
                              >
                                  <span style={{ fontSize: '12px' }}>X 轴对齐</span>
                              </button>
                              <button
                                  className="toolbar-menu-item"
                                  onClick={() => onAlignToAxis('y')}
                                  title="Y 轴对齐"
                                  style={{ width: '100%', color: '#fff', height: '24px' }}
                              >
                                  <span style={{ fontSize: '12px' }}>Y 轴对齐</span>
                              </button>
                              <button
                                  className="toolbar-menu-item"
                                  onClick={() => onAlignToAxis('z')}
                                  title="Z 轴对齐"
                                  style={{ width: '100%', color: '#fff', height: '24px' }}
                              >
                                  <span style={{ fontSize: '12px' }}>Z 轴对齐</span>
                              </button>
                              <div style={{ height: 1, background: '#eee', margin: '4px 0' }} />
                              <button
                                  className="toolbar-menu-item"
                                  onClick={onFlipClipping}
                                  title="翻转方向"
                                  style={{ width: '100%', color: '#fff', height: '24px' }}
                              >
                                  <span style={{ fontSize: '12px' }}>翻转方向</span>
                              </button>
                          </>
                      )}
                  </div>
              )}
          </div>

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
