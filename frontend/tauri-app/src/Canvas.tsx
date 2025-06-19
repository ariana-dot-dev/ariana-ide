import React from 'react';
import Canvas from './canvas/Canvas';
import { Rectangle } from './canvas/Rectangle';

// Demo elements for testing
const createDemoElements = () => {
  return [
    // new Rectangle({ size: 'large', aspectRatio: 16/9, area: 'center' }),
    // new Rectangle({ size: 'medium', aspectRatio: 1, area: 'top-left' }),
    new Rectangle({ size: 'small', aspectRatio: 4/3, area: 'bottom-right' }),
    new Rectangle({ size: 'medium', aspectRatio: 2/1, area: 'left' }),
    new Rectangle({ size: 'small', aspectRatio: 1/2, area: 'top-right' }),
  ];
};

const CanvasView: React.FC = () => {
  const elements = createDemoElements();

  return (
    <div className="absolute top-0 left-0 w-screen h-screen overflow-hidden">
      <Canvas elements={elements} />
    </div>
  );
};

export default CanvasView;