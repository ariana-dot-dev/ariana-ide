import React, { useState } from 'react';
import { motion, PanInfo } from 'framer-motion';
import { CanvasElement, ElementLayout, ElementTargets } from './types';
import { Rectangle } from './Rectangle';
import ElementOverlay from './ElementOverlay';

interface RectangleOnCanvasProps {
  layout: ElementLayout;
  color: string;
  onDragStart: (element: CanvasElement) => void;
  onDragEnd: (element: CanvasElement) => void;
  onDrag: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
  onRectangleUpdate: (element: Rectangle, newTargets: ElementTargets) => void;
  isDragTarget: boolean;
  isDragging: boolean;
}

const RectangleOnCanvas: React.FC<RectangleOnCanvasProps> = ({
  layout,
  color,
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
      className={`absolute p-1 cursor-move select-none ${isDragTarget ? 'ring-2 ring-yellow-400' : ''} ${isDragging ? 'opacity-50' : ''}`}
      initial={{
        x: cell.x,
        y: cell.y,
        width: cell.width,
        height: cell.height,
      }}
      animate={{
        x: cell.x,
        y: cell.y,
        width: cell.width,
        height: cell.height,
      }}
      transition={{
        type: "tween",
        duration: 0.2,
      }}
      layout
      drag
      dragMomentum={false}
      onDragStart={handleDragStartInternal}
      onDragEnd={handleDragEndInternal}
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
      <div style={{
        backgroundColor: color,
      }} className="w-full h-full flex items-center justify-center rounded-md backdrop-blur-md">
      {(isHovered || showOverlay) && !showOverlay && (
        <button
          className="absolute top-1 right-1 w-6 h-6 bg-gray-800 text-white rounded text-xs hover:bg-gray-700 z-10 border border-gray-600"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Gear button clicked for', element.id);
            setShowOverlay(true);
          }}
>
          ⚙
        </button>
      )}

      <img src="./assets/app-icon-grad.png" style={{ width: cell.width/4, }} />
      <div className="absolute bottom-1 left-1 text-xs text-white">ID: {element.id.substring(0,4)}</div>
      
      {showOverlay && element instanceof Rectangle && (
        <ElementOverlay
          element={element}
          onConfirm={handleElementUpdate}
          onClose={() => {
            console.log('Closing overlay for', element.id);
            setShowOverlay(false);
          }}
        />
      )}
      </div>
    </motion.div>
  );

};

export default RectangleOnCanvas;
