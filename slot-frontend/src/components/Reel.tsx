import { motion } from 'framer-motion';
import './Reel.css';

export default function Reel({ symbol, isSpinning, delay = 0 }: { symbol: string; isSpinning: boolean; delay?: number; }) {
  return (
    <div className="reel">
      <motion.div
        className="reel-symbol"
        style={{ transformStyle: 'preserve-3d' }}
        animate={isSpinning
          ? { y: [0, -18, 0], scale: [1, 1.08, 1], rotateY: [0, 180, 360] }
          : { y: 0, scale: 1, rotateY: 0 }
        }
        transition={isSpinning
          ? { duration: 0.45, delay, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 0.2, ease: 'easeOut' }
        }
      >
        <div className="symbol-container">
          <span className="symbol">{symbol}</span>
        </div>
      </motion.div>
    </div>
  );
}


