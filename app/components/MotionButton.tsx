'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface MotionButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  type?: 'button' | 'submit';
}

export default function MotionButton({ 
  children, 
  onClick, 
  disabled = false,
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button'
}: MotionButtonProps) {
  const variants = {
    primary: 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/20',
    secondary: 'bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/10',
    ghost: 'bg-transparent hover:bg-white/[0.05] text-white/70 hover:text-white',
    danger: 'bg-red-500/80 hover:bg-red-500 text-white',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <motion.button
      type={type}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      onClick={onClick}
      disabled={disabled}
      className={`
        rounded-lg font-medium transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
    >
      {children}
    </motion.button>
  );
}
