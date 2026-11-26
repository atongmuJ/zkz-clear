import { motion } from "framer-motion";
import type { CSSProperties } from "react";
import { Icon } from "./Icon";

const PARTICLES = Array.from({ length: 22 }, (_, i) => ({
  angle: (360 / 22) * i + (i % 3) * 6,
  delay: (i % 8) * 0.12,
  size: i % 5 === 0 ? 4 : i % 3 === 0 ? 2 : 3,
  radius: 88 + (i % 4) * 8,
}));

/** 清理进行中的动效：外圈扩散 + 旋转弧 + 碎屑向心吸入 */
export function CleanPulse() {
  return (
    <div className="clean-anim" aria-hidden="true">
      <motion.span
        className="clean-wave"
        initial={{ scale: 0.6, opacity: 0.55 }}
        animate={{ scale: 1.9, opacity: 0 }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
      />
      <motion.span
        className="clean-wave wave-2"
        initial={{ scale: 0.6, opacity: 0.4 }}
        animate={{ scale: 1.9, opacity: 0 }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: 0.9 }}
      />

      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="junk-particle"
          style={
            {
              "--a": `${p.angle}deg`,
              "--r": `${p.radius}px`,
              "--s": `${p.size}px`,
              animationDelay: `${p.delay}s`,
            } as CSSProperties
          }
        />
      ))}

      <motion.div
        className="cleaning-ring"
        animate={{ rotate: 360 }}
        transition={{ duration: 1.15, repeat: Infinity, ease: "linear" }}
      />
      <span className="clean-core">
        <Icon name="broom" size={17} />
      </span>
    </div>
  );
}
