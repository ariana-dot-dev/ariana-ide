import React, { useState } from 'react';
import Canvas from './canvas/Canvas';
import { Rectangle } from './canvas/Rectangle';
import { SizeTarget, AreaTarget } from './canvas/types';

// Demo elements for testing
const createDemoElements = (): Rectangle[] => {
  return [
    new Rectangle({ size: 'large', aspectRatio: 16/9, area: 'center' }),
  ];
};

const CanvasView: React.FC = () => {
  const [elements, setElements] = useState<Rectangle[]>(() => createDemoElements());
  const [stabilityWeight, setStabilityWeight] = useState(0.3);

  const handleElementsChange = (newElements: Rectangle[]) => {
    setElements(newElements);
  };

  return (
    <div className="absolute top-0 left-0 w-screen h-screen overflow-hidden">
      <Canvas 
        elements={elements} 
        stabilityWeight={stabilityWeight} 
        onElementsChange={handleElementsChange}
      />
    </div>
  );
};

export default CanvasView;