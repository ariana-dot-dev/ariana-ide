import React, { useState, useRef, useEffect } from 'react';
import { BackgroundAgent, BackgroundAgentStatus } from '../types/BackgroundAgent';

interface BackgroundAgentsListProps {
	agents: BackgroundAgent[];
	onRemoveAgent?: (agentId: string) => void;
	onForceRemoveAgent?: (agentId: string) => Promise<void>;
	onSelectAgent?: (agentId: string) => void;
	selectedAgentId?: string | null;
}

const StatusIndicator: React.FC<{ status: BackgroundAgentStatus }> = ({ status }) => {
	const getStatusText = () => {
		switch (status) {
			case 'initializing': return 'Setting up...';
			case 'checking': return 'Checking conflicts...';
			case 'running': return 'Resolving...';
			case 'completed': return 'Completed';
			case 'failed': return 'Failed';
			default: return 'Unknown';
		}
	};

	const getStatusColor = () => {
		switch (status) {
			case 'initializing': return 'text-[var(--acc-600)]';
			case 'checking': return 'text-[var(--acc-600)]';
			case 'running': return 'text-[var(--positive-600)]';
			case 'completed': return 'text-[var(--positive-700)]';
			case 'failed': return 'text-[var(--negative-600)]';
			default: return 'text-[var(--base-500)]';
		}
	};

	return (
		<span className={`text-xs ${getStatusColor()}`}>
			{getStatusText()}
		</span>
	);
};

export const BackgroundAgentsList: React.FC<BackgroundAgentsListProps> = ({ 
	agents, 
	onRemoveAgent,
	onForceRemoveAgent,
	onSelectAgent,
	selectedAgentId
}) => {
	const [contextMenu, setContextMenu] = useState<{x: number, y: number, agentId: string} | null>(null);
	const contextMenuRef = useRef<HTMLDivElement>(null);

	// Handle clicks outside context menu
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
				setContextMenu(null);
			}
		};

		if (contextMenu) {
			document.addEventListener('mousedown', handleClickOutside);
			return () => {
				document.removeEventListener('mousedown', handleClickOutside);
			};
		}
	}, [contextMenu]);

	const handleContextMenu = (e: React.MouseEvent, agentId: string) => {
		e.preventDefault();
		e.stopPropagation();
		setContextMenu({
			x: e.clientX,
			y: e.clientY,
			agentId
		});
	};

	const handleForceDelete = async (agentId: string) => {
		if (onForceRemoveAgent) {
			await onForceRemoveAgent(agentId);
		}
		// If we're deleting the currently selected agent, clear the selection
		if (selectedAgentId === agentId && onSelectAgent) {
			onSelectAgent(null);
		}
		setContextMenu(null);
	};

	if (agents.length === 0) {
		return null;
	}

	return (
		<div className="border-t border-[var(--base-300)] pt-3 mt-3">
			<div className="px-3 mb-2">
				<span className="text-sm text-[var(--base-500-50)]">Background Agents</span>
			</div>
			<div className="flex flex-col">
				{agents.map((agent, index) => (
					<button
						key={agent.id}
						onClick={() => onSelectAgent?.(agent.id)}
						onContextMenu={(e) => handleContextMenu(e, agent.id)}
						className={`group w-full flex flex-col text-left px-4 py-3 text-sm first:rounded-t-xl last:rounded-b-xl transition-colors border-[var(--base-300)] border-2 not-last:border-b-transparent not-first:border-t-transparent ${
							selectedAgentId === agent.id
								? "bg-[var(--acc-200-20)] opacity-100"
								: "even:bg-[var(--base-100-40)] odd:bg-[var(--base-100-80)] cursor-pointer hover:border-solid border-dashed opacity-50 hover:opacity-100 hover:bg-[var(--acc-200-50)]"
						}`}
					>
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<span className="text-[var(--base-600)] capitalize">
									{agent.type} Agent
								</span>
								<StatusIndicator status={agent.status} />
							</div>
							
							<div className="flex items-center gap-1">
								{/* Progress indicator as badge */}
								{agent.status === 'running' && (
									<span className="w-5 aspect-square flex items-center justify-center relative text-[var(--whitest)] rounded-md">
										<div className="absolute top-0 left-0 w-full h-full bg-[var(--acc-400)] animate-spin rounded-lg"></div>
										<div className="z-10 text-xs">⚙️</div>
									</span>
								)}
								{agent.status === 'completed' && (
									<span className="w-5 aspect-square flex items-center justify-center bg-[var(--positive-400)] text-[var(--whitest)] rounded-full text-xs">
										✓
									</span>
								)}
								{agent.status === 'failed' && (
									<span className="w-5 aspect-square flex items-center justify-center bg-[var(--negative-600)] text-[var(--whitest)] rounded-sm text-xs">
										✗
									</span>
								)}

								{/* Remove button */}
								{(agent.status === 'completed' || agent.status === 'failed') && onRemoveAgent && (
									<button
										onClick={(e) => {
											e.stopPropagation();
											onRemoveAgent(agent.id);
										}}
										className="w-5 aspect-square flex items-center justify-center text-xs rounded transition-colors bg-[var(--base-300-20)] text-[var(--base-500)] hover:bg-[var(--negative-300-40)] hover:text-[var(--negative-600)]"
										title="Remove agent"
									>
										✕
									</button>
								)}
							</div>
						</div>

						{agent.progress && (
							<div className="mt-1 text-xs text-[var(--base-500-70)]">
								{agent.progress}
							</div>
						)}

						{agent.errorMessage && (
							<div className="mt-1 text-xs text-[var(--negative-600)] bg-[var(--negative-100-20)] p-1 rounded">
								Error: {agent.errorMessage}
							</div>
						)}
					</button>
				))}
			</div>

			{/* Context Menu */}
			{contextMenu && (
				<div
					ref={contextMenuRef}
					className="fixed z-50 bg-[var(--base-100)] border border-[var(--acc-600)]/20 rounded-md shadow-lg py-1 w-fit flex flex-col"
					style={{
						left: contextMenu.x,
						top: contextMenu.y,
					}}
				>
					<button
						onClick={() => handleForceDelete(contextMenu.agentId)}
						className="w-fit min-w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-[var(--negative-200)] text-[var(--negative-600)] hover:text-[var(--negative-700)] transition-colors"
					>
						🗑️ Force Delete Agent
					</button>
				</div>
			)}
		</div>
	);
};