import React, { useState } from 'react';
import { motion, PanInfo } from 'framer-motion';
import { CanvasElement, ElementLayout, ElementTargets } from './types';
import { Rectangle } from './Rectangle';
import ElementOverlay from './ElementOverlay';
import { cn } from '../utils';

interface RectangleOnCanvasProps {
  layout: ElementLayout;
  onDragStart: (element: CanvasElement) => void;
  onDragEnd: (element: CanvasElement) => void;
  onDrag: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
  onRectangleUpdate: (element: Rectangle, newTargets: ElementTargets) => void;
  isDragTarget: boolean;
  isDragging: boolean;
}

const RectangleOnCanvas: React.FC<RectangleOnCanvasProps> = ({
  layout,
  onDragStart: propOnDragStart,
  onDragEnd: propOnDragEnd,
  onDrag: propOnDrag,
  onRectangleUpdate,
  isDragTarget,
  isDragging
}) => {
  const { cell, element } = layout;
  const [isHovered, setIsHovered] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [dragging, setDragging] = useState(false);

  if (isDragging) {
    console.log(`RectangleOnCanvas for ${element.id} IS DRAGGING. Received propOnDrag type: ${typeof propOnDrag}`);
  } else if (typeof propOnDrag === 'function' && propOnDrag.toString().includes('handleDrag')) {
    console.warn(`RectangleOnCanvas for ${element.id} NOT DRAGGING but received actual handleDrag function.`);
  }

  const handleDragStartInternal = () => {
    console.log(`INTERNAL handleDragStart for: ${element.id}`);
    propOnDragStart(element);
  };

  const handleDragEndInternal = () => {
    console.log(`INTERNAL handleDragEnd for: ${element.id}`);
    propOnDragEnd(element);
  };

  const handleElementUpdate = (updatedElement: Rectangle, newTargets: ElementTargets) => {
    onRectangleUpdate(updatedElement, newTargets);
  };

  return (
    <motion.div
      className={cn(
        `absolute p-1 cursor-move select-none`,
        isDragging ? 'z-30' : 'z-10'
      )}
      initial={{
        x: cell.x,
        y: cell.y,
        width: cell.width,
        height: cell.height,
      }}
      animate={ !dragging ? {
        x: cell.x,
        y: cell.y,
        width: cell.width,
        height: cell.height,
      } : undefined}
      transition={{
        type: "tween",
        duration: 0.2,
      }}
      layout
      drag
      dragMomentum={false}
      onMouseDown={() => {
        if (!dragging) {
          setDragging(true);
        }
      }}
      onDragStart={() => {
        setDragging(true);
        handleDragStartInternal();
      }}
      onDragEnd={() => {
        setDragging(false);
        handleDragEndInternal();
      }}
      onDrag={(event, info) => {
        console.log(`MOTION.DIV onDrag FIRED for ${element.id}. isDragging: ${isDragging}. Type of propOnDrag: ${typeof propOnDrag}`);
        if (typeof propOnDrag === 'function') {
          propOnDrag(event, info);
        } else {
          console.error(`propOnDrag is NOT a function for ${element.id}! Type: ${typeof propOnDrag}.`);
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
    >
      <div className={cn("w-full h-full flex items-center justify-center rounded-md backdrop-blur-md bg-gradient-to-b from-[var(--fg-900)]/30 to-[var(--bg-600)]/30")}>
      {/* {(isHovered || showOverlay) && !showOverlay && (
        <button
          className={cn("absolute top-1 right-1 w-6 h-6 bg-[var(--fg-800)] text-[var(--bg-white)] rounded text-xs hover:bg-[var(--fg-700)] z-10 border border-[var(--fg-600)]")}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Gear button clicked for', element.id);
            setShowOverlay(true);
          }}
        >
          ⚙
        </button>
      )} */}

      <img src="./assets/app-icon-grad.png" className={cn("select-none")} style={{ width: cell.width/4, }} />
      
      {/* {showOverlay && element instanceof Rectangle && (
        <ElementOverlay
          element={element}
          onConfirm={handleElementUpdate}
          onClose={() => {
            console.log('Closing overlay for', element.id);
            setShowOverlay(false);
          }}
        />
      )} */}
      </div>
    </motion.div>
  );

};

export default RectangleOnCanvas;
