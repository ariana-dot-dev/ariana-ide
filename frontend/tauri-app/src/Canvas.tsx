import React, { useState } from 'react';
import Canvas from './canvas/Canvas';
import { Rectangle } from './canvas/Rectangle';
import { SizeTarget, AreaTarget } from './canvas/types';

// Demo elements for testing
const createDemoElements = () => {
  return [
    new Rectangle({ size: 'large', aspectRatio: 16/9, area: 'center' }),
    new Rectangle({ size: 'medium', aspectRatio: 1, area: 'top-left' }),
    new Rectangle({ size: 'small', aspectRatio: 4/3, area: 'bottom-right' }),
    new Rectangle({ size: 'medium', aspectRatio: 2/1, area: 'left' }),
    new Rectangle({ size: 'small', aspectRatio: 1/2, area: 'top-right' }),
    new Rectangle({ size: 'small', aspectRatio: 1, area: 'bottom-left' }),
    new Rectangle({ size: 'large', aspectRatio: 4/3, area: 'bottom' }),
  ];
};

const createRandomElement = () => {
  const sizes: SizeTarget[] = ['small', 'medium', 'large'];
  const areas: AreaTarget[] = ['center', 'left', 'top', 'right', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right'];
  const aspectRatios = [1, 4/3, 16/9, 2/1, 1/2, 3/2];
  
  return new Rectangle({
    size: sizes[Math.floor(Math.random() * sizes.length)],
    aspectRatio: aspectRatios[Math.floor(Math.random() * aspectRatios.length)],
    area: areas[Math.floor(Math.random() * areas.length)]
  });
};

const CanvasView: React.FC = () => {
  const [elements, setElements] = useState(() => createDemoElements());
  const [stabilityWeight, setStabilityWeight] = useState(0.3);

  const addElement = () => {
    setElements(prev => [...prev, createRandomElement()]);
  };

  const removeElement = () => {
    setElements(prev => prev.length > 1 ? prev.slice(0, -1) : prev);
  };

  return (
    <div className="absolute top-0 left-0 w-screen h-screen overflow-hidden">
      <Canvas elements={elements} stabilityWeight={stabilityWeight} />
      <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
        <div className="flex gap-2">
          <button 
            onClick={addElement}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Add Element
          </button>
          <button 
            onClick={removeElement}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Remove Element
          </button>
          <div className="px-3 py-2 bg-gray-800 text-white rounded">
            {elements.length} elements
          </div>
        </div>
        <div className="flex items-center gap-2 bg-gray-800 text-white rounded px-3 py-2">
          <span>Stability:</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={stabilityWeight}
            onChange={(e) => setStabilityWeight(parseFloat(e.target.value))}
            className="w-24"
          />
          <span className="text-sm">{Math.round(stabilityWeight * 100)}%</span>
        </div>
      </div>
    </div>
  );
};

export default CanvasView;