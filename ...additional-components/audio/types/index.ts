export interface AudioContextState {
  isRecording: boolean;
  isListening: boolean;
  transcription: string;
  isProcessing: boolean;
  error: string | null;
}

export interface AudioContextActions {
  startRecording: () => void;
  stopRecording: () => void;
  updateTranscription: (text: string) => void;
  sendTranscription: () => Promise<void>;
  setError: (error: string | null) => void;
}

export interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
}

export interface AudioAPIRequest {
  transcription: string;
  timestamp: number;
}