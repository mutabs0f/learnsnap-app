import confetti from 'canvas-confetti';

export const useConfetti = () => {
  const celebrate = (type: 'correct' | 'success' | 'perfect' = 'correct') => {
    if (type === 'correct') {
      // 3-burst confetti effect
      // First burst: center
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#58CC02', '#89E219', '#FFC800'],
      });
      
      // Second burst: left (after 250ms)
      setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#1CB0F6', '#58CC02', '#FFC800'],
        });
      }, 250);
      
      // Third burst: right (after 400ms)
      setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ['#FF9600', '#58CC02', '#1CB0F6'],
        });
      }, 400);
    } else if (type === 'success') {
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.5 },
        colors: ['#8b5cf6', '#ec4899', '#f59e0b'],
      });
    } else if (type === 'perfect') {
      const duration = 3000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 5,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#a855f7', '#ec4899', '#f59e0b'],
        });
        confetti({
          particleCount: 5,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ['#10b981', '#3b82f6', '#8b5cf6'],
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      frame();
    }
  };

  return { celebrate };
};
