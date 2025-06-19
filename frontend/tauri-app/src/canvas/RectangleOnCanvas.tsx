import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ElementLayout, ElementTargets } from './types';
import { Rectangle } from './Rectangle';
import ElementOverlay from './ElementOverlay';

interface RectangleOnCanvasProps {
  layout: ElementLayout;
  color: string;
  onDragStart: (element: Rectangle) => void;
  onDragEnd: (element: Rectangle) => void;
  onDrop: (element: Rectangle) => void;
  onDragOver?: (element: Rectangle) => void;
  onElementUpdate: (element: Rectangle, newTargets: ElementTargets) => void;
  isDragTarget: boolean;
  isDragging: boolean;
}

const RectangleOnCanvas: React.FC<RectangleOnCanvasProps> = ({ 
  layout, 
  color, 
  onDragStart, 
  onDragEnd, 
  onDrop,
  onDragOver,
  onElementUpdate,
  isDragTarget,
  isDragging
}) => {
  const { cell, element } = layout;
  const [isHovered, setIsHovered] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    console.log('Drag start:', element);
    if (element instanceof Rectangle) {
      onDragStart(element);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', element.id);
    }
  };

  const handleDragEnd = () => {
    console.log('Drag end:', element);
    if (element instanceof Rectangle) {
      onDragEnd(element);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (element instanceof Rectangle && onDragOver) {
      onDragOver(element);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Drop on:', element);
    if (element instanceof Rectangle) {
      onDrop(element);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleElementUpdate = (element: Rectangle, newTargets: ElementTargets) => {
    onElementUpdate(element, newTargets);
  };

  return (
    <motion.div
      className={`absolute p-1 cursor-move select-none ${isDragTarget ? 'ring-2 ring-yellow-400' : ''} ${isDragging ? 'opacity-50' : ''}`}
      initial={{ x: 0, y: 0, width: 0, height: 0 }}
      animate={{
        x: cell.x,
        y: cell.y,
        width: cell.width,
        height: cell.height,
      }}
      transition={{
        type: "spring",
        stiffness: 150,
        damping: 20,
        duration: 0.6
      }}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDrop={handleDrop}
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
            console.log('Gear button clicked');
            setShowOverlay(true);
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          ⚙
        </button>
      )}

      <img src="./assets/app-icon-grad.png" style={{ width: cell.width/4, }} />
      
      {showOverlay && element instanceof Rectangle && (
        <ElementOverlay
          element={element}
          onConfirm={handleElementUpdate}
          onClose={() => {
            console.log('Closing overlay');
            setShowOverlay(false);
          }}
        />
      )}
      </div>
    </motion.div>
  );
};

export default RectangleOnCanvas;
