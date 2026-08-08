"use client";

import { useEffect, useState } from "react";
import { motion, animate, AnimatePresence } from "framer-motion";

export type ThankYouPhase = "searching" | "matched" | "generic";

interface ThankYouCardProps {
  phase: ThankYouPhase;
  memberName?: string;
  pointsBefore?: number;
  pointsAfter?: number;
  pointsAdded?: number;
}

const PARTICLE_COUNT = 16;

interface Particle {
  angle: number;
  distance: number;
  delay: number;
  symbol: string;
}

// Impure (Math.random) — only ever called from an effect/timer callback, never during render.
function generateParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    angle: Math.random() * Math.PI * 2,
    distance: 70 + Math.random() * 60,
    delay: Math.random() * 0.15,
    symbol: Math.random() > 0.5 ? "⭐" : "✨",
  }));
}

export default function ThankYouCard({
  phase,
  memberName,
  pointsBefore,
  pointsAfter,
  pointsAdded,
}: ThankYouCardProps) {
  const [revealed, setRevealed] = useState(false);
  const [countUp, setCountUp] = useState<number | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  const displayPoints = countUp ?? pointsBefore ?? 0;

  // Give the "before" number a beat on screen before it explodes into the new total.
  // (phase only ever moves forward to "matched" once per mount, so no reset-on-leave is needed.)
  useEffect(() => {
    if (phase !== "matched") return;
    const revealTimer = setTimeout(() => {
      setParticles(generateParticles());
      setRevealed(true);
    }, 700);
    return () => clearTimeout(revealTimer);
  }, [phase]);

  useEffect(() => {
    if (!revealed || typeof pointsAfter !== "number") return;
    const controls = animate(pointsBefore ?? 0, pointsAfter, {
      duration: 1.1,
      ease: "easeOut",
      onUpdate: (value) => setCountUp(Math.round(value)),
    });
    return () => controls.stop();
  }, [revealed, pointsAfter, pointsBefore]);

  return (
    <motion.div
      className="ty-wrap"
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.3 }}
    >
      <style jsx global>{`
        .ty-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 4.5rem 2.5rem;
          gap: 0.25rem;
        }
        .ty-icon {
          font-size: 4rem;
          margin-bottom: 0.5rem;
        }
        .ty-title {
          font-family: "Playfair Display", serif;
          font-size: 2.75rem;
          font-weight: 900;
          color: #2d241d;
          margin: 0;
        }
        .ty-subtitle {
          font-size: 1.15rem;
          color: #8d6e63;
          font-weight: 600;
          margin: 0.25rem 0 0;
        }
        .ty-status {
          margin-top: 1.75rem;
          font-size: 1rem;
          color: #a0917e;
          font-weight: 600;
        }
        .ty-status-done {
          color: #2d241d;
          font-size: 1.1rem;
        }
        .ty-dots span {
          display: inline-block;
          animation: ty-blink 1.4s infinite;
        }
        .ty-dots span:nth-child(2) {
          animation-delay: 0.2s;
        }
        .ty-dots span:nth-child(3) {
          animation-delay: 0.4s;
        }
        @keyframes ty-blink {
          0%,
          80%,
          100% {
            opacity: 0.2;
          }
          40% {
            opacity: 1;
          }
        }

        .ty-points-panel {
          margin-top: 2rem;
          background: #c51720;
          border-radius: 24px;
          padding: 2rem 3.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }
        .ty-points-label {
          color: #fdf2f2;
          font-size: 0.85rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          opacity: 0.85;
        }
        .ty-points-value-row {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .ty-star {
          font-size: 2.25rem;
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
        }
        .ty-points-value {
          font-family: "Playfair Display", serif;
          font-size: 3.5rem;
          font-weight: 900;
          color: #ffffff;
          min-width: 2.5ch;
          text-align: left;
        }
        .ty-burst {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 0;
          height: 0;
          pointer-events: none;
        }
        .ty-particle {
          position: absolute;
          left: 0;
          top: 0;
          font-size: 1.25rem;
          transform: translate(-50%, -50%);
        }
        .ty-points-badge {
          margin-top: 0.5rem;
          background: #fff8e1;
          color: #8a6d00;
          font-weight: 800;
          font-size: 1rem;
          padding: 0.4rem 1.1rem;
          border-radius: 999px;
        }
      `}</style>

      <motion.div
        className="ty-icon"
        initial={{ scale: 0, rotate: -15 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.1 }}
      >
        🎉
      </motion.div>

      <h2 className="ty-title">Terima Kasih!</h2>
      <p className="ty-subtitle">
        {phase === "matched" && memberName ? `Sampai jumpa lagi, ${memberName}!` : "Sampai jumpa lagi!"}
      </p>

      <AnimatePresence mode="wait">
        {phase === "searching" && (
          <motion.p
            key="searching"
            className="ty-status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            Memeriksa poin member
            <span className="ty-dots">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </motion.p>
        )}

        {phase === "generic" && (
          <motion.p
            key="generic"
            className="ty-status ty-status-done"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            Pesanan Anda telah selesai. Selamat menikmati! ✨
          </motion.p>
        )}

        {phase === "matched" && typeof pointsAfter === "number" && (
          <motion.div
            key="points"
            className="ty-points-panel"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <span className="ty-points-label">Poin Anda</span>
            <div className="ty-points-value-row">
              <span className="ty-star">⭐</span>
              <span className="ty-points-value">{displayPoints.toLocaleString("id-ID")}</span>
              <div className="ty-burst" aria-hidden={!revealed}>
                {revealed &&
                  particles.map((particle, index) => (
                    <motion.span
                      key={index}
                      className="ty-particle"
                      initial={{ x: 0, y: 0, opacity: 1, scale: 0.4 }}
                      animate={{
                        x: Math.cos(particle.angle) * particle.distance,
                        y: Math.sin(particle.angle) * particle.distance,
                        opacity: 0,
                        scale: 1,
                      }}
                      transition={{ duration: 0.9, delay: particle.delay, ease: "easeOut" }}
                    >
                      {particle.symbol}
                    </motion.span>
                  ))}
              </div>
            </div>

            <AnimatePresence>
              {revealed && !!pointsAdded && (
                <motion.span
                  className="ty-points-badge"
                  initial={{ opacity: 0, scale: 0.5, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.15 }}
                >
                  +{pointsAdded.toLocaleString("id-ID")} poin
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
