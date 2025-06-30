import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { OsSessionKind } from "../bindings/os";
import { cn } from "../utils";

interface OsSessionKindSelectorProps {
	onSelect: (kind: OsSessionKind) => void;
	selectedKind?: OsSessionKind;
}

export function OsSessionKindSelector({
	onSelect,
	selectedKind,
}: OsSessionKindSelectorProps) {
	const [availableKinds, setAvailableKinds] = useState<OsSessionKind[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const loadAvailableKinds = async () => {
			try {
				const kinds = await invoke<OsSessionKind[]>(
					"list_available_os_session_kinds",
				);
				setAvailableKinds(kinds);
			} catch (error) {
				console.error("Failed to load available OS session kinds:", error);
			} finally {
				setLoading(false);
			}
		};

		loadAvailableKinds();
	}, []);

	const getKindLabel = (kind: OsSessionKind): string => {
		if (kind === "Local") {
			return "Local";
		}
		if (typeof kind === "object" && "Wsl" in kind) {
			return `WSL: ${kind.Wsl}`;
		}
		return "Unknown";
	};

	const isSelected = (kind: OsSessionKind): boolean => {
		if (!selectedKind) return false;
		if (kind === "Local" && selectedKind === "Local") return true;
		if (
			typeof kind === "object" &&
			typeof selectedKind === "object" &&
			"Wsl" in kind &&
			"Wsl" in selectedKind
		) {
			return kind.Wsl === selectedKind.Wsl;
		}
		return false;
	};

	if (loading) {
		return (
			<div className="flex justify-center p-4">
				<span className="text-[var(--base-500)]">Loading...</span>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2 p-4">
			<div className="flex flex-col gap-1">
				{availableKinds.map((kind, index) => (
					<button
						key={index}
						onClick={() => onSelect(kind)}
						className={cn(
							"p-3 rounded-md text-left transition-colors",
							"border-2 border-[var(--base-400-50)]",
							isSelected(kind)
								? "bg-[var(--acc-400-50)] text-[var(--acc-900)] border-[var(--acc-500-50)]"
								: "bg-[var(--base-200-50)] hover:bg-[var(--base-300-50)] text-[var(--blackest)] cursor-pointer",
						)}
					>
						{getKindLabel(kind)}
					</button>
				))}
			</div>
		</div>
	);
}
