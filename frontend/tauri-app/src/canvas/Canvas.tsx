import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Element, ElementLayout } from './types';
import { createGridWorker, WorkerMessage, WorkerResponse } from './gridWorker';
import RectangleOnCanvas from './RectangleOnCanvas';

interface CanvasProps {
  elements: Element[];
}

const Canvas: React.FC<CanvasProps> = ({ elements }) => {
  const [layouts, setLayouts] = useState<ElementLayout[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [colors, setColors] = useState<string[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);

  // Generate random colors for rectangles
  const generateColors = useCallback((count: number) => {
    const newColors: string[] = [];
    for (let i = 0; i < count; i++) {
      const hue = (i * 137.508) % 360; // Golden angle approximation for good color distribution
      newColors.push(`hsl(${hue}, 70%, 60%)`);
    }
    return newColors;
  }, []);

  // Update canvas size when window resizes
  const updateCanvasSize = useCallback(() => {
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setCanvasSize({ width: rect.width, height: rect.height });
    }
  }, []);

  // Initialize worker and resize observer
  useEffect(() => {
    workerRef.current = createGridWorker();
    
    const handleWorkerMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.type === 'GRID_OPTIMIZED') {
        setLayouts(event.data.payload.layouts);
      }
    };

    workerRef.current.onmessage = handleWorkerMessage;

    // Set up resize observer
    const resizeObserver = new ResizeObserver(updateCanvasSize);
    if (canvasRef.current) {
      resizeObserver.observe(canvasRef.current);
    }

    // Initial size update
    updateCanvasSize();

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
      resizeObserver.disconnect();
    };
  }, [updateCanvasSize]);

  // Optimize grid when elements or canvas size changes
  useEffect(() => {
    if (elements.length > 0 && canvasSize.width > 0 && canvasSize.height > 0 && workerRef.current) {
      const message: WorkerMessage = {
        type: 'OPTIMIZE_GRID',
        payload: {
          elements,
          canvasWidth: canvasSize.width,
          canvasHeight: canvasSize.height,
        },
      };
      
      workerRef.current.postMessage(message);
    }
  }, [elements, canvasSize]);

  // Update colors when elements change
  useEffect(() => {
    setColors(generateColors(elements.length));
  }, [elements.length, generateColors]);

  return (
    <div 
      ref={canvasRef}
      className="absolute top-0 left-0 w-full h-full overflow-hidden"
      style={{ margin: 0, padding: 0 }}
    >
      {layouts.map((layout, index) => (
        <RectangleOnCanvas
          key={`rect-${index}`}
          layout={layout}
          color={colors[index] || '#ccc'}
        />
      ))}
    </div>
  );
};

export default Canvas;
