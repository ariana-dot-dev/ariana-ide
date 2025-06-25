import React, { useState } from 'react';
import { AudioProvider } from '../services/AudioContext';
import { MicrophoneButton } from './MicrophoneButton';
import { TranscriptionEditor } from './TranscriptionEditor';

interface MicrophoneComponentProps {
  className?: string;
  onSendTranscription?: (transcription: string) => Promise<void>;
  buttonSize?: 'sm' | 'md' | 'lg';
  placeholder?: string;
}

export function MicrophoneComponent({ 
  className = '',
  onSendTranscription,
  buttonSize = 'md',
  placeholder 
}: MicrophoneComponentProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSendTranscription = async (transcription: string) => {
    if (onSendTranscription) {
      await onSendTranscription(transcription);
    } else {
      // Default behavior - just log to console
      console.log('Transcription:', transcription);
    }
    
    // Collapse after sending
    setIsExpanded(false);
  };

  return (
    <AudioProvider onSendTranscription={handleSendTranscription}>
      <div className={`relative ${className}`}>
        <div className="flex items-start gap-4">
          <div 
            className="cursor-pointer"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <MicrophoneButton size={buttonSize} />
          </div>
          
          {isExpanded && (
            <div className="flex-1 animate-in slide-in-from-left-2 duration-200">
              <TranscriptionEditor 
                placeholder={placeholder}
                className="mb-8"
              />
            </div>
          )}
        </div>
      </div>
    </AudioProvider>
  );
}