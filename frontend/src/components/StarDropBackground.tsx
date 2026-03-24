'use client';

import React, { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
  drift: number;
  twinkleSpeed: number;
  twinkleOffset: number;
}

const StarDropBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const starsRef = useRef<Star[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const STAR_COUNT = 60;

    const createStar = (fullHeight = true): Star => {
      const w = canvas.width;
      const h = canvas.height;
      return {
        x: Math.random() * w,
        y: fullHeight ? Math.random() * h : -Math.random() * 40,
        size: 0.4 + Math.random() * 1.8,
        speed: 0.15 + Math.random() * 0.6,
        opacity: 0.15 + Math.random() * 0.7,
        drift: (Math.random() - 0.5) * 0.3,
        twinkleSpeed: 0.5 + Math.random() * 2,
        twinkleOffset: Math.random() * Math.PI * 2,
      };
    };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';

      starsRef.current = Array.from({ length: STAR_COUNT }, () => createStar(true));
    };

    window.addEventListener('resize', resize);
    resize();

    let time = 0;
    const FRAME_INTERVAL = 1000 / 30;
    let lastFrame = 0;

    const render = (now: number) => {
      animFrameRef.current = requestAnimationFrame(render);
      if (now - lastFrame < FRAME_INTERVAL) return;
      lastFrame = now;

      const w = canvas.width;
      const h = canvas.height;
      const dt = 0.033;
      time += dt;

      ctx.clearRect(0, 0, w, h);

      for (const star of starsRef.current) {
        star.y += star.speed;
        star.x += star.drift;

        if (star.y > h + 5 || star.x < -5 || star.x > w + 5) {
          star.y = -Math.random() * 30;
          star.x = Math.random() * w;
          star.speed = 0.15 + Math.random() * 0.6;
          star.opacity = 0.15 + Math.random() * 0.7;
          star.size = 0.4 + Math.random() * 1.8;
        }

        const twinkle = 0.5 + 0.5 * Math.sin(time * star.twinkleSpeed + star.twinkleOffset);
        const alpha = star.opacity * (0.4 + 0.6 * twinkle);

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();

        if (star.size > 1.4) {
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(180, 160, 255, ${alpha * 0.1})`;
          ctx.fill();
        }
      }
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed top-0 left-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  );
};

export default StarDropBackground;
