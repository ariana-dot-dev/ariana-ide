import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { OsSessionKind } from "../bindings/os";
import { cn } from "../utils";

interface GitSearchResult {
	directories: string[];
	is_complete: boolean;
}

interface ProjectDirectoryListProps {
	osSessionKind: OsSessionKind;
	onSelect: (path: string) => void;
	selectedPath?: string;
}

export function ProjectDirectoryList({ osSessionKind, onSelect, selectedPath }: ProjectDirectoryListProps) {
	const [directories, setDirectories] = useState<string[]>([]);
	const [searchId, setSearchId] = useState<string | null>(null);
	const [isComplete, setIsComplete] = useState(false);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const startSearch = async () => {
			try {
				setLoading(true);
				const id = await invoke<string>("start_git_directories_search", { 
					osSessionKind 
				});
				setSearchId(id);
			} catch (error) {
				console.error("Failed to start git directories search:", error);
				setLoading(false);
			}
		};

		startSearch();
		
		// Reset state when osSessionKind changes
		setDirectories([]);
		setIsComplete(false);
	}, [osSessionKind]);

	useEffect(() => {
		if (!searchId || isComplete) return;

		const pollResults = async () => {
			try {
				const result = await invoke<GitSearchResult>("get_found_git_directories_so_far", {
					searchId
				});
				setDirectories(result.directories);
				setIsComplete(result.is_complete);
				setLoading(false);
			} catch (error) {
				console.error("Failed to get search results:", error);
				setLoading(false);
			}
		};

		// Poll immediately
		pollResults();

		// Set up polling interval
		const interval = setInterval(pollResults, 500);

		return () => clearInterval(interval);
	}, [searchId, isComplete]);

	const getDirectoryName = (path: string): string => {
		return path.split('/').pop() || path.split('\\').pop() || path;
	};

	return (
		<div className="flex flex-col gap-2 p-4 h-fit max-h-full">
			<div className="flex items-center gap-2">
				<h3 className="text-lg font-semibold text-[var(--blackest)]">Repositories</h3>
				{!isComplete && (
					<div className="w-4 h-4 border-2 border-[var(--acc-400)] border-t-transparent rounded-full animate-spin"></div>
				)}
			</div>
			
			{loading && directories.length === 0 ? (
				<div className="flex justify-center p-4">
					<span className="text-[var(--base-500)]">Searching for repositories...</span>
				</div>
			) : directories.length === 0 ? (
				<div className="flex justify-center p-4">
					<span className="text-[var(--base-500)]">No repositories found</span>
				</div>
			) : (
				<div className="flex flex-col gap-1 h-fit max-h-full overflow-y-auto overflow-x-hidden p-1">
					{directories.map((path, index) => (
						<button
							key={index}
							onClick={() => onSelect(path)}
							className={cn(
								"p-3 rounded-md text-left transition-colors",
								"border-2 border-[var(--base-400-50)]",
								selectedPath === path
									? "bg-[var(--acc-400-50)] text-[var(--acc-900)] border-[var(--acc-500-50)]"
									: "bg-[var(--base-200-50)] hover:bg-[var(--base-300-50)] text-[var(--blackest)] cursor-pointer"
							)}
						>
							<div className="mb-0.5">{getDirectoryName(path)}</div>
							<div className="font-mono text-sm opacity-20">{path}</div>
						</button>
					))}
				</div>
			)}
			
			{isComplete && (
				<div className="text-sm text-[var(--base-500)] mt-2">
					Search complete • Found {directories.length} project{directories.length !== 1 ? 's' : ''}
				</div>
			)}
		</div>
	);
}