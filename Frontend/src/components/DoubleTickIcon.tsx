import React from 'react';

interface DoubleTickIconProps {
  className?: string;
  size?: number;
  variant?: 'single' | 'double' | 'secondary';
}

export const DoubleTickIcon: React.FC<DoubleTickIconProps> = ({ 
  className = '', 
  size = 12,
  variant = 'double'
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {variant === 'secondary' ? (
        <path
          d="M15 16.2L10.8 12l-1.4 1.4L15 19 27 7l-1.4-1.4L15 16.2z"
          fill="currentColor"
          opacity="0.7"
        />
      ) : (
        <path
          d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"
          fill="currentColor"
        />
      )}
      {variant === 'double' && (
        <path
          d="M15 16.2L10.8 12l-1.4 1.4L15 19 27 7l-1.4-1.4L15 16.2z"
          fill="currentColor"
          opacity="0.7"
        />
      )}
    </svg>
  );
};
