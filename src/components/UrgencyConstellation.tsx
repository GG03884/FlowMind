import React, { useEffect, useRef } from "react";
import { Task } from "../types";

interface UrgencyConstellationProps {
  tasks: Task[];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  glow: number;
}

export default function UrgencyConstellation({ tasks }: UrgencyConstellationProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    // Handle resizing fluidly as required by instructions
    const handleResize = () => {
      canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
    };
    handleResize();

    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(() => {
        handleResize();
      });
    });
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    // Calculate urgency metrics from tasks
    const activeTasks = tasks.filter(t => t.status !== "completed");
    const highPriorityCount = activeTasks.filter(t => t.priority === "high").length;
    const mediumPriorityCount = activeTasks.filter(t => t.priority === "medium").length;
    const totalActiveCount = activeTasks.length;

    // Determine color shift and speed based on urgency
    // Normal: slow, calm teal/indigo
    // High Urgency: faster, glowing warm orange/crimson
    let baseSpeed = 0.5 + totalActiveCount * 0.15;
    if (highPriorityCount > 0) baseSpeed += 0.5;
    baseSpeed = Math.min(baseSpeed, 4.0); // cap speed

    let particleCount = 20 + totalActiveCount * 4;
    particleCount = Math.min(particleCount, 80); // cap count

    // Generate colors depending on state
    const getThemeColor = () => {
      if (highPriorityCount > 0) {
        return {
          r: 239, // red-500
          g: 68,
          b: 68,
          glowColor: "rgba(239, 68, 68, 0.4)"
        };
      } else if (mediumPriorityCount > 0) {
        return {
          r: 245, // amber-500
          g: 158,
          b: 11,
          glowColor: "rgba(245, 158, 11, 0.3)"
        };
      } else {
        return {
          r: 99, // indigo-500
          g: 102,
          b: 241,
          glowColor: "rgba(99, 102, 241, 0.2)"
        };
      }
    };

    const theme = getThemeColor();

    // Create particles
    const particles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.2 + Math.random() * 0.8) * baseSpeed;
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 1.5 + Math.random() * 3,
        color: `rgba(${theme.r + Math.floor(Math.random() * 30 - 15)}, ${theme.g + Math.floor(Math.random() * 30 - 15)}, ${theme.b + Math.floor(Math.random() * 30 - 15)}, ${0.4 + Math.random() * 0.5})`,
        glow: 5 + Math.random() * 15
      });
    }

    // Animation Loop
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Render connectors
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Connection threshold
          const limit = 130 + (highPriorityCount * 10);
          if (dist < limit) {
            const alpha = (1 - dist / limit) * (highPriorityCount > 0 ? 0.25 : 0.15);
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(${theme.r}, ${theme.g}, ${theme.b}, ${alpha})`;
            ctx.lineWidth = highPriorityCount > 0 ? 1.5 : 1.0;
            ctx.stroke();
          }
        }
      }

      // Render and update particles
      particles.forEach(p => {
        // Move
        p.x += p.vx;
        p.y += p.vy;

        // Bounce/Wrap edges
        if (p.x < 0) { p.x = canvas.width; }
        else if (p.x > canvas.width) { p.x = 0; }

        if (p.y < 0) { p.y = canvas.height; }
        else if (p.y > canvas.height) { p.y = 0; }

        // Draw particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        
        // Glow effect
        ctx.shadowBlur = p.glow;
        ctx.shadowColor = `rgba(${theme.r}, ${theme.g}, ${theme.b}, 0.8)`;
        ctx.fill();

        // Reset shadow
        ctx.shadowBlur = 0;
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, [tasks]);

  return (
    <canvas
      id="urgency-constellation"
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none opacity-40 z-0 transition-opacity duration-1000"
    />
  );
}
