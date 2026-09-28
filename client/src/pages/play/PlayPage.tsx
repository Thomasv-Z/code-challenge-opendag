import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '../../store/game';
import { StartScreen } from './StartScreen';
import { RunScreen } from './RunScreen';
import { FinishScreen } from './FinishScreen';

export function PlayPage() {
  const phase = useGame((s) => s.phase);
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={phase}
        style={{ height: '100%' }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        {phase === 'start' && <StartScreen />}
        {phase === 'run' && <RunScreen />}
        {phase === 'finish' && <FinishScreen />}
      </motion.div>
    </AnimatePresence>
  );
}
