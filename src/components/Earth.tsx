import { motion } from "framer-motion";

const EARTH_SRC = `${import.meta.env.BASE_URL}assets/images/earth.png`;

const STARS = [
  { x: 12, y: 18, s: 2, o: 0.5 }, { x: 26, y: 9, s: 1, o: 0.35 },
  { x: 78, y: 14, s: 2, o: 0.45 }, { x: 91, y: 31, s: 1, o: 0.4 },
  { x: 8, y: 58, s: 1, o: 0.3 }, { x: 89, y: 72, s: 2, o: 0.35 },
  { x: 19, y: 84, s: 1, o: 0.45 }, { x: 68, y: 91, s: 1, o: 0.3 },
  { x: 43, y: 6, s: 1, o: 0.4 }, { x: 58, y: 96, s: 2, o: 0.3 },
];

interface EarthProps {
  scanning?: boolean;
}

export function Earth({ scanning = false }: EarthProps) {
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
        className="moon"
        animate={{ y: scanning ? [0, -6, 0] : [0, -4, 0] }}
        transition={{ duration: scanning ? 3 : 9, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="earth-halo"
        animate={
          scanning
            ? { scale: [1, 1.12, 1], opacity: [0.25, 0.7, 0.25] }
            : { scale: 1, opacity: 0.4 }
        }
        transition={{ duration: scanning ? 1.6 : 5, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.img
        src={EARTH_SRC}
        alt=""
        className="earth-planet"
        draggable={false}
        animate={
          scanning
            ? { scale: [1, 1.04, 1], rotate: [0, 2, -2, 0] }
            : { scale: 1, y: [0, -7, 0], rotate: 0 }
        }
        transition={
          scanning
            ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
            : { y: { duration: 7, repeat: Infinity, ease: "easeInOut" }, default: { duration: 0.6 } }
        }
      />
    </div>
  );
}
