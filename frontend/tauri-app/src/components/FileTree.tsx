import { invoke } from "@tauri-apps/api/core";
import { getIcon } from "material-file-icons";
import type React from "react";
import { useEffect, useState } from "react";

interface FileNode {
	name: string;
	path: string;
	isDirectory: boolean;
	children?: FileNode[] | null;
	extension?: string | null;
}

interface FileTreeProps {
	rootPath: string;
	onFileSelect?: (path: string) => void;
}

const FileTreeItem: React.FC<{
	node: FileNode;
	depth: number;
	onFileSelect?: (path: string) => void;
	onToggle?: (path: string) => void;
	isExpanded?: boolean;
	expandedPaths?: Set<string>;
}> = ({ node, depth, onFileSelect, onToggle, isExpanded, expandedPaths }) => {
	const handleClick = () => {
		if (node.isDirectory) {
			onToggle?.(node.path);
		} else {
			onFileSelect?.(node.path);
		}
	};

	return (
		<div>
			<div
				onClick={handleClick}
				style={{
					paddingLeft: `${depth * 16 + 8}px`,
					paddingRight: "8px",
					paddingTop: "4px",
					paddingBottom: "4px",
					cursor: "pointer",
					display: "flex",
					alignItems: "center",
					gap: "4px",
				}}
				className="file-tree-item"
			>
				{node.isDirectory && (
					<span style={{ width: "12px", display: "inline-block" }}>
						{isExpanded ? "▼" : "▶"}
					</span>
				)}
				{node.isDirectory ? (
					<span>📁</span>
				) : (
					<span
						// biome-ignore lint/security/noDangerouslySetInnerHtml: ive never done this but its working...
						dangerouslySetInnerHTML={{
							__html: getIcon(node.name).svg,
						}}
						style={{
							width: "16px",
							height: "16px",
							display: "inline-block",
							verticalAlign: "middle",
						}}
					/>
				)}
				<span>{node.name}</span>
			</div>
			{isExpanded && node.children && (
				<div>
					{node.children.map((child, index) => (
						<FileTreeItem
							key={`${child.path}-${index}`}
							node={child}
							depth={depth + 1}
							onFileSelect={onFileSelect}
							onToggle={onToggle}
							isExpanded={expandedPaths?.has(child.path) || false}
							expandedPaths={expandedPaths}
						/>
					))}
				</div>
			)}
		</div>
	);
};

export const FileTree: React.FC<FileTreeProps> = ({
	rootPath,
	onFileSelect,
}) => {
	const [files, setFiles] = useState<FileNode[]>([]);
	const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		loadDirectory(rootPath);
	}, [rootPath]);

	const loadDirectory = async (path: string) => {
		try {
			setLoading(true);
			setError(null);
			const result = await invoke<FileNode[]>("get_file_tree", {
				path,
				osSession: { Local: "." },
			});
			setFiles(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load directory");
		} finally {
			setLoading(false);
		}
	};

	const handleToggle = async (path: string) => {
		const newExpanded = new Set(expandedPaths);
		if (newExpanded.has(path)) {
			newExpanded.delete(path);
		} else {
			newExpanded.add(path);

			const updateNodeChildren = async (
				nodes: FileNode[],
			): Promise<FileNode[]> => {
				return Promise.all(
					nodes.map(async (node) => {
						if (node.path === path && node.isDirectory && !node.children) {
							try {
								const children = await invoke<FileNode[]>("get_file_tree", {
									path: node.path,
									osSession: { Local: "." },
								});
								return { ...node, children };
							} catch {
								return node;
							}
						} else if (node.children) {
							return {
								...node,
								children: await updateNodeChildren(node.children),
							};
						}
						return node;
					}),
				);
			};

			const updatedFiles = await updateNodeChildren(files);
			setFiles(updatedFiles);
		}
		setExpandedPaths(newExpanded);
	};

	if (loading) {
		return <div style={{ padding: "16px", color: "white" }}>Loading...</div>;
	}

	if (error) {
		return <div style={{ padding: "16px", color: "red" }}>Error: {error}</div>;
	}

	return (
		<div style={{ fontFamily: "monospace", fontSize: "14px" }}>
			{files.map((file, index) => (
				<FileTreeItem
					key={`${file.path}-${index}`}
					node={file}
					depth={0}
					onFileSelect={onFileSelect}
					onToggle={handleToggle}
					isExpanded={expandedPaths.has(file.path)}
					expandedPaths={expandedPaths}
				/>
			))}
		</div>
	);
};
