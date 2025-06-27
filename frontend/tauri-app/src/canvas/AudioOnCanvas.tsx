import { motion, type PanInfo } from "framer-motion";
import type React from "react";
import { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "../utils";
import type { Audio, AudioConfig } from "./Audio";
import type { CanvasElement, ElementLayout } from "./types";

// Extend Window interface for Speech Recognition
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
    __TAURI__: any;
  }
}

interface AudioOnCanvasProps {
  layout: ElementLayout;
  onDragStart: (element: CanvasElement) => void;
  onDragEnd: (element: CanvasElement) => void;
  onDrag: (
    event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => void;
  onAudioUpdate: (element: Audio, newConfig: AudioConfig) => void;
  onRemoveElement: (elementId: string) => void;
  isDragTarget: boolean;
  isDragging: boolean;
}

// Check if we're running in Tauri
const isTauri = () => {
  return typeof window !== 'undefined' && window.__TAURI__;
};

// Simple microphone button component
const MicrophoneButton: React.FC<{
  isRecording: boolean;
  onToggle: () => void;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}> = ({ isRecording, onToggle, size = 'md', disabled = false }) => {
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

  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        sizeClasses[size],
        "relative rounded-full transition-all duration-300 focus:outline-none",
        "flex items-center justify-center",
        "backdrop-blur-md bg-white/10 border border-white/20",
        "hover:bg-white/20 hover:border-white/30",
        "shadow-lg hover:shadow-xl",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        isRecording ? "bg-red-500/20 border-red-300/40 hover:bg-red-500/30" : ""
      )}
      title={disabled ? 'Speech recognition not available' : (isRecording ? 'Stop Recording' : 'Start Recording')}
    >
      {isRecording ? (
        <svg
          className={cn(iconSizeClasses[size], "text-red-400")}
          fill="currentColor"
          viewBox="0 0 16 16"
        >
          <path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h2a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 9 14H7a1.5 1.5 0 0 1-1.5-1.5z"/>
        </svg>
      ) : (
        <svg
          className={cn(iconSizeClasses[size], "text-white")}
          fill="currentColor"
          viewBox="0 0 16 16"
        >
          <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5"/>
          <path d="M10 8a2 2 0 1 1-4 0V3a2 2 0 1 1 4 0zM8 0a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V3a3 3 0 0 0-3-3"/>
        </svg>
      )}

      {isRecording && (
        <div className="absolute inset-0 rounded-full border-2 border-red-400 animate-pulse" />
      )}
    </button>
  );
};

