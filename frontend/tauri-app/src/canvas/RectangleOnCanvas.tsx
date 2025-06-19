import React from 'react';
import { motion } from 'framer-motion';
import { ElementLayout } from './types';

interface RectangleOnCanvasProps {
  layout: ElementLayout;
  color: string;
}

const RectangleOnCanvas: React.FC<RectangleOnCanvasProps> = ({ layout, color }) => {
  const { cell } = layout;

  return (
    <motion.div
      className="absolute"
      style={{
        backgroundColor: color,
      }}
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
    />
  );
};

export default RectangleOnCanvas;
