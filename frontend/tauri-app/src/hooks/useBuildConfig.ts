import { useState, useEffect } from "react";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { resourceDir, join } from "@tauri-apps/api/path";

interface BuildConfig {
	buildParams: {
		executableName: string;
	};
	runtimeParams: {
		serverUrl: string;
	};
}

export function useBuildConfig() {
	const [buildConfig, setBuildConfig] = useState<BuildConfig | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		const loadBuildConfig = async () => {
			try {
				// Try to read bundled config.json from the app's resource directory
				const resourcePath = await resourceDir();
				const configPath = await join(resourcePath, "config.json");

				const configContent = await readTextFile(configPath);
				const config: BuildConfig = JSON.parse(configContent);

				setBuildConfig(config);
			} catch (err) {
				console.warn("Failed to load build config, using defaults:", err);
				// Set default config if file doesn't exist
				setBuildConfig({
					buildParams: {
						executableName: "ariana-ide"
					},
					runtimeParams: {
						serverUrl: "https://api.ariana.dev"
					}
				});
			} finally {
				setLoading(false);
			}
		};

		loadBuildConfig();
	}, []);

	return { buildConfig, loading, error };
}