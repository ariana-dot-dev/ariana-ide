import { useContext, useEffect, useState } from "react";
import { InterpreterContext } from "./App";
import { cn } from "./utils";
import { useStore } from "./state";

const Repl = () => {
	const { currentInterpreterScript } = useStore();
	const interpreter = useContext(InterpreterContext);
	const [isScriptContainerVisible, setIsScriptContainerVisible] =
		useState(false);
	const [commandInput, setCommandInput] = useState("");

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.ctrlKey && event.shiftKey && event.key === "P") {
				event.preventDefault();
				setIsScriptContainerVisible((prevState) => !prevState);
			}
		};
		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, []);

	if (!isScriptContainerVisible) {
		return null;
	}
	return (
		<div
			id="scriptContainer"
			className={cn(
				"absolute text-[var(--blackest)] left-2 bottom-2 flex flex-col z-10 p-3 rounded-md backdrop-blur-sm font-mono bg-[var(--fg-800)]/10 w-[42ch] min-h-[40ch]",
			)}
		>
			<div className={cn("px-3 py-2 flex-1")}>
				<code className={cn("whitespace-pre-wrap")}>
					{currentInterpreterScript}
				</code>
			</div>
			<div
				className={cn(
					"w-full rounded-md overflow-hidden max-w-full h-fit bg-[var(--fg-800)]/10 flex justify-between",
				)}
			>
				<input
					className={cn("flex-1 px-2 py-2 decoration-0 outline-none")}
					type="text"
					value={commandInput}
					onChange={(e) => setCommandInput(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							try {
								interpreter?.tryRunInstruction(commandInput);
								setCommandInput("");
							} catch (e) {
								alert(e);
							}
						}
					}}
				/>
				<button
					className={cn("px-4 py-1 hover:bg-[var(--fg-600)] cursor-pointer")}
					onClick={() => {
						try {
							interpreter?.tryRunInstruction(commandInput);
							setCommandInput("");
						} catch (e) {
							alert(e);
						}
					}}
				>
					Run
				</button>
			</div>
		</div>
	);
};

export default Repl;
