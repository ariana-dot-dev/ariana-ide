// Main exports for the audio feature
export { MicrophoneComponent } from './components/MicrophoneComponent';
export { MicrophoneButton } from './components/MicrophoneButton';
export { TranscriptionEditor } from './components/TranscriptionEditor';
export { AudioProvider, useAudio } from './services/AudioContext';
export { AudioAPI, audioAPI } from './services/audioAPI';
export type { 
  AudioContextState, 
  AudioContextActions, 
  SpeechRecognitionResult, 
  AudioAPIRequest 
} from './types';