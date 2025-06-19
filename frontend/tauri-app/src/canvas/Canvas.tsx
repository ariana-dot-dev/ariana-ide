import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PanInfo } from 'framer-motion';
import { CanvasElement, ElementLayout, OptimizationOptions, ElementTargets } from './types';
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
  const [draggedElement, setDraggedElement] = useState<CanvasElement | null>(null);
  const [dragTarget, setDragTarget] = useState<CanvasElement | null>(null);
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

  function optimizeElements() {
    if (elements.length > 0 && canvasSize.width > 0 && canvasSize.height > 0 && workerRef.current) {
      // Serialize elements for worker - convert methods to data
      const serializedElements = elements.map(element => ({
        weight: element.weight,
        id: element.id,
        targets: element.targets()
      }));

      const message: WorkerMessage = {
        type: 'OPTIMIZE_GRID',
        payload: {
          elements: serializedElements,
          canvasWidth: canvasSize.width,
          canvasHeight: canvasSize.height,
          previousLayouts: previousLayoutsRef.current,
          options: { stabilityWeight },
        },
      };
      
      workerRef.current.postMessage(message);
    }
  }

  // Optimize grid when elements or canvas size changes
  useEffect(() => {
    optimizeElements();
  }, [canvasSize, stabilityWeight]);

  // Update colors when elements change
  useEffect(() => {
    setColors(generateColors(elements.length));
  }, [elements.length, generateColors]);

  // Drag and drop handlers
  const handleDragStart = useCallback((element: CanvasElement) => {
    console.log('Drag start 2:', element);
    setDraggedElement(element);
  }, []);

  const handleDrag = useCallback((event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    console.log('Drag event:', event);
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect || !draggedElement) return;

    const localX = info.point.x - canvasRect.left;
    const localY = info.point.y - canvasRect.top;

    const targetLayout = layouts.find(layout => {
      if (layout.element.id === draggedElement.id) return false; // Can't drop on itself

      const { x, y, width, height } = layout.cell;
      return localX >= x && localX <= x + width && localY >= y && localY <= y + height;
    });

    console.log('Target layout:', targetLayout);

    const newTarget = targetLayout ? targetLayout.element : null;
    if (newTarget?.id !== dragTarget?.id) {
      setDragTarget(newTarget);
    }
  }, [layouts, draggedElement, dragTarget]);

  const handleDragEnd = useCallback(() => {
    console.log('Drag end:', draggedElement, dragTarget, draggedElement?.id, dragTarget?.id);
    if (draggedElement && dragTarget && draggedElement.id !== dragTarget.id) {
      // Swap the elements
      const newElements = [...elements];
      const draggedIndex = newElements.findIndex(el => el.id === draggedElement.id);
      const targetIndex = newElements.findIndex(el => el.id === dragTarget.id);

      if (draggedIndex !== -1 && targetIndex !== -1) {
        console.log('Swapping elements:', draggedElement.id, dragTarget.id);
        [newElements[draggedIndex], newElements[targetIndex]] = [newElements[targetIndex], newElements[draggedIndex]];
        onElementsChange(newElements);
        setLayouts(layouts.map(layout => {
          if (layout.element.id === draggedElement.id) {
            return {
              ...layout,
              element: newElements[draggedIndex]
            };
          } else if (layout.element.id === dragTarget.id) {
            return {
              ...layout,
              element: newElements[targetIndex]
            };
          }
          return layout;
        }));
      }
    }
    setDraggedElement(null);
    setDragTarget(null);
  }, [draggedElement, dragTarget, elements, onElementsChange]);

  // Element update handler
  const handleElementUpdate = useCallback((element: Rectangle, newTargets: ElementTargets) => {
    element.updateTargets(newTargets);
    // Trigger re-optimization by updating the elements array
    onElementsChange([...elements]);
    optimizeElements();
  }, [elements, onElementsChange]);

  const sortedIds = layouts.map(layout => layout.element.id).sort((a, b) => a.localeCompare(b));

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
              key={`${layout.element.id}`}
              layout={layout}
              color={colors[sortedIds.indexOf(layout.element.id)] || '#ccc'}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDrag={layout.element === draggedElement ? handleDrag : () => {
                console.log("No drag")
              }}
              onRectangleUpdate={handleElementUpdate}
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
