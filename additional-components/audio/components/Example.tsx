import React from 'react';
import { MicrophoneComponent } from './MicrophoneComponent';
import { audioAPI } from '../services/audioAPI';

// Example usage of the MicrophoneComponent
export function ExampleUsage() {
  // Custom API handler
  const handleTranscription = async (transcription: string) => {
    try {
      // Option 1: Use the default API service
      await audioAPI.sendTranscription(transcription);
      
      // Option 2: Custom API call
      // const response = await fetch('/api/custom-endpoint', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ text: transcription })
      // });
      
      console.log('Successfully sent transcription:', transcription);
    } catch (error) {
      console.error('Failed to send transcription:', error);
      throw error; // Re-throw to show error in UI
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Voice Transcription Example</h1>
      
      <div className="space-y-6">
        {/* Basic usage */}
        <div>
          <h2 className="text-lg font-semibold mb-2">Basic Usage</h2>
          <MicrophoneComponent />
        </div>

        {/* With custom API handler */}
        <div>
          <h2 className="text-lg font-semibold mb-2">With Custom API</h2>
          <MicrophoneComponent 
            onSendTranscription={handleTranscription}
            placeholder="Start speaking to transcribe your voice..."
          />
        </div>

        {/* Different sizes */}
        <div>
          <h2 className="text-lg font-semibold mb-2">Different Sizes</h2>
          <div className="flex items-center gap-4">
            <MicrophoneComponent buttonSize="sm" />
            <MicrophoneComponent buttonSize="md" />
            <MicrophoneComponent buttonSize="lg" />
          </div>
        </div>
      </div>

      <div className="mt-8 p-4 bg-gray-100 rounded-lg">
        <h3 className="font-semibold mb-2">How to use:</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>Click the microphone button to expand the text editor</li>
          <li>Click the microphone again to start recording</li>
          <li>Speak clearly into your microphone</li>
          <li>The text will appear in real-time as you speak</li>
          <li>Sends transcription every 2 seconds of silence while continuing to record</li>
          <li>You can also edit the text manually and press Ctrl+Enter to send</li>
          <li>Click the microphone again to stop the recording session</li>
        </ol>
      </div>
    </div>
  );
}