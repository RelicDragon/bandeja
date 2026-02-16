import { useEffect, useState } from 'react';
import { useGLTF } from '@react-three/drei';

const MODEL_PATHS = [
  '/models/char/orc_grunt.glb',
  '/models/char/orc_peon.glb',
  '/models/char/knight.glb',
  '/models/char/dwarf_warrior.glb',
];

export const usePreloadModels = () => {
  const [isPreloading, setIsPreloading] = useState(true);

  useEffect(() => {
    MODEL_PATHS.forEach((path) => {
      useGLTF.preload(path);
    });
    
    setTimeout(() => {
      setIsPreloading(false);
    }, 300);
  }, []);

  return { isPreloading, preloadProgress: 100 };
};
