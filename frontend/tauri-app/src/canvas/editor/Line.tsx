import type React from "react";
import { memo } from "react";
import { cn } from "../../utils";
import { getEditorFont, getLineHeight, lineToY } from "./utils/measurements";

interface LineProps {
	lineNumber: number;
	content: string;
	showLineNumbers?: boolean;
}

export const Line = memo<LineProps>(
	({ lineNumber, content, showLineNumbers = true }) => {
		const y = lineToY(lineNumber);

		return (
			<div
				className="absolute left-0 flex"
				style={{
					top: `${y}px`,
					height: `${getLineHeight()}px`,
					fontFamily: getEditorFont(),
				}}
			>
				{showLineNumbers && (
					<div
						className={cn(
							"select-none text-gray-500 text-right pr-4",
							"min-w-[3rem]",
						)}
						style={{ fontSize: "14px" }}
					>
						{lineNumber + 1}
					</div>
				)}
				<div className="flex-1 whitespace-pre" style={{ fontSize: "14px" }}>
					{content || " "}{" "}
					{/* render space for empty lines to maintain height */}
				</div>
			</div>
		);
	},
	(prevProps, nextProps) => {
		// only re-render if content or line number changes
		return (
			prevProps.content === nextProps.content &&
			prevProps.lineNumber === nextProps.lineNumber &&
			prevProps.showLineNumbers === nextProps.showLineNumbers
		);
	},
);
