import React, { useEffect, useRef } from 'react';
import { useAudio } from '../services/AudioContext';

interface TranscriptionEditorProps {
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

export function TranscriptionEditor({ 
  className = '', 
  placeholder = 'Click the microphone to start recording...',
  autoFocus = true 
}: TranscriptionEditorProps) {
  const { 
    transcription, 
    updateTranscription, 
    isRecording, 
    isListening, 
    isProcessing,
    sendTranscription,
    error 
  } = useAudio();
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus and resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      if (autoFocus && isRecording) {
        textareaRef.current.focus();
      }
      
      // Auto-resize textarea
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [transcription, isRecording, autoFocus]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateTranscription(e.target.value);
  };

  const handleKeyDown = (e: React.KeyEvent<HTMLTextAreaElement>) => {
    // Send on Ctrl+Enter or Cmd+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      sendTranscription();
    }
  };

  return (
    <div className={`relative ${className}`}>
      <textarea
        ref={textareaRef}
        value={transcription}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isProcessing}
        className={`
          w-full min-h-[120px] max-h-[300px] p-4 
          border border-gray-200 rounded-xl resize-none
          transition-all duration-200
          focus:outline-none focus:border-gray-300
          bg-white/80 backdrop-blur-sm
          placeholder-gray-400 text-gray-700
          ${isRecording ? 'border-gray-200 bg-gray-50/80' : ''}
          ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
          ${error ? 'border-gray-300 bg-gray-50/80' : ''}
        `}
        style={{
          backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06), inset 0 1px rgba(255, 255, 255, 0.5)'
        }}
      />
      
      {/* Status indicators */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        {isListening && (
          <div className="flex items-center gap-1.5 text-gray-600 text-xs bg-white/80 backdrop-blur-sm px-2 py-1 rounded-full">
            Listening
          </div>
        )}
        
        {isProcessing && (
          <div className="flex items-center gap-1.5 text-gray-600 text-xs bg-white/80 backdrop-blur-sm px-2 py-1 rounded-full">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-spin"></div>
            Sending
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="absolute -bottom-6 left-0 text-gray-600 text-xs bg-gray-50 px-2 py-1 rounded">
          {error}
        </div>
      )}

      {/* Help text */}
      {!error && (
        <div className="absolute -bottom-5 left-0 text-gray-400 text-xs">
          {isRecording 
            ? 'Recording... (sends every 2s of silence, click mic to stop)' 
            : 'Press Ctrl+Enter to send manually'
          }
        </div>
      )}
    </div>
  );
}