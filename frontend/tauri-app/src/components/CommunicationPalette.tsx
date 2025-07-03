import React, { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "../utils";
import { communicationService } from "../services/CommunicationService";

interface CommunicationPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSend?: (message: string) => Promise<void>;
  isAudioEnabled?: boolean;
  audioAutoSendDelay?: number;
  provider?: string;
  model?: string;
  apiKey?: string;
  systemPrompt?: string;
}

export const CommunicationPalette: React.FC<CommunicationPaletteProps> = ({
  isOpen,
  onClose,
  onSend,
  isAudioEnabled = false,
  audioAutoSendDelay = 2500,
  provider = "anthropic",
  model = "claude-3-5-sonnet-20241022",
  apiKey = "",
  systemPrompt = "You are a helpful assistant.",
}) => {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [audioTimeout, setAudioTimeout] = useState<NodeJS.Timeout | null>(null);
  const [response, setResponse] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [audioEnabledState, setAudioEnabledState] = useState(isAudioEnabled);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (audioEnabledState && message.trim() && !isLoading && !isStreaming) {
      if (audioTimeout) {
        clearTimeout(audioTimeout);
      }
      
      const timeout = setTimeout(() => {
        handleSend();
      }, audioAutoSendDelay);
      
      setAudioTimeout(timeout);
    }
    
    return () => {
      if (audioTimeout) {
        clearTimeout(audioTimeout);
      }
    };
  }, [message, audioEnabledState, audioAutoSendDelay, isLoading, isStreaming]);

  const handleApiSend = useCallback(async (messageText: string) => {
    if (!apiKey.trim()) {
      throw new Error("API key is required");
    }

    const request = communicationService.createBasicRequest(
      provider,
      model,
      messageText,
      apiKey,
      systemPrompt
    );

    setIsStreaming(true);
    setResponse("");
    
    try {
      for await (const chunk of communicationService.sendMessageStream(request)) {
        setResponse(prev => prev + chunk.delta);
        if (chunk.done) break;
      }
    } finally {
      setIsStreaming(false);
    }
  }, [provider, model, apiKey, systemPrompt]);

  const handleSend = async () => {
    if (!message.trim() || isLoading || isStreaming) return;
    
    setIsLoading(true);
    try {
      if (onSend) {
        await onSend(message.trim());
      } else {
        await handleApiSend(message.trim());
      }
      setMessage("");
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsStreaming(false);
    setIsLoading(false);
  };

  const toggleAudio = () => {
    setAudioEnabledState(!audioEnabledState);
    if (audioTimeout) {
      clearTimeout(audioTimeout);
      setAudioTimeout(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
      <div className="bg-[var(--base-100)] rounded-lg shadow-xl w-[600px] max-w-[90vw] max-h-[80vh] p-4 border border-[var(--acc-400)] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--blackest)]">
            Communication Palette
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--base-600)] hover:text-[var(--blackest)] transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col space-y-4">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className={cn(
                "w-full h-32 p-3 rounded-md border border-[var(--acc-400)] bg-[var(--base-200)] text-[var(--blackest)] placeholder-[var(--base-500)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--acc-500)]",
                "font-mono text-sm"
              )}
              disabled={isLoading || isStreaming}
            />
            {audioEnabledState && message.trim() && !isLoading && !isStreaming && (
              <div className="absolute bottom-2 right-2 flex items-center gap-2">
                <div className="animate-pulse w-2 h-2 bg-red-500 rounded-full"></div>
                <span className="text-xs text-[var(--base-600)]">
                  Auto-send in {Math.ceil(audioAutoSendDelay / 1000)}s
                </span>
              </div>
            )}
          </div>

          {response && (
            <div className="flex-1 overflow-auto">
              <div className="text-sm text-[var(--base-600)] mb-2">Response:</div>
              <div className="p-3 rounded-md bg-[var(--base-200)] border border-[var(--acc-400)] overflow-auto max-h-64">
                <pre className="whitespace-pre-wrap font-mono text-sm text-[var(--blackest)]">
                  {response}
                  {isStreaming && <span className="animate-pulse">|</span>}
                </pre>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={toggleAudio}
                className={cn(
                  "px-3 py-1 rounded text-xs transition-colors",
                  audioEnabledState
                    ? "bg-[var(--acc-500)] text-white"
                    : "bg-[var(--base-400)] text-[var(--base-600)]"
                )}
              >
                🎤 Audio {audioEnabledState ? "ON" : "OFF"}
              </button>
              {!apiKey && (
                <span className="text-xs text-red-500">
                  API key required
                </span>
              )}
            </div>

            <div className="flex gap-2">
              {isStreaming && (
                <button
                  onClick={handleStop}
                  className="px-4 py-2 rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  Stop
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-md bg-[var(--base-400)] text-[var(--base-600)] hover:bg-[var(--base-500)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!message.trim() || isLoading || isStreaming || !apiKey}
                className={cn(
                  "px-4 py-2 rounded-md transition-colors",
                  !message.trim() || isLoading || isStreaming || !apiKey
                    ? "bg-[var(--base-400)] text-[var(--base-600)] cursor-not-allowed"
                    : "bg-[var(--acc-500)] text-white hover:bg-[var(--acc-600)]"
                )}
              >
                {isLoading ? "Sending..." : isStreaming ? "Streaming..." : "Send"}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};