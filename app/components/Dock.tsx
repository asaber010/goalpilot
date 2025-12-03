'use client';

import { motion } from 'framer-motion';
import { ReactNode, useState } from 'react';

interface DockItem {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

interface DockProps {
  items: DockItem[];
}

export default function Dock({ items }: DockProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <motion.div 
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.5, duration: 0.4 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40"
    >
      <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
        {items.map((item, index) => (
          <motion.button
            key={index}
            onHoverStart={() => setHoveredIndex(index)}
            onHoverEnd={() => setHoveredIndex(null)}
            whileHover={{ scale: 1.15, y: -8 }}
            whileTap={{ scale: 0.95 }}
            onClick={item.onClick}
            className="relative w-12 h-12 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center transition-colors group"
          >
            {item.icon}
            
            {/* Tooltip */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ 
                opacity: hoveredIndex === index ? 1 : 0, 
                y: hoveredIndex === index ? 0 : 10 
              }}
              className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 rounded-lg bg-black/80 backdrop-blur-sm text-white text-xs whitespace-nowrap pointer-events-none"
            >
              {item.label}
            </motion.div>

            {/* Glow effect on hover */}
            <div className="absolute inset-0 rounded-xl bg-purple-500/0 group-hover:bg-purple-500/20 transition-colors" />
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
