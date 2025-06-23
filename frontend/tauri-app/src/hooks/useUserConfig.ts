import { useState, useEffect } from "react";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { homeDir, join } from "@tauri-apps/api/path";

interface UserConfig {
	email: string;
	token: string;
	expiresAt: string;
}

export function useUserConfig() {
	const [userEmail, setUserEmail] = useState("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		const loadUserConfig = async () => {
			try {
				const homePath = await homeDir();
				const configPath = await join(homePath, ".ariana", "config.json");

				const configContent = await readTextFile(configPath);
				const config: UserConfig = JSON.parse(configContent);

				if (config.email && config.token) {
					const now = new Date();
					const expiry = new Date(config.expiresAt);

					if (now >= expiry) {
						setError(
							"Authentication token has expired. Please run ariana login again.",
						);
					} else {
						setUserEmail(config.email);
					}
				} else {
					setError("Invalid configuration. Missing email or token.");
				}
			} catch (err) {
				console.error("Failed to load user config:", err);
				setError(
					"Failed to load user configuration. Please ensure you are logged in via the CLI.",
				);
			} finally {
				setLoading(false);
			}
		};

		loadUserConfig();
	}, []);

	return { userEmail, loading, error, setUserEmail };
}
