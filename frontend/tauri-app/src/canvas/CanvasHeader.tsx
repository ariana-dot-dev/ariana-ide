import type React from "react";
import { cn } from "../utils";

interface CanvasHeaderProps {
	title: string;
	icon?: string;
	onRemove: () => void;
	className?: string;
	children?: React.ReactNode;
}

export const CanvasHeader: React.FC<CanvasHeaderProps> = ({
	title,
	icon,
	onRemove,
	className,
	children,
}) => {
	return (
		<div
			className={cn(
				"flex items-center justify-between p-2 border-b border-[var(--acc-600)]/20 bg-[var(--base-500)]/50",
				className,
			)}
		>
			<span className="text-xs font-medium text-[var(--acc-100)]">
				{icon && `${icon} `}
				{title}
			</span>
			<div className="flex items-center gap-2">
				{children}
				<button
					type="button"
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						onRemove();
					}}
					className="text-xs w-6 h-6 bg-[var(--acc-800)] hover:bg-[var(--acc-700)] rounded transition-colors text-[var(--base-white)] flex items-center justify-center"
				>
					×
				</button>
			</div>
		</div>
	);
};
