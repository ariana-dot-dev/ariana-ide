import { invoke } from '@tauri-apps/api/core';
import { OsSession, osSessionGetWorkingDirectory } from '../bindings/os';

export class GitService {
	/**
	 * Create a git commit with all changes
	 * @param osSession - The OS session for the git repository
	 * @param message - The commit message
	 * @returns Promise<string> - The commit hash
	 */
	static async createCommit(osSession: OsSession, message: string): Promise<string> {
		const directory = osSessionGetWorkingDirectory(osSession);
		
		try {
			const commitHash = await invoke<string>('git_commit', {
				directory,
				message,
				osSession
			});
			
			console.log(`[GitService] Created commit: ${commitHash} with message: "${message}"`);
			return commitHash;
		} catch (error) {
			console.error('[GitService] Failed to create commit:', error);
			throw new Error(`Failed to create git commit: ${error}`);
		}
	}

	/**
	 * Revert to a specific commit using git reset --hard
	 * @param osSession - The OS session for the git repository
	 * @param commitHash - The commit hash to revert to
	 */
	static async revertToCommit(osSession: OsSession, commitHash: string): Promise<void> {
		const directory = osSessionGetWorkingDirectory(osSession);
		
		try {
			await invoke<void>('git_revert_to_commit', {
				directory,
				commitHash,
				osSession
			});
			
			console.log(`[GitService] Reverted to commit: ${commitHash}`);
		} catch (error) {
			console.error('[GitService] Failed to revert to commit:', error);
			throw new Error(`Failed to revert to commit: ${error}`);
		}
	}
}