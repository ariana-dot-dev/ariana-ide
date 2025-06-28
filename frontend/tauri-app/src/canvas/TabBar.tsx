import type React from "react";
import { cn } from "../utils";
import { useEditorStore } from "./editor/EditorStore";

interface TabBarProps {
	className?: string;
}

export const TabBar: React.FC<TabBarProps> = ({ className }) => {
	const { files, activeFileId, setActiveFile, closeFile } = useEditorStore();
	const fileEntries = Object.entries(files);

	const getFileName = (path: string) => {
		return path.split("/").pop() || path;
	};

	if (fileEntries.length === 0) {
		return (
			<div
				className={cn(
					"flex items-center gap-1 px-4 py-2 bg-[var(--base-500)]/10 border-b border-[var(--acc-600)]/20 text-xs text-[var(--base-300)] min-h-[36px]",
					className,
				)}
			>
				No files open
			</div>
		);
	}

	return (
		<div
			className={cn(
				"flex items-center gap-1 px-2 py-1 bg-[var(--base-500)]/10 border-b border-[var(--acc-600)]/20 min-h-[36px] overflow-x-auto overflow-y-hidden",
				className,
			)}
		>
			{fileEntries.map(([fileId, file]) => (
				<button
					key={fileId}
					onClick={() => setActiveFile(fileId)}
					className={cn(
						"flex items-center gap-2 px-3 py-1 text-sm rounded-t-md transition-colors group whitespace-nowrap",
						activeFileId === fileId
							? "bg-[var(--base-400)]/90 text-[var(--acc-300)]"
							: "bg-[var(--base-500)]/20 text-[var(--base-300)] hover:bg-[var(--base-500)]/40",
					)}
					title={file.name}
				>
					<span className="flex items-center gap-1">
						<span>{getFileName(file.name)}</span>
						{file.isDirty && (
							<span className="w-2 h-2 bg-[var(--acc-500)] rounded-full" />
						)}
					</span>
					<span
						onClick={() => closeFile(fileId)}
						className="opacity-0 group-hover:opacity-100 hover:text-[var(--acc-500)] transition-opacity ml-1"
					>
						×
					</span>
				</button>
			))}
			<div className="ml-auto text-xs text-[var(--base-300)] px-2 flex-shrink-0">
				{fileEntries.length} {fileEntries.length === 1 ? "file" : "files"} open
			</div>
		</div>
	);
};
