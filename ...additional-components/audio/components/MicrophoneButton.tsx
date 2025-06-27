import React from 'react';
import { useAudio } from '../services/AudioContext';

interface MicrophoneButtonProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function MicrophoneButton({ className = '', size = 'md' }: MicrophoneButtonProps) {
  const { isRecording, isListening, startRecording, stopRecording, error } = useAudio();

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16'
  };

  const iconSizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  const handleClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={!!error}
      className={`
        ${sizeClasses[size]}
        ${className}
        relative rounded-full transition-all duration-300 focus:outline-none group
        ${error ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        flex items-center justify-center
        backdrop-blur-md bg-white/10 border border-white/20
        hover:bg-white/20 hover:border-white/30
        shadow-lg hover:shadow-xl
        ${isRecording ? 'bg-gray-500/20 border-gray-300/40 hover:bg-gray-500/30' : ''}
      `}
      style={{
        backdropFilter: 'blur(12px)',
        background: isRecording 
          ? 'rgba(75, 85, 99, 0.2)' 
          : 'rgba(255, 255, 255, 0.1)',
        boxShadow: isRecording
          ? '0 8px 32px rgba(75, 85, 99, 0.3), inset 0 1px rgba(255, 255, 255, 0.2)'
          : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px rgba(255, 255, 255, 0.2)'
      }}
      title={isRecording ? 'Stop Recording' : 'Start Recording'}
    >
      {/* Microphone or Stop Icon */}
      {isRecording ? (
        <svg
          className={`${iconSizeClasses[size]} text-white drop-shadow-sm`}
          fill="currentColor"
          viewBox="0 0 16 16"
        >
          <path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h2a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 9 14H7a1.5 1.5 0 0 1-1.5-1.5z"/>
        </svg>
      ) : (
        <svg
          className={`${iconSizeClasses[size]} text-gray-600 drop-shadow-sm`}
          fill="currentColor"
          viewBox="0 0 16 16"
        >
          <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5"/>
          <path d="M10 8a2 2 0 1 1-4 0V3a2 2 0 1 1 4 0zM8 0a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V3a3 3 0 0 0-3-3"/>
        </svg>
      )}

      {/* Listening pulse effect */}
      {isListening && (
        <div 
          className="absolute inset-0 rounded-full border-2 border-white/60 animate-pulse"
          style={{
            animation: 'pulse 1.5s ease-in-out infinite'
          }}
        />
      )}

      {/* Subtle glow when active */}
      {(isRecording || isListening) && (
        <div 
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)',
            animation: 'glow 2s ease-in-out infinite alternate'
          }}
        />
      )}
    </button>
  );
}