const AudioOnCanvas: React.FC<AudioOnCanvasProps> = ({
  layout,
  onDragStart: propOnDragStart,
  onDragEnd: propOnDragEnd,
  onDrag: propOnDrag,
  onAudioUpdate,
  onRemoveElement,
  isDragTarget,
  isDragging,
}) => {
  const { cell, element } = layout;
  const [isHovered, setIsHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  const [isTauriEnv, setIsTauriEnv] = useState(false);
  const recognitionRef = useRef<any>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpeechTimeRef = useRef<number>(0);

  if (!("audio" in element.kind)) {
    throw new Error("Invalid kind");
  }

  const audio = element.kind.audio;

  // Check browser support and permissions on mount
  useEffect(() => {
    const tauriDetected = isTauri();
    setIsTauriEnv(tauriDetected);
    
    console.log('Environment detection:', {
      isTauri: tauriDetected,
      hasMediaDevices: !!navigator.mediaDevices,
      hasGetUserMedia: !!(navigator.mediaDevices?.getUserMedia),
      hasSpeechRecognition: !!(window.SpeechRecognition || window.webkitSpeechRecognition)
    });

    const checkSupport = () => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setIsSupported(false);
        setError('Speech recognition is not supported in this browser. Try Chrome, Edge, or Safari.');
        return;
      }

      // In Tauri, we can still use Speech Recognition even without mediaDevices
      if (tauriDetected) {
        console.log('✅ Tauri environment detected - Speech recognition available without mediaDevices');
        setIsSupported(true);
        setPermissionStatus('granted'); // Assume granted in Tauri
        return;
      }

      // Check if we're in a secure context (HTTPS or localhost) for web browsers
      if (!window.isSecureContext) {
        setError('Speech recognition requires a secure context (HTTPS or localhost)');
        return;
      }

      console.log('Speech recognition is supported');
    };

    const checkPermissions = async () => {
      // Skip permission check in Tauri environment
      if (tauriDetected) {
        setPermissionStatus('granted');
        return;
      }

      try {
        if (navigator.permissions) {
          const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          setPermissionStatus(permission.state);
          console.log('Microphone permission status:', permission.state);
          
          permission.addEventListener('change', () => {
            setPermissionStatus(permission.state);
            console.log('Microphone permission changed to:', permission.state);
          });
        }
      } catch (error) {
        console.log('Could not check microphone permissions:', error);
      }
    };

    checkSupport();
    checkPermissions();
  }, []);

  const handleDragStartInternal = () => {
    setDragging(true);
    propOnDragStart(element);
  };

  const handleDragEndInternal = () => {
    setDragging(false);
    propOnDragEnd(element);
  };

  const handleRemove = () => {
    if (isRecording) {
      stopRecording();
    }
    
    // Clean up silence timeout
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    
    onRemoveElement(element.id);
  };

  const startRecording = useCallback(async () => {
    console.log('🎤 Starting recording...');
    setError(null);
    
    try {
      // Always request microphone permission to trigger macOS dialog
      console.log('Requesting microphone access...');
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 44100,
              channelCount: 1
            } 
          });
          console.log('✅ Microphone access granted');
          console.log('Stream details:', {
            active: stream.active,
            tracks: stream.getTracks().length,
            trackSettings: stream.getTracks()[0]?.getSettings()
          });
          
          // Stop the stream immediately as we only needed it for permission
          stream.getTracks().forEach(track => track.stop());
        } catch (mediaError: any) {
          console.warn('⚠️ MediaDevices permission failed:', mediaError);
          console.warn('Error name:', mediaError.name);
          console.warn('Error message:', mediaError.message);
          
          if (!isTauriEnv) {
            // In web browsers, this is a hard error
            throw mediaError;
          }
          // In Tauri, we can continue without mediaDevices
          console.log('🏗️ Continuing in Tauri environment without mediaDevices');
        }
      } else {
        console.log('📱 MediaDevices API not available');
        if (!isTauriEnv) {
          throw new Error('MediaDevices API not available');
        }
      }
      
      // Initialize Speech Recognition
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        throw new Error('Speech recognition not supported');
      }

      console.log('🎯 Creating speech recognition instance...');
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;
      
      // Add additional configuration for better results
      if ('grammars' in recognition) {
        // Some browsers support grammar hints
        console.log('🎯 Speech recognition supports grammars');
      }

      console.log('🎯 Speech recognition configured with:', {
        continuous: recognition.continuous,
        interimResults: recognition.interimResults,
        lang: recognition.lang,
        maxAlternatives: recognition.maxAlternatives
      });

      recognition.onstart = () => {
        console.log('🎤 Speech recognition started successfully');
        setIsRecording(true);
        setIsExpanded(true);
        setError(null);
      };

      recognition.onresult = (event: any) => {
        console.log('📝 Speech recognition result event:', {
          resultIndex: event.resultIndex,
          resultsLength: event.results.length
        });
        
        // Update last speech time
        lastSpeechTimeRef.current = Date.now();
        
        // Clear existing silence timeout
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
        
        let finalTranscript = '';
        let interimText = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          const confidence = event.results[i][0].confidence;
          
          console.log(`Result ${i}: "${transcript}" (confidence: ${confidence}, final: ${event.results[i].isFinal})`);
          
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimText += transcript;
          }
        }
        
        if (finalTranscript) {
          console.log('✅ Final transcript:', finalTranscript);
          setTranscription(prev => prev + finalTranscript);
          setInterimTranscript('');
        } else if (interimText) {
          console.log('⏳ Interim transcript:', interimText);
          setInterimTranscript(interimText);
        }
        
        // Set timeout for auto-send after 2 seconds of silence
        silenceTimeoutRef.current = setTimeout(async () => {
          // Get the current transcription state at the time of timeout
          setTranscription(currentTranscript => {
            if (currentTranscript.trim() && audio.config.onSendTranscription) {
              console.log('🔄 Auto-sending after 2 seconds of silence:', currentTranscript);
              audio.config.onSendTranscription(currentTranscript.trim())
                .then(() => {
                  setTranscription('');
                  setInterimTranscript('');
                })
                .catch((error) => {
                  console.error('Failed to auto-send transcription:', error);
                  setError('Failed to send transcription');
                });
            }
            return currentTranscript; // Return unchanged for this setter
          });
        }, 2000);
      };

      recognition.onend = () => {
        console.log('🛑 Speech recognition ended');
        setIsRecording(false);
        setInterimTranscript('');
        
        // Auto-restart if we were recording and it ended unexpectedly
        if (recognitionRef.current === recognition && isRecording) {
          console.log('🔄 Speech recognition ended unexpectedly, restarting...');
          setTimeout(() => {
            if (recognitionRef.current === recognition) {
              try {
                recognition.start();
                console.log('✅ Speech recognition restarted');
              } catch (restartError) {
                console.error('❌ Failed to restart recognition:', restartError);
                setError('Speech recognition stopped unexpectedly and could not restart');
              }
            }
          }, 100);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('❌ Speech recognition error:', event.error, event);
        console.error('Full error event:', {
          error: event.error,
          message: event.message,
          timeStamp: event.timeStamp
        });
        
        let errorMessage = 'Speech recognition error: ';
        
        switch (event.error) {
          case 'no-speech':
            errorMessage += 'No speech detected. The microphone is working but no speech was heard. Try speaking louder or closer to the microphone.';
            // Don't stop recording for no-speech, it will auto-restart
            return;
          case 'audio-capture':
            errorMessage += 'Audio capture failed. Please check:\n';
            errorMessage += '• Microphone permissions in System Settings → Privacy & Security → Microphone\n';
            errorMessage += '• Microphone is not being used by another app\n';
            errorMessage += '• Microphone hardware is working properly';
            break;
          case 'not-allowed':
            errorMessage += 'Speech recognition access denied. This might be due to:\n';
            errorMessage += '1. Microphone permissions not granted\n';
            errorMessage += '2. Speech recognition blocked by browser/system\n';
            errorMessage += '3. App not trusted by macOS\n\n';
            errorMessage += 'Try: System Settings → Privacy & Security → Microphone → Enable "ariana IDE"';
            break;
          case 'network':
            errorMessage += 'Network error. Speech recognition requires an internet connection. Please check your connection and try again.';
            break;
          case 'service-not-allowed':
            errorMessage += 'Speech service not allowed. This might be due to:\n';
            errorMessage += '• Speech recognition disabled in browser settings\n';
            errorMessage += '• System-level speech recognition permissions\n';
            errorMessage += '• Try: System Settings → Privacy & Security → Speech Recognition';
            break;
          case 'aborted':
            errorMessage += 'Speech recognition was aborted. This usually means no speech was detected for a while. The microphone is working, but try:\n';
            errorMessage += '• Speaking more clearly and loudly\n';
            errorMessage += '• Moving closer to the microphone\n';
            errorMessage += '• Checking microphone volume in system settings';
            break;
          default:
            errorMessage += `${event.error} (see console for details)`;
        }
        
        setError(errorMessage);
        setIsRecording(false);
        setInterimTranscript('');
      };

      recognitionRef.current = recognition;
      console.log('🚀 Starting speech recognition...');
      
      // Add a small delay to ensure everything is ready
      setTimeout(() => {
        try {
          recognition.start();
          console.log('✅ Speech recognition start() called');
        } catch (startError: any) {
          console.error('❌ Failed to start recognition:', startError);
          setError(`Failed to start speech recognition: ${startError.message}`);
          setIsRecording(false);
        }
      }, 100);
      
    } catch (error: any) {
      console.error('❌ Failed to start recording:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      let errorMessage = 'Failed to start recording: ';
      
      if (error.name === 'NotAllowedError') {
        errorMessage += 'Microphone access denied. Please:\n';
        errorMessage += '1. Go to System Settings → Privacy & Security → Microphone\n';
        errorMessage += '2. Enable "ariana IDE"\n';
        errorMessage += '3. Restart the app';
      } else if (error.name === 'NotFoundError') {
        errorMessage += 'No microphone found. Please connect a microphone and try again.';
      } else if (error.name === 'NotSupportedError') {
        errorMessage += 'Your browser does not support microphone access.';
      } else if (error.message === 'MediaDevices API not available') {
        errorMessage += 'MediaDevices API not available in this browser.';
      } else {
        errorMessage += error.message || 'Unknown error occurred.';
      }
      
      setError(errorMessage);
      setIsRecording(false);
    }
  }, [isTauriEnv, isRecording]);

  const stopRecording = useCallback(() => {
    console.log('🛑 Stopping recording...');
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    
    // Clear silence timeout when stopping
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    
    setIsRecording(false);
    setInterimTranscript('');
  }, []);

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleSendTranscription = async () => {
    if (transcription.trim() && audio.config.onSendTranscription) {
      try {
        await audio.config.onSendTranscription(transcription);
        setTranscription("");
        setInterimTranscript("");
        setIsExpanded(false);
      } catch (error) {
        console.error('Failed to send transcription:', error);
        setError('Failed to send transcription');
      }
    }
  };


  const displayText = transcription + (interimTranscript ? ` ${interimTranscript}` : '');

  return (
    <motion.div
      className={cn(
        "absolute p-1 cursor-move select-none overflow-hidden",
        isDragging ? "z-30" : "z-10",
        isDragTarget && "ring-2 ring-[var(--positive-500)]"
      )}
      style={{
        left: cell.x,
        top: cell.y,
        width: cell.width,
        height: cell.height,
      }}
      drag
      dragMomentum={false}
      onDragStart={handleDragStartInternal}
      onDragEnd={handleDragEndInternal}
      onDrag={propOnDrag}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={cn(
        "w-full h-full rounded-md backdrop-blur-md bg-[var(--bg-400)]/90 border border-[var(--fg-600)]/20 overflow-hidden flex flex-col",
        isHovered && "shadow-xl",
        isDragging && "opacity-50"
      )}>
        {/* Header with controls */}
        <div className="flex items-center justify-between p-2 border-b border-[var(--fg-600)]/20 bg-[var(--bg-500)]/50">
          <span className="text-xs font-medium">🎤 Audio {isRecording && '(Recording...)'}</span>
          <button
            onClick={handleRemove}
            className="text-xs w-6 h-6 bg-[var(--fg-800)] hover:bg-[var(--fg-700)] rounded transition-colors text-[var(--bg-white)] flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* Audio Component */}
        <div className="p-4 h-full overflow-hidden flex flex-col">
        {/* Error Display */}
        {error && (
          <div className="mb-3 p-2 bg-red-500/20 border border-red-300/40 rounded text-xs text-red-300">
            {error}
          </div>
        )}


        {/* Permission Status */}
        {!isTauriEnv && permissionStatus === 'denied' && (
          <div className="mb-3 p-2 bg-yellow-500/20 border border-yellow-300/40 rounded text-xs text-yellow-300">
            Microphone access denied. Please enable it in your browser settings.
          </div>
        )}

        <div className="flex items-center gap-3 mb-3">
          <MicrophoneButton
            isRecording={isRecording}
            onToggle={handleToggleRecording}
            size={audio.config.buttonSize || 'md'}
            disabled={!isSupported || (!isTauriEnv && permissionStatus === 'denied')}
          />
          {!isExpanded && (
            <button
              onClick={() => setIsExpanded(true)}
              className={cn(
                "text-xs text-[var(--fg-400)] hover:text-[var(--fg-300)]",
                "px-2 py-1 rounded bg-[var(--bg-600)] hover:bg-[var(--bg-700)]"
              )}
            >
              Expand
            </button>
          )}
        </div>

        {isExpanded && (
          <div className="flex-1 flex flex-col">
            <textarea
              value={displayText}
              onChange={(e) => {
                // Only allow editing if not currently recording
                if (!isRecording) {
                  setTranscription(e.target.value);
                  setInterimTranscript('');
                }
              }}
              placeholder={audio.config.placeholder || "Speak or type your message..."}
              className={cn(
                "flex-1 min-h-[60px] p-2 text-sm",
                "bg-[var(--bg-600)] border border-[var(--fg-800)] rounded",
                "text-[var(--fg-300)] placeholder-[var(--fg-600)]",
                "resize-none focus:outline-none focus:border-[var(--fg-600)]",
                isRecording && "cursor-not-allowed"
              )}
              readOnly={isRecording}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleSendTranscription}
                disabled={!transcription.trim()}
                className={cn(
                  "px-3 py-1 text-xs rounded",
                  "bg-blue-600 hover:bg-blue-500",
                  "text-white disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                Send
              </button>
              <button
                onClick={() => {
                  setTranscription('');
                  setInterimTranscript('');
                }}
                disabled={!displayText.trim()}
                className={cn(
                  "px-3 py-1 text-xs rounded",
                  "bg-[var(--bg-700)] hover:bg-[var(--bg-800)]",
                  "text-[var(--fg-300)] disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                Clear
              </button>
              <button
                onClick={() => setIsExpanded(false)}
                className={cn(
                  "px-3 py-1 text-xs rounded",
                  "bg-[var(--bg-700)] hover:bg-[var(--bg-800)]",
                  "text-[var(--fg-300)]"
                )}
              >
                Collapse
              </button>
            </div>
          </div>
        )}

          {/* Debug Info (only in development) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-2 p-2 bg-[var(--bg-700)] rounded text-xs text-[var(--fg-500)]">
              <div>Environment: {isTauriEnv ? '🏗️ Tauri' : '🌐 Web'}</div>
              <div>Support: {isSupported ? '✅' : '❌'}</div>
              <div>Permission: {permissionStatus}</div>
              <div>Recording: {isRecording ? '🔴' : '⚫'}</div>
              <div>MediaDevices: {navigator.mediaDevices ? '✅' : '❌'}</div>
              <div>GetUserMedia: {(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') ? '✅' : '❌'}</div>
              {interimTranscript && <div>Interim: "{interimTranscript}"</div>}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default AudioOnCanvas; 