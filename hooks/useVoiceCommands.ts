import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

export type VoiceCommand = 'NEXT' | 'PREVIOUS' | 'REPEAT' | 'UNKNOWN';

interface UseVoiceCommandsProps {
  onCommand: (command: VoiceCommand) => void;
  active?: boolean;
}

export function useVoiceCommands({ onCommand, active = true }: UseVoiceCommandsProps) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseCommand = useCallback((text: string): VoiceCommand => {
    const normalized = text.toLowerCase().replace(/\s+/g, '');
    
    // 次へ進むコマンド
    if (
      normalized.includes('次') || 
      normalized.includes('できた') || 
      normalized.includes('終わった') || 
      normalized.includes('ok') || 
      normalized.includes('オーケー') ||
      normalized.includes('次へ')
    ) {
      return 'NEXT';
    }
    
    // 前に戻るコマンド
    if (
      normalized.includes('前') || 
      normalized.includes('戻って') || 
      normalized.includes('バック')
    ) {
      return 'PREVIOUS';
    }
    
    // もう一回コマンド
    if (
      normalized.includes('もう一回') || 
      normalized.includes('もう1回') || 
      normalized.includes('リピート') || 
      normalized.includes('え') || 
      normalized.includes('何') || 
      normalized.includes('なんて')
    ) {
      return 'REPEAT';
    }

    return 'UNKNOWN';
  }, []);

  useSpeechRecognitionEvent('result', (event) => {
    if (!active) return;
    
    const transcript = event.results[0]?.transcript;
    if (!transcript) return;
    
    const command = parseCommand(transcript);
    
    if (command !== 'UNKNOWN') {
      onCommand(command);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    console.error('Speech recognition error:', event.error, event.message);
    setError(event.message);
    setIsListening(false);
  });

  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
    setError(null);
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
    
    // Auto-restart if still active
    if (active) {
      setTimeout(() => {
        startListening();
      }, 500);
    }
  });

  const startListening = useCallback(async () => {
    if (!active) return;
    
    try {
      if (Platform.OS !== 'web') {
        const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!granted) {
          setError('マイクへのアクセスが許可されていません');
          return;
        }
      }

      await ExpoSpeechRecognitionModule.start({
        lang: 'ja-JP',
        interimResults: false,
        continuous: true,
      });
      setIsListening(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '音声認識の開始に失敗しました');
      setIsListening(false);
    }
  }, [active]);

  const stopListening = useCallback(async () => {
    try {
      await ExpoSpeechRecognitionModule.stop();
      setIsListening(false);
    } catch (e) {
      console.error('Failed to stop listening', e);
    }
  }, []);

  useEffect(() => {
    if (active && !isListening) {
      startListening();
    } else if (!active && isListening) {
      stopListening();
    }

    return () => {
      if (isListening) {
        stopListening();
      }
    };
  }, [active, startListening, stopListening, isListening]);

  return {
    isListening,
    error,
    startListening,
    stopListening,
  };
}
