import type React from "react";
import { memo } from "react";
import { cn } from "../../utils";
import type { Token } from "./syntax/SyntaxHighlighter";
import {
	getFontFamily,
	getFontSize,
	getLineHeight,
	lineToY,
} from "./utils/measurements";

interface HighlightedLineProps {
	lineNumber: number;
	content: string;
	tokens: Token[];
	showLineNumbers?: boolean;
}

const getTokenClassName = (scopes: string[]): string => {
	const classes = [];

	for (const scope of scopes) {
		switch (scope) {
			case "keyword":
				classes.push("text-[var(--syntax-keyword)]");
				break;
			case "string":
				classes.push("text-[var(--syntax-string)]");
				break;
			case "number":
				classes.push("text-[var(--syntax-number)]");
				break;
			case "constant":
				classes.push("text-[var(--syntax-constant)]");
				break;
			case "comment":
				classes.push("text-[var(--syntax-comment)]");
				break;
			case "function":
			case "function-call":
				classes.push("text-[var(--syntax-function)]");
				break;
			case "type":
				classes.push("text-[var(--syntax-type)]");
				break;
			case "property":
				classes.push("text-[var(--syntax-property)]");
				break;
		}
	}

	return cn(...classes);
};

export const HighlightedLine = memo<HighlightedLineProps>(
	({ lineNumber, content, tokens, showLineNumbers = true }) => {
		const y = lineToY(lineNumber);

		// sort tokens by start index
		const sortedTokens = [...tokens].sort(
			(a, b) => a.startIndex - b.startIndex,
		);

		// render tokens with proper styling
		const renderContent = () => {
			if (tokens.length === 0) {
				return <span>{content || " "}</span>;
			}

			// process tokens to handle overlaps properly
			const elements: React.ReactNode[] = [];
			let currentIndex = 0;

			// create a map of character positions to their tokens
			const charToTokens = new Map<number, Token[]>();
			for (const token of sortedTokens) {
				for (let i = token.startIndex; i < token.endIndex; i++) {
					if (!charToTokens.has(i)) {
						charToTokens.set(i, []);
					}
					charToTokens.get(i)!.push(token);
				}
			}

			// render character by character, grouping consecutive chars with same tokens
			while (currentIndex < content.length) {
				const tokensAtIndex = charToTokens.get(currentIndex) || [];
				let endIndex = currentIndex + 1;

				// find consecutive characters with the same tokens
				while (endIndex < content.length) {
					const nextTokens = charToTokens.get(endIndex) || [];
					if (!areTokenArraysEqual(tokensAtIndex, nextTokens)) {
						break;
					}
					endIndex++;
				}

				const text = content.slice(currentIndex, endIndex);
				if (tokensAtIndex.length > 0) {
					// use the most specific (last) token's scopes
					const mostSpecificToken = tokensAtIndex[tokensAtIndex.length - 1];
					elements.push(
						<span
							key={`token-${currentIndex}`}
							className={getTokenClassName(mostSpecificToken.scopes)}
						>
							{text}
						</span>,
					);
				} else {
					elements.push(<span key={`text-${currentIndex}`}>{text}</span>);
				}

				currentIndex = endIndex;
			}

			return elements;
		};

		// helper function to compare token arrays
		const areTokenArraysEqual = (arr1: Token[], arr2: Token[]): boolean => {
			if (arr1.length !== arr2.length) return false;
			return arr1.every((token, index) => token === arr2[index]);
		};

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
					{renderContent()}
				</div>
			</div>
		);
	},
	(prevProps, nextProps) => {
		// re-render if content, line number, or tokens change
		return (
			prevProps.content === nextProps.content &&
			prevProps.lineNumber === nextProps.lineNumber &&
			prevProps.showLineNumbers === nextProps.showLineNumbers &&
			prevProps.tokens.length === nextProps.tokens.length &&
			prevProps.tokens.every((token, index) => {
				const nextToken = nextProps.tokens[index];
				return (
					token.startIndex === nextToken.startIndex &&
					token.endIndex === nextToken.endIndex &&
					token.scopes.length === nextToken.scopes.length &&
					token.scopes.every((scope, i) => scope === nextToken.scopes[i])
				);
			})
		);
	},
);
