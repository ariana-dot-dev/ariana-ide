import React, { createContext, useContext, useReducer, useRef, useCallback } from 'react';
import { AudioContextState, AudioContextActions, SpeechRecognitionResult } from '../types';

interface AudioContextValue extends AudioContextState, AudioContextActions {}

const AudioContext = createContext<AudioContextValue | null>(null);

type AudioAction = 
  | { type: 'START_RECORDING' }
  | { type: 'STOP_RECORDING' }
  | { type: 'START_LISTENING' }
  | { type: 'STOP_LISTENING' }
  | { type: 'UPDATE_TRANSCRIPTION'; payload: string }
  | { type: 'SET_PROCESSING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

const initialState: AudioContextState = {
  isRecording: false,
  isListening: false,
  transcription: '',
  isProcessing: false,
  error: null,
};

function audioReducer(state: AudioContextState, action: AudioAction): AudioContextState {
  switch (action.type) {
    case 'START_RECORDING':
      return { ...state, isRecording: true, error: null };
    case 'STOP_RECORDING':
      return { ...state, isRecording: false };
    case 'START_LISTENING':
      return { ...state, isListening: true };
    case 'STOP_LISTENING':
      return { ...state, isListening: false };
    case 'UPDATE_TRANSCRIPTION':
      return { ...state, transcription: action.payload };
    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    default:
      return state;
  }
}

interface AudioProviderProps {
  children: React.ReactNode;
  onSendTranscription?: (transcription: string) => Promise<void>;
}

export function AudioProvider({ children, onSendTranscription }: AudioProviderProps) {
  const [state, dispatch] = useReducer(audioReducer, initialState);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const isRecordingRef = useRef<boolean>(false);

  const initSpeechRecognition = useCallback(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      dispatch({ type: 'SET_ERROR', payload: 'Speech recognition not supported in this browser' });
      return null;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognition.onstart = () => {
      console.log('Speech recognition started');
      dispatch({ type: 'START_LISTENING' });
    };
    
    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      const currentTranscription = state.transcription + finalTranscript + interimTranscript;
      dispatch({ type: 'UPDATE_TRANSCRIPTION', payload: currentTranscription });
      
      // Handle silence detection for sending
      if (finalTranscript.trim()) {
        // Reset silence timer when we get new final results
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }
        
        // Set timer to send after 2 seconds of silence
        silenceTimerRef.current = setTimeout(async () => {
          const textToSend = currentTranscription.trim();
          if (textToSend && isRecordingRef.current) {
            try {
              dispatch({ type: 'SET_PROCESSING', payload: true });
              if (onSendTranscription) {
                await onSendTranscription(textToSend);
              }
              dispatch({ type: 'UPDATE_TRANSCRIPTION', payload: '' });
            } catch (error) {
              dispatch({ type: 'SET_ERROR', payload: `Failed to send transcription: ${error instanceof Error ? error.message : 'Unknown error'}` });
            } finally {
              dispatch({ type: 'SET_PROCESSING', payload: false });
            }
          }
        }, 2000);
      }
    };
    
    recognition.onerror = (event) => {
      console.log('Speech recognition error:', event.error);
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        dispatch({ type: 'SET_ERROR', payload: `Speech recognition error: ${event.error}` });
      }
    };
    
    recognition.onend = () => {
      console.log('Speech recognition ended');
      dispatch({ type: 'STOP_LISTENING' });
      
      // Restart if we should still be recording
      if (isRecordingRef.current) {
        setTimeout(() => {
          if (isRecordingRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (error) {
              console.log('Failed to restart recognition:', error);
            }
          }
        }, 100);
      }
    };
    
    return recognition;
  }, [state.transcription, onSendTranscription]);

  const startRecording = useCallback(async () => {
    try {
      dispatch({ type: 'SET_ERROR', payload: null });
      
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Initialize MediaRecorder for audio recording
      mediaRecorderRef.current = new MediaRecorder(stream);
      
      // Initialize Speech Recognition
      recognitionRef.current = initSpeechRecognition();
      if (!recognitionRef.current) return;
      
      isRecordingRef.current = true;
      dispatch({ type: 'START_RECORDING' });
      
      mediaRecorderRef.current.start();
      recognitionRef.current.start();
      
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: `Failed to start recording: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  }, [initSpeechRecognition]);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    
    dispatch({ type: 'STOP_RECORDING' });
    dispatch({ type: 'STOP_LISTENING' });
  }, []);

  const updateTranscription = useCallback((text: string) => {
    dispatch({ type: 'UPDATE_TRANSCRIPTION', payload: text });
  }, []);

  const sendTranscription = useCallback(async () => {
    if (!state.transcription.trim()) return;
    
    try {
      dispatch({ type: 'SET_PROCESSING', payload: true });
      
      if (onSendTranscription) {
        await onSendTranscription(state.transcription);
      }
      
      dispatch({ type: 'UPDATE_TRANSCRIPTION', payload: '' });
      
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: `Failed to send transcription: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  }, [state.transcription, onSendTranscription]);

  const setError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: error });
  }, []);

  const value: AudioContextValue = {
    ...state,
    startRecording,
    stopRecording,
    updateTranscription,
    sendTranscription,
    setError,
  };

  return (
    <AudioContext.Provider value={value}>
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio(): AudioContextValue {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
}

// Extend Window interface for Speech Recognition
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}