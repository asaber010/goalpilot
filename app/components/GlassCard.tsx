'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
  onClick?: () => void;
}

export default function GlassCard({ 
  children, 
  className = "", 
  hover = true,
  glow = true,
  onClick 
}: GlassCardProps) {
  return (
    <motion.div
      whileHover={hover ? { scale: 1.01 } : undefined}
      whileTap={onClick ? { scale: 0.99 } : undefined}
      onClick={onClick}
      className={`
        relative overflow-hidden
        bg-white/[0.03] 
        backdrop-blur-xl 
        border border-white/[0.05] 
        rounded-2xl 
        shadow-[0_8px_30px_rgb(0,0,0,0.12)]
        transition-all duration-300
        ${hover ? 'hover:bg-white/[0.05] hover:border-white/10' : ''}
        ${glow ? 'hover:shadow-[0_0_20px_rgba(168,85,247,0.15)]' : ''}
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `}
    >
      {children}
    </motion.div>
  );
}
