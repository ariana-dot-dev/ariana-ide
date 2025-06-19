import React, { useState } from 'react';
import { ElementTargets, SizeTarget, AreaTarget } from './types';
import { Rectangle } from './Rectangle';

interface ElementOverlayProps {
  element: Rectangle;
  onConfirm: (element: Rectangle, newTargets: ElementTargets) => void;
  onClose: () => void;
}

const ElementOverlay: React.FC<ElementOverlayProps> = ({ element, onConfirm, onClose }) => {
  const currentTargets = element.targets();
  const [aspectRatio, setAspectRatio] = useState(currentTargets.aspectRatio);
  const [size, setSize] = useState(currentTargets.size);
  const [area, setArea] = useState(currentTargets.area);

  const handleConfirm = () => {
    const newTargets: ElementTargets = {
      aspectRatio,
      size,
      area
    };
    onConfirm(element, newTargets);
    onClose();
  };

  const commonAspectRatios = [
    { label: '1:1', value: 1 },
    { label: '4:3', value: 4/3 },
    { label: '16:9', value: 16/9 },
    { label: '3:2', value: 3/2 },
    { label: '2:1', value: 2/1 },
    { label: '1:2', value: 1/2 },
  ];

  const sizeOptions: SizeTarget[] = ['small', 'medium', 'large'];
  const areaOptions: AreaTarget[] = ['center', 'left', 'top', 'right', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right'];

  return (
    <div 
      className="absolute top-0 right-0 bg-gray-900 text-white p-3 rounded-bl-lg shadow-lg z-20 min-w-48"
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={(e) => e.stopPropagation()}
      onMouseLeave={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-medium">Edit Element</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-sm"
          >
            ×
          </button>
        </div>

        <div>
          <label className="block text-xs mb-1">Aspect Ratio</label>
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(parseFloat(e.target.value))}
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs"
          >
            {commonAspectRatios.map(ratio => (
              <option key={ratio.value} value={ratio.value}>
                {ratio.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.1"
            min="0.1"
            max="5"
            value={aspectRatio}
            onChange={(e) => setAspectRatio(parseFloat(e.target.value))}
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs mt-1"
            placeholder="Custom ratio"
          />
        </div>

        <div>
          <label className="block text-xs mb-1">Size</label>
          <select
            value={size}
            onChange={(e) => setSize(e.target.value as SizeTarget)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs"
          >
            {sizeOptions.map(sizeOption => (
              <option key={sizeOption} value={sizeOption}>
                {sizeOption.charAt(0).toUpperCase() + sizeOption.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs mb-1">Preferred Area</label>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value as AreaTarget)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs"
          >
            {areaOptions.map(areaOption => (
              <option key={areaOption} value={areaOption}>
                {areaOption.replace('-', ' ').split(' ').map(word => 
                  word.charAt(0).toUpperCase() + word.slice(1)
                ).join(' ')}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleConfirm}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs"
          >
            Confirm
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-xs"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ElementOverlay;
