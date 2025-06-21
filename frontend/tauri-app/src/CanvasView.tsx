import React, { useState } from 'react';
import Canvas from './canvas/Canvas';
import { Rectangle } from './canvas/Rectangle';
import { Terminal } from './canvas/Terminal';
import { CanvasElement, SizeTarget, AreaTarget } from './canvas/types';

// Demo elements for testing
const createDemoElements = (): CanvasElement[] => {
  return [
    Rectangle.canvasElement({ size: 'large', aspectRatio: 1/1, area: 'center' }, 1),
    Terminal.canvasElement({
        kind: { 
          $type: 'git-bash',
          workingDirectory: 'C:\\Users\\mr003\\riana'
        },
        environment: {},
        shellCommand: '',
        colorScheme: 'default',
        fontSize: 14,
        fontFamily: 'Space Mono'
    }, 1),
    Terminal.canvasElement({
      kind: { 
        $type: 'wsl',
        distribution: 'Ubuntu'
      },
      environment: {},
      shellCommand: '',
      colorScheme: 'default',
      fontSize: 14,
      fontFamily: 'Space Mono'
  }, 1)
    // new Terminal({
    //   kind: {
    //     $type: 'ssh',
    //     host: 'example.com',
    //     username: 'user',
    //     port: 22
    //   }
    // }),
    // new Terminal({
    //   kind: {
    //     $type: 'git-bash',
    //     workingDirectory: 'C:\\Users\\mr003\\riana'
    //   }
    // }),
  ];
};

const CanvasView: React.FC = () => {
  const [elements, setElements] = useState<CanvasElement[]>(() => createDemoElements());
  const [stabilityWeight, setStabilityWeight] = useState(0.3);

  const handleElementsChange = (newElements: CanvasElement[]) => {
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