import React, { useState } from "react";
import { ElementTargets, SizeTarget, AreaTarget } from "./types";
import { Rectangle } from "./Rectangle";
import { cn } from "../utils";

interface ElementOverlayProps {
	element: Rectangle;
	onConfirm: (element: Rectangle, newTargets: ElementTargets) => void;
	onClose: () => void;
}

const ElementOverlay: React.FC<ElementOverlayProps> = ({
	element,
	onConfirm,
	onClose,
}) => {
	const currentTargets = element.targets();
	const [aspectRatio, setAspectRatio] = useState(currentTargets.aspectRatio);
	const [size, setSize] = useState(currentTargets.size);
	const [area, setArea] = useState(currentTargets.area);

	const handleConfirm = () => {
		const newTargets: ElementTargets = {
			aspectRatio,
			size,
			area,
		};
		onConfirm(element, newTargets);
		onClose();
	};

	const commonAspectRatios = [
		{ label: "1:1", value: 1 },
		{ label: "4:3", value: 4 / 3 },
		{ label: "16:9", value: 16 / 9 },
		{ label: "3:2", value: 3 / 2 },
		{ label: "2:1", value: 2 / 1 },
		{ label: "1:2", value: 1 / 2 },
	];

	const sizeOptions: SizeTarget[] = ["small", "medium", "large"];
	const areaOptions: AreaTarget[] = [
		"center",
		"left",
		"top",
		"right",
		"bottom",
		"top-left",
		"top-right",
		"bottom-left",
		"bottom-right",
	];

	return (
		<div
			className={cn(
				"absolute top-0 right-0 bg-[var(--bg-900)] text-[var(--fg-100)] p-3 rounded-bl-lg shadow-lg z-30 min-w-48",
			)}
			onClick={(e) => e.stopPropagation()}
			onMouseEnter={(e) => e.stopPropagation()}
			onMouseLeave={(e) => e.stopPropagation()}
		>
			<div className={cn("flex flex-col gap-3")}>
				<div className={cn("flex justify-between items-center")}>
					<h3 className={cn("text-sm font-medium")}>Edit Element</h3>
					<button
						onClick={onClose}
						className={cn(
							"text-[var(--bg-400)] hover:text-[var(--fg-100)] text-sm",
						)}
					>
						×
					</button>
				</div>

				<div>
					<label className={cn("block text-xs mb-1")}>Aspect Ratio</label>
					<select
						value={aspectRatio}
						onChange={(e) => setAspectRatio(parseFloat(e.target.value))}
						className={cn(
							"w-full bg-[var(--bg-800)] border border-[var(--bg-600)] rounded px-2 py-1 text-xs",
						)}
					>
						{commonAspectRatios.map((ratio) => (
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
						className={cn(
							"w-full bg-[var(--bg-800)] border border-[var(--bg-600)] rounded px-2 py-1 text-xs mt-1",
						)}
						placeholder="Custom ratio"
					/>
				</div>

				<div>
					<label className={cn("block text-xs mb-1")}>Size</label>
					<select
						value={size}
						onChange={(e) => setSize(e.target.value as SizeTarget)}
						className={cn(
							"w-full bg-[var(--bg-800)] border border-[var(--bg-600)] rounded px-2 py-1 text-xs",
						)}
					>
						{sizeOptions.map((sizeOption) => (
							<option key={sizeOption} value={sizeOption}>
								{sizeOption.charAt(0).toUpperCase() + sizeOption.slice(1)}
							</option>
						))}
					</select>
				</div>

				<div>
					<label className={cn("block text-xs mb-1")}>Preferred Area</label>
					<select
						value={area}
						onChange={(e) => setArea(e.target.value as AreaTarget)}
						className={cn(
							"w-full bg-[var(--bg-800)] border border-[var(--bg-600)] rounded px-2 py-1 text-xs",
						)}
					>
						{areaOptions.map((areaOption) => (
							<option key={areaOption} value={areaOption}>
								{areaOption
									.replace("-", " ")
									.split(" ")
									.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
									.join(" ")}
							</option>
						))}
					</select>
				</div>

				<div className={cn("flex gap-2 pt-2")}>
					<button
						onClick={handleConfirm}
						className={cn(
							"flex-1 bg-[var(--fg-600)] hover:bg-[var(--fg-700)] text-[var(--fg-100)] px-3 py-1 rounded text-xs",
						)}
					>
						Confirm
					</button>
					<button
						onClick={onClose}
						className={cn(
							"flex-1 bg-[var(--bg-600)] hover:bg-[var(--bg-700)] text-[var(--fg-100)] px-3 py-1 rounded text-xs",
						)}
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
};

export default ElementOverlay;
