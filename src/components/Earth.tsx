import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { createGlobe, type GlobeHandle } from "../lib/globe";

const MAP_SRC = `${import.meta.env.BASE_URL}assets/images/earth-map.jpg`;
const POSTER_SRC = `${import.meta.env.BASE_URL}assets/images/earth.png`;

const STARS = [
  { x: 12, y: 18, s: 2, o: 0.5 }, { x: 26, y: 9, s: 1, o: 0.35 },
  { x: 78, y: 14, s: 2, o: 0.45 }, { x: 91, y: 31, s: 1, o: 0.4 },
  { x: 8, y: 58, s: 1, o: 0.3 }, { x: 89, y: 72, s: 2, o: 0.35 },
  { x: 19, y: 84, s: 1, o: 0.45 }, { x: 68, y: 91, s: 1, o: 0.3 },
  { x: 43, y: 6, s: 1, o: 0.4 }, { x: 58, y: 96, s: 2, o: 0.3 },
];

// 应用每次启动只做一次「开场自转」，避免每次切页都转一圈显得啰嗦
let introSpinPlayed = false;

interface EarthProps {
  scanning?: boolean;
}

export function Earth({ scanning = false }: EarthProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const globeRef = useRef<GlobeHandle | null>(null);
  const spinPending = useRef(!introSpinPlayed);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      globeRef.current = createGlobe(canvas, {
        mapUrl: MAP_SRC,
        onReady: () => {
          setReady(true);
          if (spinPending.current) {
            spinPending.current = false;
            introSpinPlayed = true;
            globeRef.current?.spinOnce(1, 2400);
          }
        },
      });
    } catch (err) {
      // 老显卡或驱动异常时退回静态图，不让首页开天窗
      console.warn("WebGL 地球不可用，已降级为静态图：", err);
      setFailed(true);
    }

    return () => {
      globeRef.current?.dispose();
      globeRef.current = null;
    };
  }, []);

  useEffect(() => {
    globeRef.current?.setScanning(scanning);
  }, [scanning]);

  return (
    <div className={`earth-scene${scanning ? " is-scanning" : ""}`} aria-hidden="true">
      <div className="star-field">
        {STARS.map((star, i) => (
          <span
            key={i}
            className="star"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.s,
              height: star.s,
              opacity: star.o,
              animationDelay: `${i * 0.7}s`,
            }}
          />
        ))}
      </div>

      <motion.div
        className="earth-halo"
        animate={
          scanning
            ? { scale: [1, 1.12, 1], opacity: [0.25, 0.7, 0.25] }
            : { scale: 1, opacity: 0.4 }
        }
        transition={{ duration: scanning ? 1.6 : 5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* 贴图加载完成前先垫一张静态图，避免出现空档 */}
      {!failed && (
        <img
          src={POSTER_SRC}
          alt=""
          className="earth-planet earth-poster"
          draggable={false}
          style={{ opacity: ready ? 0 : 1 }}
        />
      )}

      {failed ? (
        <img src={POSTER_SRC} alt="" className="earth-planet" draggable={false} />
      ) : (
        <canvas
          ref={canvasRef}
          className={`earth-canvas${ready ? " is-ready" : ""}`}
          role="img"
          aria-label="可拖动旋转的地球"
        />
      )}
    </div>
  );
}
