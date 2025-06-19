import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Element, ElementLayout, OptimizationOptions, ElementTargets } from './types';
import { createGridWorker, WorkerMessage, WorkerResponse } from './gridWorker';
import { Rectangle } from './Rectangle';
import RectangleOnCanvas from './RectangleOnCanvas';

interface CanvasProps {
  elements: Rectangle[];
  stabilityWeight?: number;
  onElementsChange: (elements: Rectangle[]) => void;
}

const Canvas: React.FC<CanvasProps> = ({ elements, stabilityWeight = 0.3, onElementsChange }) => {
  const [layouts, setLayouts] = useState<ElementLayout[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [colors, setColors] = useState<string[]>([]);
  const [draggedElement, setDraggedElement] = useState<Rectangle | null>(null);
  const [dragTarget, setDragTarget] = useState<Rectangle | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const previousLayoutsRef = useRef<ElementLayout[]>([]);

  // Generate random colors for rectangles
  const generateColors = useCallback((count: number) => {
    const newColors: string[] = [];
    for (let i = 0; i < count; i++) {
      const hue = 210 + (i * 30) % 120; // Only blueish colors
      newColors.push(`hsla(${hue}, 70%, 60%, 0.5)`);
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
        const newLayouts = event.data.payload.layouts;
        setLayouts(newLayouts);
        previousLayoutsRef.current = newLayouts;
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
          previousLayouts: previousLayoutsRef.current,
          options: { stabilityWeight },
        },
      };
      
      workerRef.current.postMessage(message);
    }
  }, [elements, canvasSize, stabilityWeight]);

  // Update colors when elements change
  useEffect(() => {
    setColors(generateColors(elements.length));
  }, [elements.length, generateColors]);

  // Drag and drop handlers
  const handleDragStart = useCallback((element: Rectangle) => {
    console.log('Canvas handleDragStart called', element);
    setDraggedElement(element);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedElement(null);
    setDragTarget(null);
  }, []);

  const handleDrop = useCallback((targetElement: Rectangle) => {
    console.log('Canvas handleDrop called', { draggedElement, targetElement });
    if (draggedElement && targetElement && draggedElement.id !== targetElement.id) {
      // Swap the elements
      const newElements = [...elements];
      const draggedIndex = newElements.findIndex(el => el.id === draggedElement.id);
      const targetIndex = newElements.findIndex(el => el.id === targetElement.id);

      console.log('Swap indices:', { draggedIndex, targetIndex });

      if (draggedIndex !== -1 && targetIndex !== -1) {
        // Swap elements in array
        [newElements[draggedIndex], newElements[targetIndex]] = [newElements[targetIndex], newElements[draggedIndex]];
        onElementsChange(newElements);
        console.log('Elements swapped successfully');
      }
    }
  }, [draggedElement, elements, onElementsChange]);

  // Set drag target when dragging over
  const handleDragOver = useCallback((targetElement: Rectangle) => {
    if (draggedElement && targetElement.id !== draggedElement.id) {
      setDragTarget(targetElement);
    }
  }, [draggedElement]);

  // Element update handler
  const handleElementUpdate = useCallback((element: Rectangle, newTargets: ElementTargets) => {
    element.updateTargets(newTargets);
    // Trigger re-optimization by updating the elements array
    onElementsChange([...elements]);
  }, [elements, onElementsChange]);

  return (
    <div className="flex w-full h-full p-2">
      <div className="relative w-full h-full rounded-md overflow-hidden">
        <div 
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full overflow-hidden"
          style={{ margin: 0, padding: 0 }}
        >
          {layouts.map((layout, index) => (
            <RectangleOnCanvas
              key={layout.element instanceof Rectangle ? layout.element.id : `rect-${index}`}
              layout={layout}
              color={colors[index] || '#ccc'}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onElementUpdate={handleElementUpdate}
              isDragTarget={layout.element === dragTarget}
              isDragging={layout.element === draggedElement}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Canvas;
