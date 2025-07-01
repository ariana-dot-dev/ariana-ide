import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DiffSummary, MainLogicChange, DiffChange, SubLogicPath, GitDiffFile, GitDiffLine, GitBranch, GitCommit, BranchComparison } from "../types/diff";
import { diffService } from "../services/DiffService";
import { cn } from "../utils";

interface DiffManagementProps {
  onClose: () => void;
  initialState?: any;
  onStateChange?: (state: any) => void;
  mainTitlebarVisible?: boolean;
}

export default function DiffManagement({ onClose, initialState, onStateChange, mainTitlebarVisible }: DiffManagementProps) {
  // Add global error logging
  useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      console.error("[COMPONENT] Global error caught:", error.error);
      console.error("[COMPONENT] Error message:", error.message);
      console.error("[COMPONENT] Error filename:", error.filename);
      console.error("[COMPONENT] Error line:", error.lineno);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("[COMPONENT] Unhandled promise rejection:", event.reason);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);
  const [diffSummary, setDiffSummary] = useState<DiffSummary | null>(initialState?.diffSummary ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedChange, setSelectedChange] = useState<string | null>(initialState?.selectedChange ?? null);
  const [selectedSubLogic, setSelectedSubLogic] = useState<string | null>(initialState?.selectedSubLogic ?? null);
  const [viewMode, setViewMode] = useState<'overview' | 'detailed'>(initialState?.viewMode ?? 'overview');
  const [currentFileIndex, setCurrentFileIndex] = useState(initialState?.currentFileIndex ?? 0);
  const [currentLineIndex, setCurrentLineIndex] = useState(initialState?.currentLineIndex ?? 0);
  
  // Branch selection state
  const [showBranchSelection, setShowBranchSelection] = useState(initialState?.showBranchSelection ?? true);
  const [branches, setBranches] = useState<GitBranch[]>(initialState?.branches ?? []);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const [selectedBaseBranch, setSelectedBaseBranch] = useState<string>(initialState?.selectedBaseBranch ?? "");
  const [selectedTargetBranch, setSelectedTargetBranch] = useState<string>(initialState?.selectedTargetBranch ?? "");
  const [selectedBaseCommit, setSelectedBaseCommit] = useState<string>(initialState?.selectedBaseCommit ?? "");
  const [selectedTargetCommit, setSelectedTargetCommit] = useState<string>(initialState?.selectedTargetCommit ?? "");
  const [baseBranchCommits, setBaseBranchCommits] = useState<GitCommit[]>(initialState?.baseBranchCommits ?? []);
  const [targetBranchCommits, setTargetBranchCommits] = useState<GitCommit[]>(initialState?.targetBranchCommits ?? []);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [selectedDirectory, setSelectedDirectory] = useState<string>(initialState?.selectedDirectory ?? "");
  const [showDirectorySelector, setShowDirectorySelector] = useState(initialState?.showDirectorySelector ?? true);
  const [showUnifiedDiff, setShowUnifiedDiff] = useState(false);
  const [unifiedDiffContent, setUnifiedDiffContent] = useState<string>("");
  const [showHeader, setShowHeader] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<{ changeId: string, fileIndex: number, hunkIndex: number, hunk: GitDiffHunk, context: string }[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState<number>(-1);

  // Log state restoration for debugging
  useEffect(() => {
    if (initialState) {
      console.log("DiffManagement initialized with saved state:", initialState);
    }
  }, []);

  // Load commits when base branch changes
  useEffect(() => {
    if (selectedBaseBranch) {
      console.log(`Loading commits for base branch: ${selectedBaseBranch}`);
      loadBranchCommits(selectedBaseBranch, true);
    }
  }, [selectedBaseBranch]);

  // Load commits when target branch changes
  useEffect(() => {
    if (selectedTargetBranch) {
      console.log(`Loading commits for target branch: ${selectedTargetBranch}`);
      loadBranchCommits(selectedTargetBranch, false);
    }
  }, [selectedTargetBranch]);

  // Save state whenever it changes
  useEffect(() => {
    if (onStateChange) {
      const currentState = {
        diffSummary,
        selectedChange,
        selectedSubLogic,
        viewMode,
        currentFileIndex,
        currentLineIndex,
        showBranchSelection,
        branches,
        selectedBaseBranch,
        selectedTargetBranch,
        selectedBaseCommit,
        selectedTargetCommit,
        selectedDirectory,
        showDirectorySelector
      };
      onStateChange(currentState);
    }
  }, [
    diffSummary,
    selectedChange,
    selectedSubLogic,
    viewMode,
    currentFileIndex,
    currentLineIndex,
    showBranchSelection,
    branches,
    selectedBaseBranch,
    selectedTargetBranch,
    selectedBaseCommit,
    selectedTargetCommit,
    selectedDirectory,
    showDirectorySelector,
    onStateChange
  ]);

  const loadBranches = async (directory?: string) => {
    console.log("[COMPONENT] loadBranches method entry");
    try {
      console.log("[COMPONENT] loadBranches called with directory:", directory);
      setBranchesLoading(true);
      setBranchesError(null);
      
      if (directory) {
        console.log("[COMPONENT] Setting working directory:", directory);
        diffService.setWorkingDirectory(directory);
      }
      
      console.log("[COMPONENT] About to call getGitBranches...");
      const gitBranches = await diffService.getGitBranches();
      console.log("[COMPONENT] getGitBranches returned successfully");
      console.log("[COMPONENT] Got branches:", gitBranches.length);
      console.log("[COMPONENT] Branch data:", gitBranches);
      
      console.log("[COMPONENT] Setting branches state...");
      setBranches(gitBranches);
      console.log("[COMPONENT] Branches state set successfully");
      
      // Set default selections - main/master as base, current branch as target
      console.log("[COMPONENT] Finding default branch selections...");
      const mainBranch = gitBranches.find(b => b.name === 'main' || b.name === 'master');
      const currentBranch = gitBranches.find(b => b.isCurrentBranch);
      console.log("[COMPONENT] Main branch found:", mainBranch?.name);
      console.log("[COMPONENT] Current branch found:", currentBranch?.name);
      
      if (mainBranch && currentBranch && mainBranch.name !== currentBranch.name) {
        console.log("[COMPONENT] Setting main as base, current as target");
        setSelectedBaseBranch(mainBranch.name);
        setSelectedTargetBranch(currentBranch.name);
      } else if (gitBranches.length >= 2) {
        console.log("[COMPONENT] Setting first two branches as defaults");
        setSelectedBaseBranch(gitBranches[0].name);
        setSelectedTargetBranch(gitBranches[1].name);
      }
      console.log("[COMPONENT] Default selections complete");
    } catch (err) {
      console.error("[COMPONENT] Error in loadBranches:", err);
      console.error("[COMPONENT] Error stack:", err instanceof Error ? err.stack : "No stack");
      setBranchesError(err instanceof Error ? err.message : "Failed to load branches");
    } finally {
      console.log("[COMPONENT] loadBranches finally block");
      setBranchesLoading(false);
    }
  };

  const loadBranchCommits = async (branchName: string, isBaseBranch: boolean) => {
    if (!branchName) return;
    
    try {
      setLoadingCommits(true);
      const commits = await diffService.getBranchCommits(branchName, 20);
      
      if (isBaseBranch) {
        setBaseBranchCommits(commits);
        setSelectedBaseCommit("");
      } else {
        setTargetBranchCommits(commits);
        setSelectedTargetCommit("");
      }
    } catch (error) {
      console.error(`Failed to load commits for ${branchName}:`, error);
    } finally {
      setLoadingCommits(false);
    }
  };

  const loadDiffData = async (baseBranch?: string, targetBranch?: string, baseCommit?: string, targetCommit?: string) => {
    try {
      setLoading(true);
      setError(null);
      
      let diffText: string;
      
      // Handle special cases for unstaged/staged changes
      if (targetCommit === 'UNSTAGED') {
        diffText = await diffService.getUnstagedChanges();
      } else if (targetCommit === 'STAGED') {
        diffText = await diffService.getStagedChanges();
      } else if (baseCommit === 'UNSTAGED') {
        diffText = await diffService.getUnstagedChanges();
      } else if (baseCommit === 'STAGED') {
        diffText = await diffService.getStagedChanges();
      } else if (baseBranch && targetBranch) {
        diffText = await diffService.getBranchComparison(baseBranch, targetBranch, baseCommit, targetCommit);
      } else {
        diffText = await diffService.getGitDiff();
      }
      
      const parsedFiles = diffService.parseDiff(diffText);
      const summary = diffService.categorizeChanges(parsedFiles);
      setDiffSummary(summary);
      setShowBranchSelection(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load diff data");
    } finally {
      setLoading(false);
    }
  };

  const handleCompareBranches = () => {
    if (selectedBaseBranch && selectedTargetBranch) {
      loadDiffData(selectedBaseBranch, selectedTargetBranch, selectedBaseCommit, selectedTargetCommit);
    }
  };

  const generateUnifiedDiff = async () => {
    try {
      setLoading(true);
      let unifiedDiff: string;
      
      // Check if we're comparing with unstaged or staged changes
      if (selectedTargetCommit === 'UNSTAGED') {
        unifiedDiff = await diffService.getUnstagedChanges();
      } else if (selectedTargetCommit === 'STAGED') {
        unifiedDiff = await diffService.getStagedChanges();
      } else if (selectedBaseCommit === 'UNSTAGED') {
        // If base is unstaged, swap the comparison
        unifiedDiff = await diffService.getUnstagedChanges();
      } else if (selectedBaseCommit === 'STAGED') {
        // If base is staged, swap the comparison  
        unifiedDiff = await diffService.getStagedChanges();
      } else if (selectedBaseBranch && selectedTargetBranch) {
        unifiedDiff = await diffService.getUnifiedDiff(
          selectedBaseBranch, 
          selectedTargetBranch, 
          selectedBaseCommit, 
          selectedTargetCommit
        );
      } else {
        throw new Error("No comparison selected");
      }
      
      setUnifiedDiffContent(unifiedDiff);
      setShowUnifiedDiff(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to generate unified diff");
    } finally {
      setLoading(false);
    }
  };

  const backToBranchSelection = () => {
    setShowBranchSelection(true);
    setDiffSummary(null);
    setError(null);
    setViewMode('overview');
  };

  const handleDirectorySelect = async (directory: string) => {
    console.log("[COMPONENT] handleDirectorySelect called with:", directory);
    setBranchesLoading(true);
    setBranchesError(null);
    
    try {
      // Test basic Tauri invoke first
      console.log("[COMPONENT] Testing basic Tauri invoke...");
      await diffService.testInvoke();
      console.log("[COMPONENT] Basic Tauri invoke successful");
      
      console.log("[COMPONENT] Starting directory validation...");
      // First validate the directory is a git repository
      const isGitRepo = await diffService.checkGitRepository(directory);
      console.log("[COMPONENT] Directory validation result:", isGitRepo);
      
      if (!isGitRepo) {
        console.log("[COMPONENT] Directory is not a git repository");
        setBranchesError("Directory is not a valid git repository. Please select the root directory of a git repository (containing .git folder).");
        setBranchesLoading(false);
        return;
      }
      
      console.log("[COMPONENT] Directory validated, setting state...");
      setSelectedDirectory(directory);
      setShowDirectorySelector(false);
      
      console.log("[COMPONENT] Loading branches...");
      await loadBranches(directory);
      console.log("[COMPONENT] Branches loaded successfully");
    } catch (error) {
      console.error("[COMPONENT] Error in handleDirectorySelect:", error);
      console.error("[COMPONENT] Error stack:", error instanceof Error ? error.stack : "No stack");
      setBranchesError(error instanceof Error ? error.message : "Failed to validate directory");
      setBranchesLoading(false);
    }
  };

  const backToDirectorySelection = () => {
    setShowDirectorySelector(true);
    setBranches([]);
    setSelectedBaseBranch("");
    setSelectedTargetBranch("");
    setBranchesError(null);
  };

  const validateChange = async (changeId: string) => {
    if (!diffSummary) return;

    try {
      const updatedSummary = { ...diffSummary };
      
      // Find the change to validate
      const mainChange = updatedSummary.mainLogicChanges.find(c => c.id === changeId);
      const smallChange = updatedSummary.smallChanges.find(c => c.id === changeId);
      const change = mainChange || smallChange;
      
      if (change) {
        // Get file paths from the change
        const filePaths = change.files.map(file => file.filePath);
        
        // Add files to git
        await diffService.addFilesToGit(filePaths);
        console.log(`[VALIDATE] Successfully added files to git for change ${changeId}:`, filePaths);
        
        // Mark as validated
        change.validated = true;
        
        // Mark all subLogicPaths as validated if they exist
        if (change.subLogicPaths) {
          change.subLogicPaths.forEach(subPath => {
            subPath.validated = true;
          });
        }
      }

      // Check if all changes are validated
      const allValidated = [...updatedSummary.mainLogicChanges, ...updatedSummary.smallChanges]
        .every(change => change.validated);
      
      updatedSummary.validationState.allValidated = allValidated;
      setDiffSummary(updatedSummary);
    } catch (error) {
      console.error("Failed to validate change:", error);
      setError(`Failed to validate change: ${error}`);
    }
  };

  const validateAllChanges = async () => {
    if (!diffSummary) return;

    try {
      const updatedSummary = { ...diffSummary };
      
      // Collect all file paths from all changes
      const allFilePaths: string[] = [];
      [...updatedSummary.mainLogicChanges, ...updatedSummary.smallChanges].forEach(change => {
        change.files.forEach(file => {
          if (!allFilePaths.includes(file.filePath)) {
            allFilePaths.push(file.filePath);
          }
        });
      });
      
      // Add all files to git
      await diffService.addFilesToGit(allFilePaths);
      console.log(`[VALIDATE_ALL] Successfully added all files to git:`, allFilePaths);
      
      // Mark all changes as validated
      updatedSummary.mainLogicChanges.forEach(change => {
        change.validated = true;
        if (change.subLogicPaths) {
          change.subLogicPaths.forEach(subPath => {
            subPath.validated = true;
          });
        }
      });
      updatedSummary.smallChanges.forEach(change => {
        change.validated = true;
        if (change.subLogicPaths) {
          change.subLogicPaths.forEach(subPath => {
            subPath.validated = true;
          });
        }
      });
      updatedSummary.validationState.allValidated = true;
      
      setDiffSummary(updatedSummary);
    } catch (error) {
      console.error("Failed to validate all changes:", error);
      setError(`Failed to validate all changes: ${error}`);
    }
  };

  const enterDetailedView = (changeId: string) => {
    setSelectedChange(changeId);
    setViewMode('detailed');
    setCurrentFileIndex(0);
    setCurrentLineIndex(0);
  };

  const selectSubLogic = (subLogicId: string) => {
    console.log("selectSubLogic called with:", subLogicId, "currently selected:", selectedSubLogic);
    
    // Extract hunk index from block ID (format: "hunk-{index}")
    const hunkIndexMatch = subLogicId.match(/hunk-(\d+)/);
    if (hunkIndexMatch) {
      const hunkIndex = parseInt(hunkIndexMatch[1]);
      console.log("Navigating to hunk index:", hunkIndex);
      
      // Find the change that contains this sublogic path
      const parentChange = [...(diffSummary?.mainLogicChanges ?? []), ...(diffSummary?.smallChanges ?? [])].find(change => 
        change.subLogicPaths?.some(path => path.id === subLogicId)
      );
      
      if (parentChange) {
        console.log("Found parent change:", parentChange.id);
        // Switch to detailed view with the correct change and hunk
        setSelectedChange(parentChange.id);
        setViewMode('detailed');
        setCurrentFileIndex(0); // Assume first file for now
        setCurrentLineIndex(hunkIndex);
      }
    }
    
    const newSelection = selectedSubLogic === subLogicId ? null : subLogicId;
    console.log("Setting selectedSubLogic to:", newSelection);
    setSelectedSubLogic(newSelection);
  };

  const searchHunks = (query: string) => {
    if (!diffSummary || !query.trim()) {
      setSearchResults([]);
      setCurrentSearchIndex(-1);
      return;
    }

    const results: { changeId: string, fileIndex: number, hunkIndex: number, hunk: GitDiffHunk, context: string }[] = [];
    const allChanges = [...diffSummary.mainLogicChanges, ...diffSummary.smallChanges];

    allChanges.forEach(change => {
      change.files.forEach((file, fileIndex) => {
        file.hunks.forEach((hunk, hunkIndex) => {
          // Search in hunk lines
          const matchingLines = hunk.lines.filter(line => 
            line.content.toLowerCase().includes(query.toLowerCase())
          );
          
          if (matchingLines.length > 0) {
            const context = `${file.filePath} - ${matchingLines.length} match${matchingLines.length > 1 ? 'es' : ''}`;
            results.push({
              changeId: change.id,
              fileIndex,
              hunkIndex,
              hunk,
              context
            });
          }
        });
      });
    });

    setSearchResults(results);
    setCurrentSearchIndex(results.length > 0 ? 0 : -1);
  };

  const navigateToSearchResult = (index: number) => {
    if (index < 0 || index >= searchResults.length) return;
    
    const result = searchResults[index];
    setSelectedChange(result.changeId);
    setViewMode('detailed');
    setCurrentFileIndex(result.fileIndex);
    setCurrentLineIndex(result.hunkIndex);
    setCurrentSearchIndex(index);
  };

  const nextSearchResult = () => {
    if (searchResults.length === 0) return;
    const nextIndex = (currentSearchIndex + 1) % searchResults.length;
    navigateToSearchResult(nextIndex);
  };

  const previousSearchResult = () => {
    if (searchResults.length === 0) return;
    const prevIndex = currentSearchIndex <= 0 ? searchResults.length - 1 : currentSearchIndex - 1;
    navigateToSearchResult(prevIndex);
  };

  const navigateToNextChange = () => {
    if (!diffSummary || !selectedChange) return;
    
    const allChanges = [...diffSummary.mainLogicChanges, ...diffSummary.smallChanges];
    const currentIndex = allChanges.findIndex(c => c.id === selectedChange);
    const nextIndex = (currentIndex + 1) % allChanges.length;
    
    setSelectedChange(allChanges[nextIndex].id);
    setCurrentFileIndex(0);
    setCurrentLineIndex(0);
  };

  const navigateToNextFile = () => {
    if (!diffSummary || !selectedChange) return;
    
    // Get all files from all changes
    const allChanges = [...diffSummary.mainLogicChanges, ...diffSummary.smallChanges];
    const allFiles: { changeId: string, fileIndex: number, file: GitDiffFile }[] = [];
    
    // Build a flat list of all files with their change and file indices
    allChanges.forEach(change => {
      change.files.forEach((file, fileIndex) => {
        allFiles.push({ changeId: change.id, fileIndex, file });
      });
    });
    
    // Find current file position in the flat list
    const currentGlobalIndex = allFiles.findIndex(item => 
      item.changeId === selectedChange && item.fileIndex === currentFileIndex
    );
    
    // Navigate to next file
    if (currentGlobalIndex < allFiles.length - 1) {
      const nextFile = allFiles[currentGlobalIndex + 1];
      setSelectedChange(nextFile.changeId);
      setCurrentFileIndex(nextFile.fileIndex);
      setCurrentLineIndex(0);
    }
  };

  const navigateToPreviousFile = (): boolean => {
    if (!diffSummary || !selectedChange) return false;
    
    // Get all files from all changes
    const allChanges = [...diffSummary.mainLogicChanges, ...diffSummary.smallChanges];
    const allFiles: { changeId: string, fileIndex: number, file: GitDiffFile }[] = [];
    
    // Build a flat list of all files with their change and file indices
    allChanges.forEach(change => {
      change.files.forEach((file, fileIndex) => {
        allFiles.push({ changeId: change.id, fileIndex, file });
      });
    });
    
    // Find current file position in the flat list
    const currentGlobalIndex = allFiles.findIndex(item => 
      item.changeId === selectedChange && item.fileIndex === currentFileIndex
    );
    
    // Navigate to previous file
    if (currentGlobalIndex > 0) {
      const prevFile = allFiles[currentGlobalIndex - 1];
      setSelectedChange(prevFile.changeId);
      setCurrentFileIndex(prevFile.fileIndex);
      setCurrentLineIndex(0);
      return true;
    }
    return false;
  };

  const navigateToPreviousChange = () => {
    if (!diffSummary || !selectedChange) return;
    
    const allChanges = [...diffSummary.mainLogicChanges, ...diffSummary.smallChanges];
    const currentIndex = allChanges.findIndex(c => c.id === selectedChange);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : allChanges.length - 1;
    
    setSelectedChange(allChanges[prevIndex].id);
    setCurrentFileIndex(0);
    setCurrentLineIndex(0);
  };

  const navigateToNextHunk = () => {
    if (!diffSummary || !selectedChange) return;
    
    const change = [...diffSummary.mainLogicChanges, ...diffSummary.smallChanges]
      .find(c => c.id === selectedChange);
    
    if (change && change.files[currentFileIndex]) {
      const currentFile = change.files[currentFileIndex];
      console.log(`[HUNK_NAV] Current hunk index: ${currentLineIndex}, Total hunks: ${currentFile.hunks.length}`);
      if (currentLineIndex < currentFile.hunks.length - 1) {
        const newIndex = currentLineIndex + 1;
        console.log(`[HUNK_NAV] Moving to next hunk: ${newIndex}`);
        setCurrentLineIndex(newIndex);
      } else {
        console.log(`[HUNK_NAV] At last hunk, attempting to navigate to next file`);
        // At last hunk of current file, try to navigate to next file
        navigateToNextFile();
      }
    }
  };

  const navigateToPreviousHunk = () => {
    console.log(`[HUNK_NAV] Current hunk index: ${currentLineIndex}`);
    if (currentLineIndex > 0) {
      const newIndex = currentLineIndex - 1;
      console.log(`[HUNK_NAV] Moving to previous hunk: ${newIndex}`);
      setCurrentLineIndex(newIndex);
    } else {
      console.log(`[HUNK_NAV] At first hunk, attempting to navigate to previous file`);
      // At first hunk of current file, try to navigate to previous file
      const prevFileResult = navigateToPreviousFile();
      // If we successfully moved to previous file, go to its last hunk
      if (prevFileResult) {
        setTimeout(() => {
          if (!diffSummary || !selectedChange) return;
          const change = [...diffSummary.mainLogicChanges, ...diffSummary.smallChanges]
            .find(c => c.id === selectedChange);
          if (change && change.files[currentFileIndex]) {
            const newFile = change.files[currentFileIndex];
            setCurrentLineIndex(Math.max(0, newFile.hunks.length - 1));
          }
        }, 0);
      }
    }
  };

  const getCurrentFile = (): GitDiffFile | null => {
    if (!diffSummary || !selectedChange) return null;
    
    const change = [...diffSummary.mainLogicChanges, ...diffSummary.smallChanges]
      .find(c => c.id === selectedChange);
    
    return change?.files[currentFileIndex] || null;
  };

  // Show directory selection first
  if (showBranchSelection && showDirectorySelector) {
    return (
      <DirectorySelectionPage
        selectedDirectory={selectedDirectory}
        onDirectorySelect={handleDirectorySelect}
        onClose={onClose}
        loading={branchesLoading}
        error={branchesError}
      />
    );
  }

  // Show branch selection landing page
  if (showBranchSelection) {
    return (
      <BranchSelectionPage
        branches={branches}
        loading={branchesLoading}
        error={branchesError}
        selectedBaseBranch={selectedBaseBranch}
        selectedTargetBranch={selectedTargetBranch}
        selectedBaseCommit={selectedBaseCommit}
        selectedTargetCommit={selectedTargetCommit}
        baseBranchCommits={baseBranchCommits}
        targetBranchCommits={targetBranchCommits}
        loadingCommits={loadingCommits}
        selectedDirectory={selectedDirectory}
        onBaseBranchChange={(branch) => {
          setSelectedBaseBranch(branch);
          if (branch) loadBranchCommits(branch, true);
        }}
        onTargetBranchChange={(branch) => {
          setSelectedTargetBranch(branch);
          if (branch) loadBranchCommits(branch, false);
        }}
        onBaseCommitChange={setSelectedBaseCommit}
        onTargetCommitChange={setSelectedTargetCommit}
        onCompare={handleCompareBranches}
        onClose={onClose}
        onRetry={() => loadBranches(selectedDirectory)}
        onBackToDirectory={backToDirectorySelection}
        isComparing={loading}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--acc-500)] mx-auto mb-4"></div>
          <p className="text-[var(--base-600)]">Loading diff data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-[var(--base-700)] mb-2">Error Loading Diff</h2>
          <p className="text-[var(--base-600)] mb-4">{error}</p>
          <button
            onClick={() => loadDiffData()}
            className="px-4 py-2 bg-[var(--acc-500)] text-white rounded-lg hover:bg-[var(--acc-600)] transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!diffSummary) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-[var(--base-600)]">No diff data available</p>
      </div>
    );
  }

  // Handle case where there are no changes
  if (diffSummary.totalFiles === 0) {
    return (
      <div className="flex-1 flex flex-col h-full bg-[var(--base-100)] relative">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--base-300)]">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-[var(--acc-600)]">Diff Management</h1>
          </div>
          
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[var(--base-400)] text-[var(--base-700)] rounded-lg hover:bg-[var(--base-500)] transition-colors"
          >
            Close
          </button>
        </div>

        {/* No changes content */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-xl font-semibold text-[var(--base-700)] mb-2">No Changes Found</h2>
            <p className="text-[var(--base-600)] mb-4">
              Your working directory is clean - there are no uncommitted changes to review.
            </p>
            <button
              onClick={() => loadDiffData()}
              className="px-4 py-2 bg-[var(--acc-500)] text-white rounded-lg hover:bg-[var(--acc-600)] transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--base-100)] relative">
      {/* Header */}
      <div 
        className={cn(
          "flex items-center justify-between border-b border-[var(--base-300)] transition-all duration-300 relative",
          (showHeader || mainTitlebarVisible) ? "p-4 h-auto opacity-100" : "p-1 h-8 opacity-0",
          mainTitlebarVisible && "mt-12"
        )}
        onMouseEnter={() => setShowHeader(true)}
        onMouseLeave={() => setShowHeader(false)}
      >
        {/* Invisible hover trigger area extending 20px below header */}
        <div 
          className="absolute -bottom-5 left-0 right-0 h-9 bg-transparent cursor-pointer"
          onMouseEnter={() => setShowHeader(true)}
        />
        {(showHeader || mainTitlebarVisible) && (
          <>
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-[var(--acc-600)]">Diff Management</h1>
              <div className="flex items-center space-x-2 text-sm text-[var(--base-600)]">
                <span>{diffSummary.totalFiles} files</span>
                <span className="text-green-500">+{diffSummary.totalAdditions}</span>
                <span className="text-red-500">-{diffSummary.totalDeletions}</span>
              </div>
            </div>

            
            <div className="flex items-center space-x-2">
              <button
                onClick={backToBranchSelection}
                className="px-3 py-1 bg-[var(--base-200)] text-[var(--base-700)] rounded hover:bg-[var(--base-300)] transition-colors"
              >
                ← Change Branches
              </button>
              
              <button
                onClick={() => setViewMode(viewMode === 'overview' ? 'detailed' : 'overview')}
                className="px-3 py-1 bg-[var(--base-200)] text-[var(--base-700)] rounded hover:bg-[var(--base-300)] transition-colors"
              >
                {viewMode === 'overview' ? 'Detailed View' : 'Overview'}
              </button>
              
              <button
                onClick={generateUnifiedDiff}
                className="px-4 py-2 bg-[var(--base-400)] text-[var(--base-700)] rounded-lg hover:bg-[var(--base-500)] transition-colors"
              >
                View Unified Diff
              </button>
              
              <button
                onClick={validateAllChanges}
                disabled={diffSummary.validationState.allValidated}
                className={cn(
                  "px-4 py-2 rounded-lg font-medium transition-colors",
                  diffSummary.validationState.allValidated
                    ? "bg-green-500 text-white"
                    : "bg-[var(--acc-500)] text-white hover:bg-[var(--acc-600)]"
                )}
              >
                {diffSummary.validationState.allValidated ? "✓ All Validated" : "Validate All"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Unified Diff Modal */}
      {showUnifiedDiff && (
        <UnifiedDiffModal
          content={unifiedDiffContent}
          onClose={() => setShowUnifiedDiff(false)}
          baseBranch={selectedBaseBranch}
          targetBranch={selectedTargetBranch}
          baseCommit={selectedBaseCommit}
          targetCommit={selectedTargetCommit}
        />
      )}

      {/* Content */}
      {viewMode === 'overview' ? (
        <OverviewMode
          diffSummary={diffSummary}
          onValidateChange={validateChange}
          onEnterDetailed={enterDetailedView}
          onSelectSubLogic={selectSubLogic}
          selectedSubLogic={selectedSubLogic}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />
      ) : (
        <DetailedMode
          diffSummary={diffSummary}
          selectedChange={selectedChange}
          currentFile={getCurrentFile()}
          currentFileIndex={currentFileIndex}
          currentLineIndex={currentLineIndex}
          onValidateChange={validateChange}
          onNextChange={navigateToNextChange}
          onPreviousChange={navigateToPreviousChange}
          onNextFile={navigateToNextFile}
          onPreviousFile={navigateToPreviousFile}
          onNextHunk={navigateToNextHunk}
          onPreviousHunk={navigateToPreviousHunk}
          onBackToOverview={() => setViewMode('overview')}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchResults={searchResults}
          currentSearchIndex={currentSearchIndex}
          searchHunks={searchHunks}
          nextSearchResult={nextSearchResult}
          previousSearchResult={previousSearchResult}
        />
      )}
    </div>
  );
}

// Overview Mode Component
interface OverviewModeProps {
  diffSummary: DiffSummary;
  onValidateChange: (changeId: string) => void;
  onEnterDetailed: (changeId: string) => void;
  onSelectSubLogic: (subLogicId: string) => void;
  selectedSubLogic: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

function OverviewMode({ 
  diffSummary, 
  onValidateChange, 
  onEnterDetailed, 
  onSelectSubLogic, 
  selectedSubLogic,
  searchQuery,
  setSearchQuery
}: OverviewModeProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter changes based on search query
  const filterChanges = (changes: (MainLogicChange | DiffChange)[]) => {
    if (!searchQuery.trim()) return changes;
    
    return changes.filter(change => {
      // Search in file names
      const fileMatches = change.files.some(file => 
        file.filePath.toLowerCase().includes(searchQuery.toLowerCase())
      );
      
      // Search in file content (hunks)
      const contentMatches = change.files.some(file =>
        file.hunks.some(hunk =>
          hunk.lines.some(line =>
            line.content.toLowerCase().includes(searchQuery.toLowerCase())
          )
        )
      );
      
      return fileMatches || contentMatches;
    });
  };

  const filteredMainChanges = filterChanges(diffSummary.mainLogicChanges);
  const filteredSmallChanges = filterChanges(diffSummary.smallChanges);

  // Add keyboard shortcut for Cmd/Ctrl+F
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Search Bar */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[var(--acc-600)]">Overview</h1>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search files and content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-3 py-2 border border-[var(--base-300)] rounded text-sm w-64 focus:outline-none focus:border-[var(--acc-500)]"
              />
              {searchQuery && (
                <div className="absolute right-8 top-1/2 transform -translate-y-1/2 text-xs text-[var(--base-600)]">
                  {filteredMainChanges.length + filteredSmallChanges.length} result{filteredMainChanges.length + filteredSmallChanges.length !== 1 ? 's' : ''}
                </div>
              )}
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-[var(--base-500)] hover:text-[var(--base-700)]"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
        {/* Main Logic Changes */}
        {filteredMainChanges.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-[var(--acc-600)]">
              Main Logic Changes 
              {searchQuery && (
                <span className="text-sm font-normal text-[var(--base-600)]">
                  ({filteredMainChanges.length} of {diffSummary.mainLogicChanges.length})
                </span>
              )}
            </h2>
            {filteredMainChanges.map((change) => (
              <MainLogicChangeCard
                key={change.id}
                change={change as MainLogicChange}
                onValidate={() => onValidateChange(change.id)}
                onEnterDetailed={() => onEnterDetailed(change.id)}
                onSelectSubLogic={onSelectSubLogic}
                selectedSubLogic={selectedSubLogic}
                searchQuery={searchQuery}
              />
            ))}
          </div>
        )}

        {/* Small Changes */}
        {filteredSmallChanges.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-[var(--acc-600)]">
              Small Changes
              {searchQuery && (
                <span className="text-sm font-normal text-[var(--base-600)]">
                  ({filteredSmallChanges.length} of {diffSummary.smallChanges.length})
                </span>
              )}
            </h2>
            {filteredSmallChanges.map((change) => (
              <SmallChangeCard
                key={change.id}
                change={change}
                onValidate={() => onValidateChange(change.id)}
                onEnterDetailed={() => onEnterDetailed(change.id)}
                onSelectSubLogic={onSelectSubLogic}
                selectedSubLogic={selectedSubLogic}
                searchQuery={searchQuery}
              />
            ))}
          </div>
        )}
        
        {/* No Results Message */}
        {searchQuery && filteredMainChanges.length === 0 && filteredSmallChanges.length === 0 && (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-lg font-semibold text-[var(--base-700)] mb-2">No results found</h3>
            <p className="text-[var(--base-600)]">
              No files or content match "{searchQuery}". Try a different search term.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Main Logic Change Card Component
interface MainLogicChangeCardProps {
  change: MainLogicChange;
  onValidate: () => void;
  onEnterDetailed: () => void;
  onSelectSubLogic: (subLogicId: string) => void;
  selectedSubLogic: string | null;
  searchQuery?: string;
}

function MainLogicChangeCard({ 
  change, 
  onValidate, 
  onEnterDetailed, 
  onSelectSubLogic, 
  selectedSubLogic,
  searchQuery = ""
}: MainLogicChangeCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      className={cn(
        "border rounded-lg p-4 space-y-4 transition-colors group",
        change.validated 
          ? "border-green-400 bg-green-50" 
          : "border-[var(--base-300)] bg-[var(--base-200)]"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-[var(--base-700)]">
            {highlightSearchTerm(change.title, searchQuery)}
          </h3>
          {isHovered && (
            <p className="text-sm text-[var(--base-600)]">
              {highlightSearchTerm(change.description, searchQuery)}
            </p>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={onEnterDetailed}
            className="px-3 py-1 bg-[var(--acc-500)] text-white rounded hover:bg-[var(--acc-600)] transition-colors text-sm"
          >
            Detailed View
          </button>
          
          <button
            onClick={onValidate}
            disabled={change.validated}
            className={cn(
              "px-3 py-1 rounded text-sm font-medium transition-colors",
              change.validated
                ? "bg-green-500 text-white"
                : "bg-[var(--base-400)] text-[var(--base-700)] hover:bg-[var(--base-500)]"
            )}
          >
            {change.validated ? "✓ Validated" : "Validate"}
          </button>
        </div>
      </div>

      {/* Blocks (only visible on hover) */}
      {isHovered && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-[var(--base-600)]">Blocks:</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {change.subLogicPaths.map((subPath) => (
              <SubLogicPathCard
                key={subPath.id}
                subPath={subPath}
                isSelected={selectedSubLogic === subPath.id}
                onSelect={() => onSelectSubLogic(subPath.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Sub Logic Path Card Component
interface SubLogicPathCardProps {
  subPath: SubLogicPath;
  isSelected: boolean;
  onSelect: () => void;
}

function SubLogicPathCard({ subPath, isSelected, onSelect }: SubLogicPathCardProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("SubLogicPathCard clicked:", subPath.id, "currently selected:", isSelected);
    onSelect();
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "p-3 border rounded cursor-pointer transition-colors select-none",
        isSelected 
          ? "border-[var(--acc-400)] bg-[var(--acc-100)]" 
          : "border-[var(--base-300)] bg-[var(--base-100)] hover:bg-[var(--base-150)]",
        subPath.validated ? "border-green-400" : ""
      )}
    >
      <div className="flex items-center justify-between">
        <h5 className="text-sm font-medium text-[var(--base-700)]">{subPath.title}</h5>
        {subPath.validated && <span className="text-green-500 text-xs">✓</span>}
      </div>
      <p className="text-xs text-[var(--base-600)] mt-1">{subPath.description}</p>
      <div className="text-xs text-[var(--acc-600)] mt-1">
        Prompt: {subPath.promptSegment}
      </div>
    </div>
  );
}

// Small Change Card Component
interface SmallChangeCardProps {
  change: DiffChange;
  onValidate: () => void;
  onEnterDetailed: () => void;
  onSelectSubLogic?: (subLogicId: string) => void;
  selectedSubLogic?: string | null;
  searchQuery?: string;
}

function SmallChangeCard({ change, onValidate, onEnterDetailed, onSelectSubLogic, selectedSubLogic, searchQuery = "" }: SmallChangeCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      className={cn(
        "border rounded-lg p-4 space-y-4 transition-colors",
        change.validated 
          ? "border-green-400 bg-green-50" 
          : "border-[var(--base-300)] bg-[var(--base-200)]"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-[var(--base-700)]">
            {highlightSearchTerm(change.title, searchQuery)}
          </h3>
          {isHovered && (
            <p className="text-sm text-[var(--base-600)]">
              {highlightSearchTerm(change.description, searchQuery)}
            </p>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={onEnterDetailed}
            className="px-3 py-1 bg-[var(--acc-500)] text-white rounded hover:bg-[var(--acc-600)] transition-colors text-sm"
          >
            View
          </button>
          
          <button
            onClick={onValidate}
            disabled={change.validated}
            className={cn(
              "px-3 py-1 rounded text-sm font-medium transition-colors",
              change.validated
                ? "bg-green-500 text-white"
                : "bg-[var(--base-400)] text-[var(--base-700)] hover:bg-[var(--base-500)]"
            )}
          >
            {change.validated ? "✓ Validated" : "Validate"}
          </button>
        </div>
      </div>

      {/* Blocks (only visible on hover) */}
      {isHovered && change.subLogicPaths && change.subLogicPaths.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-[var(--base-600)]">Blocks:</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {change.subLogicPaths.map((subPath) => (
              <SubLogicPathCard
                key={subPath.id}
                subPath={subPath}
                isSelected={selectedSubLogic === subPath.id}
                onSelect={() => onSelectSubLogic?.(subPath.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Detailed Mode Component
interface DetailedModeProps {
  diffSummary: DiffSummary;
  selectedChange: string | null;
  currentFile: GitDiffFile | null;
  currentFileIndex: number;
  currentLineIndex: number;
  onValidateChange: (changeId: string) => void;
  onNextChange: () => void;
  onPreviousChange: () => void;
  onNextFile: () => void;
  onPreviousFile: () => void;
  onNextHunk: () => void;
  onPreviousHunk: () => void;
  onBackToOverview: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: { changeId: string, fileIndex: number, hunkIndex: number, hunk: GitDiffHunk, context: string }[];
  currentSearchIndex: number;
  searchHunks: (query: string) => void;
  nextSearchResult: () => void;
  previousSearchResult: () => void;
}

function DetailedMode({
  diffSummary,
  selectedChange,
  currentFile,
  currentFileIndex,
  currentLineIndex,
  onValidateChange,
  onNextChange,
  onPreviousChange,
  onNextFile,
  onPreviousFile,
  onNextHunk,
  onPreviousHunk,
  onBackToOverview,
  searchQuery,
  setSearchQuery,
  searchResults,
  currentSearchIndex,
  searchHunks,
  nextSearchResult,
  previousSearchResult
}: DetailedModeProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Keyboard navigation
  React.useEffect(() => {
    let lastKeyPress: { key: string; timestamp: number } | null = null;
    const doubleTapThreshold = 300; // milliseconds
    
    const handleKeyDown = (event: KeyboardEvent) => {
      const currentTime = Date.now();
      
      // Get the scroll container for manual scrolling
      const scrollContainer = document.querySelector('.absolute.inset-0.overflow-auto') as HTMLElement;
      
      // Check for double-tap
      const isDoubleTap = lastKeyPress && 
        lastKeyPress.key === event.key && 
        (currentTime - lastKeyPress.timestamp) < doubleTapThreshold;
      
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 'ArrowUp':
            event.preventDefault();
            onPreviousHunk();
            break;
          case 'ArrowDown':
            event.preventDefault();
            onNextHunk();
            break;
          case 'f':
            event.preventDefault();
            searchInputRef.current?.focus();
            break;
        }
      } else {
        switch (event.key) {
          case 'ArrowUp':
            event.preventDefault();
            if (isDoubleTap) {
              // Double-tap up arrow = previous hunk
              onPreviousHunk();
              lastKeyPress = null; // Reset to prevent triple-tap
            } else {
              // Single tap up arrow = scroll up manually
              if (scrollContainer) {
                scrollContainer.scrollBy({ top: -100, behavior: 'smooth' });
              }
              lastKeyPress = { key: event.key, timestamp: currentTime };
            }
            break;
          case 'ArrowDown':
            event.preventDefault();
            if (isDoubleTap) {
              // Double-tap down arrow = next hunk
              onNextHunk();
              lastKeyPress = null; // Reset to prevent triple-tap
            } else {
              // Single tap down arrow = scroll down manually
              if (scrollContainer) {
                scrollContainer.scrollBy({ top: 100, behavior: 'smooth' });
              }
              lastKeyPress = { key: event.key, timestamp: currentTime };
            }
            break;
          case 'ArrowLeft':
            event.preventDefault();
            // Single tap left arrow = previous file
            onPreviousFile();
            break;
          case 'ArrowRight':
            event.preventDefault();
            // Single tap right arrow = next file
            onNextFile();
            break;
          case 'n':
            event.preventDefault();
            onNextChange();
            break;
          case 'p':
            event.preventDefault();
            onPreviousChange();
            break;
          case 'j':
            event.preventDefault();
            onNextHunk();
            break;
          case 'k':
            event.preventDefault();
            onPreviousHunk();
            break;
        }
      }
      
      // Clean up old key presses
      if (!isDoubleTap && event.key.startsWith('Arrow')) {
        lastKeyPress = { key: event.key, timestamp: currentTime };
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNextChange, onPreviousChange, onNextFile, onPreviousFile, onNextHunk, onPreviousHunk]);

  if (!selectedChange || !currentFile) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[var(--base-600)]">No change selected</p>
      </div>
    );
  }

  const change = [...diffSummary.mainLogicChanges, ...diffSummary.smallChanges]
    .find(c => c.id === selectedChange);

  if (!change) return null;

  return (
    <div className="flex-1 flex flex-col">
      {/* Navigation Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--base-300)] bg-[var(--base-150)]">
        <div className="flex items-center space-x-4">
          <div>
            <h3 className="font-semibold text-[var(--base-700)]">{change.title}</h3>
            <p className="text-sm text-[var(--base-600)]">
              File {currentFileIndex + 1} of {change.files.length}: {currentFile.filePath}
            </p>
            <p className="text-xs text-[var(--base-500)]">
              Block {currentLineIndex + 1} of {currentFile.hunks.length}
              {currentFile.hunks[currentLineIndex] && (
                <span className="ml-2">
                  (Lines -{currentFile.hunks[currentLineIndex].oldStart},{currentFile.hunks[currentLineIndex].oldCount} 
                  +{currentFile.hunks[currentLineIndex].newStart},{currentFile.hunks[currentLineIndex].newCount})
                </span>
              )}
            </p>
          </div>
          
          {/* Search Bar */}
          <div className="flex items-center space-x-2">
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  searchHunks(e.target.value);
                }}
                className="px-3 py-1 border border-[var(--base-300)] rounded text-sm w-48 focus:outline-none focus:border-[var(--acc-500)]"
              />
              {searchResults.length > 0 && (
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-[var(--base-600)]">
                  {currentSearchIndex + 1}/{searchResults.length}
                </div>
              )}
            </div>
            {searchResults.length > 0 && (
              <>
                <button
                  onClick={previousSearchResult}
                  className="px-2 py-1 bg-[var(--base-200)] text-[var(--base-700)] rounded hover:bg-[var(--base-300)] transition-colors text-sm"
                >
                  ↑
                </button>
                <button
                  onClick={nextSearchResult}
                  className="px-2 py-1 bg-[var(--base-200)] text-[var(--base-700)] rounded hover:bg-[var(--base-300)] transition-colors text-sm"
                >
                  ↓
                </button>
              </>
            )}
          </div>
        </div>

        {/* Navigation Controls */}
        <div className="flex items-center space-x-1">
          {/* Change Navigation */}
          <div className="flex items-center space-x-1 mr-2">
            <button
              onClick={onPreviousChange}
              className="px-2 py-1 bg-[var(--base-400)] text-[var(--base-700)] rounded hover:bg-[var(--base-500)] transition-colors text-sm"
              title="Previous Change (P)"
            >
              ←
            </button>
            <button
              onClick={onNextChange}
              className="px-2 py-1 bg-[var(--base-400)] text-[var(--base-700)] rounded hover:bg-[var(--base-500)] transition-colors text-sm"
              title="Next Change (N)"
            >
              →
            </button>
          </div>

          {/* Block Navigation */}
          <div className="flex items-center space-x-1 mr-2">
            <button
              onClick={onPreviousHunk}
              disabled={currentLineIndex <= 0}
              className="px-2 py-1 bg-[var(--base-300)] text-[var(--base-700)] rounded hover:bg-[var(--base-400)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              title="Previous Block (K or Ctrl+↑)"
            >
              ◀
            </button>
            <button
              onClick={onNextHunk}
              disabled={currentLineIndex >= currentFile.hunks.length - 1}
              className="px-2 py-1 bg-[var(--base-300)] text-[var(--base-700)] rounded hover:bg-[var(--base-400)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              title="Next Block (J or Ctrl+↓)"
            >
              ▶
            </button>
          </div>
          
          <button
            onClick={() => onValidateChange(selectedChange)}
            disabled={change.validated}
            className={cn(
              "px-4 py-1 rounded font-medium transition-colors",
              change.validated
                ? "bg-green-500 text-white"
                : "bg-[var(--acc-600)] text-white hover:bg-[var(--acc-700)]"
            )}
          >
            {change.validated ? "✓ Validated" : "Validate Change"}
          </button>
        </div>
      </div>

      {/* File Diff Content */}
      <div className="flex-1 relative">
        <FileDiffViewer file={currentFile} currentHunkIndex={currentLineIndex} searchQuery={searchQuery} />
      </div>
    </div>
  );
}

// Text highlighting utility
function highlightSearchTerm(text: string, searchTerm: string): JSX.Element {
  if (!searchTerm.trim()) {
    return <span>{text}</span>;
  }

  const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  
  return (
    <span>
      {parts.map((part, index) =>
        regex.test(part) ? (
          <span key={index} className="bg-yellow-300 text-black px-1 rounded">
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </span>
  );
}

// File Diff Viewer Component
interface FileDiffViewerProps {
  file: GitDiffFile;
  currentHunkIndex?: number;
  searchQuery?: string;
}

function FileDiffViewer({ file, currentHunkIndex = 0, searchQuery = "" }: FileDiffViewerProps) {
  const currentHunkRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showLineNumbers, setShowLineNumbers] = useState(false);

  // Debug container dimensions
  useEffect(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      console.log('[DEBUG] Container dimensions:', {
        clientHeight: container.clientHeight,
        scrollHeight: container.scrollHeight,
        offsetHeight: container.offsetHeight,
        isScrollable: container.scrollHeight > container.clientHeight
      });
    }
  }, []);

  // Scroll to current hunk when it changes
  useEffect(() => {
    if (currentHunkRef.current && scrollContainerRef.current) {
      const scrollContainer = scrollContainerRef.current;
      const hunkElement = currentHunkRef.current;
      
      // Calculate the position to scroll to (exactly at the top of the hunk)
      const hunkTop = hunkElement.offsetTop;
      
      console.log(`[SCROLL] Scrolling to hunk ${currentHunkIndex}`);
      console.log(`[SCROLL] Hunk top: ${hunkTop}, Target scroll: ${hunkTop}`);
      console.log(`[SCROLL] Container scrollable: ${scrollContainer.scrollHeight > scrollContainer.clientHeight}`);
      
      if (scrollContainer.scrollHeight > scrollContainer.clientHeight) {
        scrollContainer.scrollTo({
          top: Math.max(0, hunkTop),
          behavior: 'smooth'
        });
      } else {
        console.log('[SCROLL] Container is not scrollable - content fits within container');
      }
    }
  }, [currentHunkIndex]);

  // Track scroll progress
  useEffect(() => {
    const handleScroll = () => {
      if (scrollContainerRef.current) {
        const scrollContainer = scrollContainerRef.current;
        const scrollTop = scrollContainer.scrollTop;
        const scrollHeight = scrollContainer.scrollHeight - scrollContainer.clientHeight;
        const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
        setScrollProgress(progress);
        
        console.log(`[SCROLL_PROGRESS] ScrollTop: ${scrollTop}, ScrollHeight: ${scrollHeight}, Progress: ${progress}%`);
        console.log(`[SCROLL_PROGRESS] Container dimensions: ${scrollContainer.clientHeight}x${scrollContainer.scrollHeight}`);
      }
    };

    if (scrollContainerRef.current) {
      const scrollContainer = scrollContainerRef.current;
      console.log('[SCROLL_PROGRESS] Attaching scroll listener to container:', scrollContainer);
      scrollContainer.addEventListener('scroll', handleScroll);
      // Initial scroll progress calculation
      handleScroll();
      
      return () => {
        scrollContainer.removeEventListener('scroll', handleScroll);
      };
    }
  }, []);

  return (
    <div ref={scrollContainerRef} className="absolute inset-0 overflow-auto">
      <div className="relative min-h-full">
        <div className="p-4">
          <div className="bg-[var(--base-200)] rounded-lg overflow-hidden">
            <div className="bg-[var(--base-300)] px-4 py-2 border-b border-[var(--base-400)] sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <h4 className="font-mono text-sm text-[var(--base-700)]">{file.filePath}</h4>
                <div className="flex items-center space-x-4 text-sm">
                  <span className="text-green-600">+{file.additions}</span>
                  <span className="text-red-600">-{file.deletions}</span>
                  <span className="text-[var(--base-600)]">
                    Block {currentHunkIndex + 1}/{file.hunks.length}
                  </span>
                </div>
              </div>
            </div>

            {file.hunks.map((hunk, hunkIndex) => (
              <div 
                key={hunkIndex} 
                data-hunk-index={hunkIndex}
                ref={hunkIndex === currentHunkIndex ? currentHunkRef : null}
                className={cn(
                  "border-b border-[var(--base-400)] last:border-b-0 transition-all duration-300",
                  hunkIndex === currentHunkIndex ? "ring-2 ring-[var(--acc-500)] ring-opacity-50 shadow-lg" : "",
                  // Add extra padding after the last hunk for better navigation visibility
                  hunkIndex === file.hunks.length - 1 ? "pb-96" : ""
                )}
              >
                <div className={cn(
                  "px-4 py-2 text-xs font-mono sticky top-12 z-5 transition-colors duration-300",
                  hunkIndex === currentHunkIndex 
                    ? "bg-[var(--acc-200)] text-[var(--acc-800)] border-l-4 border-[var(--acc-500)]" 
                    : "bg-[var(--base-250)] text-[var(--base-600)]"
                )}>
                  <div className="flex items-center justify-between">
                    <span>
                      @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
                    </span>
                    {hunkIndex === currentHunkIndex && (
                      <span className="text-[var(--acc-600)] font-medium text-xs">← Current</span>
                    )}
                  </div>
                </div>
                
                <div>
                  {hunk.lines.map((line, lineIndex) => (
                    <DiffLine 
                      key={lineIndex} 
                      line={line} 
                      showLineNumbers={showLineNumbers}
                      onHoverLineNumber={() => setShowLineNumbers(true)}
                      onLeaveLineNumber={() => setShowLineNumbers(false)}
                      searchQuery={searchQuery}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Diff Line Component
interface DiffLineProps {
  line: GitDiffLine;
  showLineNumbers: boolean;
  onHoverLineNumber: () => void;
  onLeaveLineNumber: () => void;
  searchQuery?: string;
}

function DiffLine({ line, showLineNumbers, onHoverLineNumber, onLeaveLineNumber, searchQuery = "" }: DiffLineProps) {
  const getLineStyle = () => {
    switch (line.type) {
      case 'added':
        return "bg-green-100 text-green-800 border-l-4 border-green-500";
      case 'removed':
        return "bg-red-100 text-red-800 border-l-4 border-red-500";
      default:
        return "bg-[var(--base-100)] text-[var(--base-700)]";
    }
  };

  const getPrefix = () => {
    return ' '; // No prefix needed since color coding shows the line type
  };

  return (
    <div className={cn("px-4 py-1 font-mono text-sm flex", getLineStyle())}>
      <span 
        className={cn(
          "w-12 text-[var(--base-500)] text-right mr-4 select-none transition-opacity",
          showLineNumbers ? "opacity-100" : "opacity-0"
        )}
        onMouseEnter={onHoverLineNumber}
        onMouseLeave={onLeaveLineNumber}
      >
        {line.newLineNumber || line.oldLineNumber || ''}
      </span>
      <span className="w-4 text-center select-none">{getPrefix()}</span>
      <span className="flex-1 whitespace-pre-wrap break-all">
        {highlightSearchTerm(line.content, searchQuery)}
      </span>
    </div>
  );
}

// Directory Selection Page Component
interface DirectorySelectionPageProps {
  selectedDirectory: string;
  onDirectorySelect: (directory: string) => void;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
}

function DirectorySelectionPage({
  selectedDirectory,
  onDirectorySelect,
  onClose,
  loading = false,
  error = null
}: DirectorySelectionPageProps) {
  const [directoryInput, setDirectoryInput] = useState(selectedDirectory);
  const [suggestedDirectories, setSuggestedDirectories] = useState<string[]>([]);

  useEffect(() => {
    // Get current directory and suggest some common paths
    const loadSuggestions = async () => {
      try {
        const currentDir = await invoke<string>("get_current_dir");
        const suggestions = [
          currentDir,
          currentDir.replace('/tauri-app', ''), // Parent directory
          currentDir.replace('/frontend/tauri-app', ''), // Project root
          '/Users/isago/ariana-ide', // Direct project path
        ].filter((path, index, arr) => arr.indexOf(path) === index); // Remove duplicates
        
        setSuggestedDirectories(suggestions);
        if (!directoryInput) {
          setDirectoryInput(suggestions[1] || currentDir); // Default to parent directory
        }
      } catch (error) {
        console.error("Failed to get current directory:", error);
      }
    };
    
    loadSuggestions();
  }, []);

  const handleDirectorySubmit = () => {
    console.log("[DIRECTORY_PAGE] handleDirectorySubmit called with:", directoryInput);
    if (directoryInput.trim()) {
      console.log("[DIRECTORY_PAGE] Calling onDirectorySelect with:", directoryInput.trim());
      onDirectorySelect(directoryInput.trim());
    } else {
      console.log("[DIRECTORY_PAGE] Directory input is empty");
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--base-100)] relative">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--base-300)]">
        <div>
          <h1 className="text-2xl font-bold text-[var(--acc-600)]">Select Git Repository</h1>
          <p className="text-sm text-[var(--base-600)] mt-1">
            Choose the directory containing your git repository
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Directory Input */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--base-700)] mb-2">
                Repository Directory Path
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={directoryInput}
                  onChange={(e) => setDirectoryInput(e.target.value)}
                  placeholder="/path/to/your/git/repository"
                  className="flex-1 px-3 py-2 border border-[var(--base-300)] rounded-lg bg-[var(--base-100)] text-[var(--base-700)] focus:outline-none focus:ring-2 focus:ring-[var(--acc-500)] focus:border-transparent"
                  onKeyPress={(e) => e.key === 'Enter' && handleDirectorySubmit()}
                />
                <button
                  onClick={handleDirectorySubmit}
                  disabled={!directoryInput.trim() || loading}
                  className={cn(
                    "px-4 py-2 rounded-lg font-medium transition-colors",
                    directoryInput.trim() && !loading
                      ? "bg-[var(--acc-500)] text-white hover:bg-[var(--acc-600)]"
                      : "bg-[var(--base-300)] text-[var(--base-500)] cursor-not-allowed"
                  )}
                >
                  {loading ? (
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Validating...</span>
                    </div>
                  ) : (
                    "Select"
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <div className="text-red-500">⚠️</div>
                <div className="text-sm text-red-700">{error}</div>
              </div>
            </div>
          )}

          {/* Suggested Directories */}
          {suggestedDirectories.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-[var(--base-700)]">Suggested Directories:</h3>
              <div className="space-y-2">
                {suggestedDirectories.map((dir, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      console.log("[DIRECTORY_PAGE] Suggested directory clicked:", dir);
                      onDirectorySelect(dir);
                    }}
                    disabled={loading}
                    className={cn(
                      "w-full text-left px-4 py-3 rounded-lg transition-colors",
                      loading 
                        ? "bg-[var(--base-200)] opacity-50 cursor-not-allowed"
                        : "bg-[var(--base-200)] hover:bg-[var(--base-250)]"
                    )}
                  >
                    <div className="font-mono text-sm text-[var(--base-700)]">{dir}</div>
                    <div className="text-xs text-[var(--base-600)] mt-1">
                      {index === 0 && "Current directory"}
                      {index === 1 && "Parent directory"}
                      {index === 2 && "Project root"}
                      {index === 3 && "Ariana IDE project"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Help Text */}
          <div className="bg-[var(--base-200)] rounded-lg p-4">
            <h4 className="font-medium text-[var(--base-700)] mb-2">💡 Tips</h4>
            <ul className="text-sm text-[var(--base-600)] space-y-1">
              <li>• Select the root directory of your git repository</li>
              <li>• The directory should contain a .git folder</li>
              <li>• Use absolute paths for best results</li>
              <li>• Try the suggested directories above for quick access</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// Branch Selection Landing Page Component
interface BranchSelectionPageProps {
  branches: GitBranch[];
  loading: boolean;
  error: string | null;
  selectedBaseBranch: string;
  selectedTargetBranch: string;
  selectedBaseCommit: string;
  selectedTargetCommit: string;
  baseBranchCommits: GitCommit[];
  targetBranchCommits: GitCommit[];
  loadingCommits: boolean;
  selectedDirectory: string;
  onBaseBranchChange: (branch: string) => void;
  onTargetBranchChange: (branch: string) => void;
  onBaseCommitChange: (commit: string) => void;
  onTargetCommitChange: (commit: string) => void;
  onCompare: () => void;
  onClose: () => void;
  onRetry: () => void;
  onBackToDirectory: () => void;
  isComparing: boolean;
}

function BranchSelectionPage({
  branches,
  loading,
  error,
  selectedBaseBranch,
  selectedTargetBranch,
  selectedBaseCommit,
  selectedTargetCommit,
  baseBranchCommits,
  targetBranchCommits,
  loadingCommits,
  selectedDirectory,
  onBaseBranchChange,
  onTargetBranchChange,
  onBaseCommitChange,
  onTargetCommitChange,
  onCompare,
  onClose,
  onRetry,
  onBackToDirectory,
  isComparing
}: BranchSelectionPageProps) {
  const canCompare = (selectedBaseBranch && selectedTargetBranch && (
                       selectedBaseBranch !== selectedTargetBranch || // Different branches
                       (selectedBaseBranch === selectedTargetBranch && (selectedBaseCommit || selectedTargetCommit)) // Same branch with different commits
                     )) || 
                     selectedBaseCommit === 'UNSTAGED' || selectedTargetCommit === 'UNSTAGED' ||
                     selectedBaseCommit === 'STAGED' || selectedTargetCommit === 'STAGED';

  if (loading) {
    return (
      <div className="flex-1 flex flex-col h-full bg-[var(--base-100)] relative">
        <div className="flex items-center justify-between p-4 border-b border-[var(--base-300)]">
          <h1 className="text-2xl font-bold text-[var(--acc-600)]">Select Branches to Compare</h1>
        </div>
        
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--acc-500)] mx-auto mb-4"></div>
            <p className="text-[var(--base-600)]">Loading branches...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col h-full bg-[var(--base-100)] relative">
        <div className="flex items-center justify-between p-4 border-b border-[var(--base-300)]">
          <h1 className="text-2xl font-bold text-[var(--acc-600)]">Select Branches to Compare</h1>
        </div>
        
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <div className="text-red-500 text-xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold text-[var(--base-700)] mb-2">Error Loading Branches</h2>
            <p className="text-[var(--base-600)] mb-4">{error}</p>
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-[var(--acc-500)] text-white rounded-lg hover:bg-[var(--acc-600)] transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--base-100)] relative">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--base-300)]">
        <div>
          <h1 className="text-2xl font-bold text-[var(--acc-600)]">Diff Management</h1>
          <p className="text-sm text-[var(--base-600)] mt-1">
            Repository: <span className="font-mono">{selectedDirectory}</span>
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={onBackToDirectory}
            className="px-3 py-1 bg-[var(--base-200)] text-[var(--base-700)] rounded hover:bg-[var(--base-300)] transition-colors text-sm"
          >
            ← Change Directory
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Branch Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Base Branch Selection */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-[var(--acc-600)] mb-2">Base Branch</h3>
                <p className="text-sm text-[var(--base-600)]">The branch to compare against (what you're merging into)</p>
              </div>
              
              <BranchSelector
                branches={branches}
                selectedBranch={selectedBaseBranch}
                selectedCommit={selectedBaseCommit}
                commits={baseBranchCommits}
                loadingCommits={loadingCommits}
                onBranchChange={onBaseBranchChange}
                onCommitChange={onBaseCommitChange}
                placeholder="Select base branch"
              />
            </div>

            {/* Target Branch Selection */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-[var(--acc-600)] mb-2">Target Branch</h3>
                <p className="text-sm text-[var(--base-600)]">The branch with changes to validate (what you're merging from)</p>
              </div>
              
              <BranchSelector
                branches={branches}
                selectedBranch={selectedTargetBranch}
                selectedCommit={selectedTargetCommit}
                commits={targetBranchCommits}
                loadingCommits={loadingCommits}
                onBranchChange={onTargetBranchChange}
                onCommitChange={onTargetCommitChange}
                placeholder="Select target branch"
              />
            </div>
          </div>

          {/* Comparison Preview */}
          {canCompare && (
            <div className="bg-[var(--base-200)] rounded-lg p-4">
              <h4 className="font-medium text-[var(--base-700)] mb-2">Comparison Preview</h4>
              <div className="flex items-center space-x-4 text-sm">
                <span className="text-[var(--base-600)]">
                  {selectedTargetCommit === 'UNSTAGED' && "Comparing unstaged changes against HEAD"}
                  {selectedTargetCommit === 'STAGED' && "Comparing staged changes against HEAD"}
                  {selectedBaseCommit === 'UNSTAGED' && "Comparing unstaged changes against HEAD"}
                  {selectedBaseCommit === 'STAGED' && "Comparing staged changes against HEAD"}
                  {(selectedTargetCommit !== 'UNSTAGED' && selectedTargetCommit !== 'STAGED' && selectedBaseCommit !== 'UNSTAGED' && selectedBaseCommit !== 'STAGED') && 
                    `Comparing changes from ${selectedTargetBranch} against ${selectedBaseBranch}`}
                </span>
              </div>
            </div>
          )}

          {/* Compare Button */}
          <div className="flex justify-center pt-4">
            <button
              onClick={onCompare}
              disabled={!canCompare || isComparing}
              className={cn(
                "px-8 py-3 rounded-lg font-medium transition-colors",
                canCompare && !isComparing
                  ? "bg-[var(--acc-500)] text-white hover:bg-[var(--acc-600)]"
                  : "bg-[var(--base-300)] text-[var(--base-500)] cursor-not-allowed"
              )}
            >
              {isComparing ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Loading...</span>
                </div>
              ) : (
                selectedTargetCommit === 'UNSTAGED' || selectedBaseCommit === 'UNSTAGED' ? "View Unstaged Changes" :
                selectedTargetCommit === 'STAGED' || selectedBaseCommit === 'STAGED' ? "View Staged Changes" :
                "Compare Branches"
              )}
            </button>
          </div>

          {!canCompare && selectedBaseBranch && selectedTargetBranch && (
            <p className="text-center text-sm text-[var(--base-500)]">
              {selectedBaseBranch === selectedTargetBranch 
                ? "Please select different commits to compare within the same branch"
                : "Please select two different branches to compare"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Branch Selector Component
interface BranchSelectorProps {
  branches: GitBranch[];
  selectedBranch: string;
  selectedCommit: string;
  commits: GitCommit[];
  loadingCommits: boolean;
  onBranchChange: (branch: string) => void;
  onCommitChange: (commit: string) => void;
  excludeBranch?: string;
  placeholder: string;
}

function BranchSelector({
  branches,
  selectedBranch,
  selectedCommit,
  commits,
  loadingCommits,
  onBranchChange,
  onCommitChange,
  excludeBranch,
  placeholder
}: BranchSelectorProps) {
  const availableBranches = excludeBranch ? branches.filter(b => b.name !== excludeBranch) : branches;

  return (
    <div className="space-y-3">
      <select
        value={selectedBranch}
        onChange={(e) => onBranchChange(e.target.value)}
        className="w-full px-3 py-2 border border-[var(--base-300)] rounded-lg bg-[var(--base-100)] text-[var(--base-700)] focus:outline-none focus:ring-2 focus:ring-[var(--acc-500)] focus:border-transparent"
      >
        <option value="">{placeholder}</option>
        {availableBranches.map((branch) => (
          <option key={branch.name} value={branch.name}>
            {branch.name} {branch.isCurrentBranch ? "(current)" : ""} {branch.isRemote ? "(remote)" : ""}
          </option>
        ))}
      </select>

      {/* Commit Selection */}
      {selectedBranch && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[var(--base-700)]">
            Select Commit (optional, defaults to latest)
          </label>
          {loadingCommits ? (
            <div className="flex items-center space-x-2 text-sm text-[var(--base-600)]">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[var(--acc-500)]"></div>
              <span>Loading commits...</span>
            </div>
          ) : (
            <select
              value={selectedCommit}
              onChange={(e) => onCommitChange(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--base-300)] rounded-lg bg-[var(--base-100)] text-[var(--base-700)] focus:outline-none focus:ring-2 focus:ring-[var(--acc-500)] focus:border-transparent"
            >
              <option value="">Latest commit</option>
              <option value="UNSTAGED">🔶 Unstaged Changes (Working Directory)</option>
              <option value="STAGED">🟡 Staged Changes (Index)</option>
              {commits.map((commit) => (
                <option key={commit.hash} value={commit.hash}>
                  {commit.shortHash} - {commit.message} ({commit.author}, {commit.date})
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Selected Branch Details */}
      {selectedBranch && (
        <div className="bg-[var(--base-150)] rounded-lg p-3">
          {(() => {
            const branch = branches.find(b => b.name === selectedBranch);
            if (!branch) return null;
            
            return (
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-[var(--base-700)]">{branch.name}</span>
                  {branch.isCurrentBranch && (
                    <span className="text-xs bg-[var(--acc-500)] text-white px-2 py-0.5 rounded">CURRENT</span>
                  )}
                  {branch.isRemote && (
                    <span className="text-xs bg-[var(--base-400)] text-[var(--base-700)] px-2 py-0.5 rounded">REMOTE</span>
                  )}
                </div>
                {branch.lastCommit && (
                  <div className="text-xs text-[var(--base-600)]">
                    <span className="font-mono">{branch.lastCommit}</span>
                    {branch.lastCommitMessage && (
                      <span className="ml-2">{branch.lastCommitMessage}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// Unified Diff Modal Component
interface UnifiedDiffModalProps {
  content: string;
  onClose: () => void;
  baseBranch: string;
  targetBranch: string;
  baseCommit?: string;
  targetCommit?: string;
}

function UnifiedDiffModal({ 
  content, 
  onClose, 
  baseBranch, 
  targetBranch, 
  baseCommit, 
  targetCommit
}: UnifiedDiffModalProps) {
  const copyToClipboard = () => {
    navigator.clipboard.writeText(content);
  };

  const downloadDiff = () => {
    let filename: string;
    
    if (targetCommit === 'UNSTAGED' || baseCommit === 'UNSTAGED') {
      filename = 'unstaged-changes.patch';
    } else if (targetCommit === 'STAGED' || baseCommit === 'STAGED') {
      filename = 'staged-changes.patch';
    } else {
      const baseRef = baseCommit ? baseCommit.substring(0, 7) : baseBranch;
      const targetRef = targetCommit ? targetCommit.substring(0, 7) : targetBranch;
      filename = `diff-${baseRef}-to-${targetRef}.patch`;
    }
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[var(--base-100)] rounded-lg w-full h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--base-300)]">
          <div>
            <h2 className="text-xl font-bold text-[var(--acc-600)]">Unified Diff</h2>
            <p className="text-sm text-[var(--base-600)]">
              {(targetCommit === 'UNSTAGED' || baseCommit === 'UNSTAGED') && "Unstaged changes (working directory vs HEAD)"}
              {(targetCommit === 'STAGED' || baseCommit === 'STAGED') && "Staged changes (index vs HEAD)"}
              {(targetCommit !== 'UNSTAGED' && targetCommit !== 'STAGED' && baseCommit !== 'UNSTAGED' && baseCommit !== 'STAGED') && 
                `Comparing ${baseCommit ? `${baseBranch}@${baseCommit.substring(0, 7)}` : baseBranch} → ${targetCommit ? `${targetBranch}@${targetCommit.substring(0, 7)}` : targetBranch}`}
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={copyToClipboard}
              className="px-3 py-1 bg-[var(--base-400)] text-[var(--base-700)] rounded hover:bg-[var(--base-500)] transition-colors text-sm"
            >
              Copy
            </button>
            <button
              onClick={downloadDiff}
              className="px-3 py-1 bg-[var(--acc-500)] text-white rounded hover:bg-[var(--acc-600)] transition-colors text-sm"
            >
              Download
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1 bg-[var(--base-400)] text-[var(--base-700)] rounded hover:bg-[var(--base-500)] transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          <pre className="bg-[var(--base-200)] rounded-lg p-4 text-sm font-mono whitespace-pre-wrap overflow-auto text-[var(--base-700)]">
            {content || "No differences found between the selected refs."}
          </pre>
        </div>
      </div>
    </div>
  );
}