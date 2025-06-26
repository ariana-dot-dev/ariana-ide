import type React from "react";
import { memo } from "react";
import { cn } from "../../utils";
import {
	getFontFamily,
	getFontSize,
	getLineHeight,
	lineToY,
} from "./utils/measurements";

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
				className="absolute left-0"
				style={{
					top: `${y}px`,
					height: `${getLineHeight()}px`,
				}}
			>
				{showLineNumbers && (
					<div
						className={cn("absolute select-none text-gray-500 text-right")}
						style={{
							fontSize: `${getFontSize()}px`,
							fontFamily: getFontFamily(),
							width: "48px", // 3rem
							paddingRight: "16px", // pr-4
						}}
					>
						{lineNumber + 1}
					</div>
				)}
				<div
					className="absolute whitespace-pre"
					style={{
						fontSize: `${getFontSize()}px`,
						fontFamily: getFontFamily(),
						left: showLineNumbers ? "64px" : "0px",
					}}
				>
					{content || " "}
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
