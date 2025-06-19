import React, { useState } from 'react';
import Canvas from './canvas/Canvas';
import { Rectangle } from './canvas/Rectangle';
import { SizeTarget, AreaTarget } from './canvas/types';

// Demo elements for testing
const createDemoElements = (): Rectangle[] => {
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

const createRandomElement = (): Rectangle => {
  const sizes: SizeTarget[] = ['small', 'medium', 'large'];
  const areas: AreaTarget[] = ['center', 'left', 'top', 'right', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right'];
  const aspectRatios = [1/2, 2/1, 1/2, 2/1, 1/1];
  
  return new Rectangle({
    size: sizes[Math.floor(Math.random() * sizes.length)],
    aspectRatio: aspectRatios[Math.floor(Math.random() * aspectRatios.length)],
    area: areas[Math.floor(Math.random() * areas.length)]
  });
};

const CanvasView: React.FC = () => {
  const [elements, setElements] = useState<Rectangle[]>(() => createDemoElements());
  const [stabilityWeight, setStabilityWeight] = useState(0.3);

  const addElement = () => {
    setElements(prev => [...prev, createRandomElement()]);
  };

  const removeElement = () => {
    setElements(prev => prev.length > 1 ? prev.slice(0, -1) : prev);
  };

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
      <div className="absolute opacity-0 hover:opacity-100 transition-all top-5 left-5 flex flex-col gap-2 z-10">
        <div className="flex gap-2">
          <button 
            onClick={addElement}
            className="px-4 py-2 bg-green-500/50 backdrop-blur-md text-white rounded hover:bg-green-600/50"
          >
            Add Element
          </button>
          <button 
            onClick={removeElement}
            className="px-4 py-2 bg-red-400/50 backdrop-blur-md text-white rounded hover:bg-red-500/50"
          >
            Remove Element
          </button>
          <div className="px-3 py-2 bg-sky-600/50 backdrop-blur-md text-white rounded">
            {elements.length} elements
          </div>
        </div>
        <div className="flex items-center gap-2 bg-sky-600/50 backdrop-blur-md text-white rounded px-3 py-2">
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