import type React from "react";
import { useEffect, useState } from "react";
import { cn } from "../../utils";
import type { Position } from "./Document";
import { useEditorStore } from "./EditorStore";
import { columnToX, getLineHeight, lineToY } from "./utils/measurements";

interface CursorProps {
	position: Position;
	isActive: boolean;
}

export const Cursor: React.FC<CursorProps> = ({ position, isActive }) => {
	const [visible, setVisible] = useState(true);
	const activeFileId = useEditorStore((state) => state.activeFileId);
	const activeFile = useEditorStore((state) => state.files[activeFileId]);
	const lineContent = activeFile?.document.getLine(position.line) || "";

	// blinking animation
	useEffect(() => {
		if (!isActive) {
			setVisible(false);
			return;
		}

		setVisible(true);
		const interval = setInterval(() => {
			setVisible((v) => !v);
		}, 530); // standard cursor blink rate

		return () => clearInterval(interval);
	}, [isActive, position]); // reset blink on position change

	const x = columnToX(position.column, lineContent);
	const y = lineToY(position.line);

	return (
		<div
			className={cn(
				"absolute w-[2px] bg-white transition-all duration-75",
				!visible && "opacity-0",
			)}
			style={{
				left: `${x}px`,
				top: `${y}px`,
				height: `${getLineHeight()}px`,
			}}
		/>
	);
};
