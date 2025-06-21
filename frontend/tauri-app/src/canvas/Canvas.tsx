import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PanInfo } from 'framer-motion';
import { CanvasElement, ElementLayout, ElementTargets } from './types';
import { createGridWorker, WorkerMessage, WorkerResponse } from './gridWorker';
import { Rectangle } from './Rectangle';
import { Terminal, TerminalConfig } from './Terminal';
import RectangleOnCanvas from './RectangleOnCanvas';
import TerminalOnCanvas from './TerminalOnCanvas';
import CustomTerminalOnCanvas from './CustomTerminalOnCanvas';
import { cn } from '../utils';

interface CanvasProps {
  elements: CanvasElement[];
  stabilityWeight?: number;
  onElementsChange: (elements: CanvasElement[]) => void;
}

// Simple string hash function
const simpleHash = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
};

// Generate a stable color based on element ID
const getColorForId = (id: string): string => {
  const hash = simpleHash(id);
  const hue = (hash % 120) + 180; // Blueish colors (180-300)
  const saturation = 60 + (hash % 20); // 60-80%
  const lightness = 50 + (hash % 20); // 50-70%
  return `hsla(${hue}, ${saturation}%, ${lightness}%, 0.3)`;
};

const Canvas: React.FC<CanvasProps> = ({ elements, stabilityWeight = 0.1, onElementsChange }) => {
  const [layouts, setLayouts] = useState<ElementLayout[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [draggedElement, setDraggedElement] = useState<CanvasElement | null>(null);
  const [dragTarget, setDragTarget] = useState<CanvasElement | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const previousLayoutsRef = useRef<ElementLayout[]>([]);

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
        const newWorkerLayouts = event.data.payload.layouts;
        const newLayouts = newWorkerLayouts.map(layout => {
          let element = elements.find(e => e.id === layout.element.id);
          if (!element) return null;
          return {
            element,
            cell: layout.cell,
            score: layout.score,
            previousCell: layout.previousCell
          } satisfies ElementLayout;
        }).filter((l) => l !== null);

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
      const message: WorkerMessage = {
        type: 'OPTIMIZE_GRID',
        payload: {
          elements: elements.map(e => ({
            id: e.id,
            targets: e.targets,
            weight: e.weight,
          })),
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
  }, [elements, canvasSize, stabilityWeight]);

  // Colors are now generated directly in the render based on ID, so this useEffect is no longer needed.

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
        // onElementsChange(newElements);
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

  // Element update handlers
  const handleRectangleUpdate = useCallback((element: Rectangle, newTargets: ElementTargets) => {
    element.updateTargets(newTargets);
    // Trigger re-optimization by updating the elements array
    onElementsChange([...elements]);
  }, [elements, onElementsChange]);

  const handleTerminalUpdate = useCallback((element: Terminal, newConfig: TerminalConfig) => {
    element.updateConfig(newConfig);
    // Trigger re-optimization by updating the elements array
    onElementsChange([...elements]);
  }, [elements, onElementsChange]);

  return (
    <div className={cn("flex w-full h-full p-2")}>
      <div className={cn("relative w-full h-full rounded-md overflow-hidden")}>
        <div
          ref={canvasRef}
          className={cn("absolute top-0 left-0 w-full h-full overflow-hidden m-0 p-0")}
        >
          {layouts.map((layout, index) => {
            if ("rectangle" in layout.element.kind) {
              return (
                <RectangleOnCanvas
                  key={`${layout.element.id}`}
                  layout={layout}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDrag={layout.element === draggedElement ? handleDrag : () => {
                    console.log("No drag")
                  }}
                  onRectangleUpdate={handleRectangleUpdate}
                  isDragTarget={layout.element === dragTarget}
                  isDragging={layout.element === draggedElement}
                />
              );
            } else if ("terminal" in layout.element.kind) {
              return (
                <TerminalOnCanvas
                  key={`${layout.element.id}`}
                  layout={layout}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDrag={layout.element === draggedElement ? handleDrag : () => {
                    console.log("No drag")
                  }}
                  onTerminalUpdate={handleTerminalUpdate}
                  isDragTarget={layout.element === dragTarget}
                  isDragging={layout.element === draggedElement}
                />
              );
            } else if ("customTerminal" in layout.element.kind) {
              return (
                <CustomTerminalOnCanvas
                  key={`${layout.element.id}`}
                  layout={layout}
                  spec={layout.element.kind.customTerminal.spec}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDrag={layout.element === draggedElement ? handleDrag : () => {
                    console.log("No drag")
                  }}
                  isDragTarget={layout.element === dragTarget}
                  isDragging={layout.element === draggedElement}
                />
              );
            }
            return (
              <div key={`${layout.element.id}`}>None: {(JSON.stringify(layout.element))}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Canvas;
