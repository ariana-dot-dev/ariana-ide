import { CanvasElement, ElementTargets } from "./types";

export interface AudioConfig {
  buttonSize?: 'sm' | 'md' | 'lg';
  placeholder?: string;
  autoExpand?: boolean;
  onSendTranscription?: (transcription: string) => Promise<void>;
}

export class Audio {
  private _targets: ElementTargets;
  private _config: AudioConfig;

  constructor(config: AudioConfig = {}) {
    this._targets = {
      size: "small",
      aspectRatio: 16 / 9, // Wide aspect ratio for expanded state
      area: "top-right", // Good spot for audio controls
    };
    this._config = config;
  }

  targets(): ElementTargets {
    return this._targets;
  }

  updateTargets(newTargets: Partial<ElementTargets>): void {
    this._targets = { ...this._targets, ...newTargets };
  }

  get config(): AudioConfig {
    return this._config;
  }

  updateConfig(newConfig: Partial<AudioConfig>): void {
    this._config = { ...this._config, ...newConfig };
  }

  static canvasElement(
    config: AudioConfig = {},
    weight: number = 1,
  ): CanvasElement {
    return new CanvasElement({ audio: new Audio(config) }, weight);
  }

  // Helper methods for creating different audio configurations
  static createMicrophone(
    onSendTranscription?: (transcription: string) => Promise<void>,
    weight: number = 1,
  ): CanvasElement {
    const config: AudioConfig = {
      buttonSize: 'md',
      placeholder: 'Speak your message...',
      onSendTranscription,
    };
    return Audio.canvasElement(config, weight);
  }

  static createCompactMicrophone(
    onSendTranscription?: (transcription: string) => Promise<void>,
    weight: number = 1,
  ): CanvasElement {
    const config: AudioConfig = {
      buttonSize: 'sm',
      placeholder: 'Voice input...',
      onSendTranscription,
    };
    return Audio.canvasElement(config, weight);
  }
} 