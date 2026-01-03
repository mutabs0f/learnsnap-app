import { useState, useEffect, useCallback } from 'react';

export const useSoundEffects = () => {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('soundEnabled');
    return stored !== 'false';
  });

  useEffect(() => {
    localStorage.setItem('soundEnabled', enabled ? 'true' : 'false');
  }, [enabled]);

  const playSound = useCallback((soundName: string) => {
    if (!enabled) return;
    
    try {
      const audio = new Audio(`/sounds/${soundName}.mp3`);
      audio.volume = 0.3;
      audio.play().catch(() => {
      });
    } catch {
    }
  }, [enabled]);

  const playCorrect = useCallback(() => playSound('correct'), [playSound]);
  const playWrong = useCallback(() => playSound('wrong'), [playSound]);
  const playClick = useCallback(() => playSound('click'), [playSound]);
  const playSuccess = useCallback(() => playSound('success'), [playSound]);

  const toggle = useCallback(() => setEnabled(prev => !prev), []);

  return {
    playCorrect,
    playWrong,
    playClick,
    playSuccess,
    enabled,
    toggle,
  };
};
