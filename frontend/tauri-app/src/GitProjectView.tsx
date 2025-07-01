import CanvasView from "./CanvasView";
import { useGitProject } from "./contexts/GitProjectContext";

const GitProjectView: React.FC<{}> = ({ }) => {
	const { selectedGitProject, currentCanvas, updateCanvasElements } = useGitProject();

	console.log(currentCanvas)

	return currentCanvas ? (
		<div className="w-full h-full">
			<CanvasView
                elements={currentCanvas.elements}
                onElementsChange={updateCanvasElements}
            />
		</div>
	) : (<></>);
};

export default GitProjectView;