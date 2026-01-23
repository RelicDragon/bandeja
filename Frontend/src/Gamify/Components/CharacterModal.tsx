import { useEffect, useRef, useState, useCallback } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

interface CharacterModalProps {
  modelPath: string;
  animationName: string;
  idleBoringAnimations?: string[];
  onLoad?: () => void;
}

export const CharacterModal = ({ 
  modelPath, 
  animationName, 
  idleBoringAnimations = [],
  onLoad
}: CharacterModalProps) => {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(modelPath);
  const { actions, mixer } = useAnimations(animations, group);
  const [opacity, setOpacity] = useState(0);
  
  const idleLoopCountRef = useRef(0);
  const currentBoringIndexRef = useRef(0);
  const isPlayingIdleRef = useRef(true);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const previousTimeRef = useRef(0);
  const materialsRef = useRef<THREE.Material[]>([]);

  const playAnimation = useCallback((animName: string, fadeIn: number = 0.5, loopMode: THREE.AnimationActionLoopStyles = THREE.LoopRepeat, repetitions: number = Infinity) => {
    if (!actions || !actions[animName]) {
      console.warn(`Animation "${animName}" not found. Available animations:`, Object.keys(actions || {}));
      return null;
    }

    if (currentActionRef.current) {
      currentActionRef.current.fadeOut(0.3);
    }

    const action = actions[animName];
    action.reset().fadeIn(fadeIn).play();
    action.setLoop(loopMode, repetitions);
    if (loopMode === THREE.LoopOnce) {
      action.clampWhenFinished = true;
    }
    currentActionRef.current = action;
    previousTimeRef.current = 0;
    return action;
  }, [actions]);

  useEffect(() => {
    if (scene && group.current) {
      scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      
      if (group.current) {
        const materials: THREE.Material[] = [];
        group.current.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            const material = mesh.material;
            if (Array.isArray(material)) {
              materials.push(...material);
            } else {
              materials.push(material);
            }
          }
        });
        materialsRef.current = materials;
      }
      
      if (animations && animations.length > 0) {
        console.log('Available animations:', animations.map(anim => anim.name));
      }
      
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setOpacity(1);
          onLoad?.();
        });
      });
    }
  }, [scene, onLoad, animations]);

  useEffect(() => {
    if (actions && animationName && actions[animationName]) {
      idleLoopCountRef.current = 0;
      currentBoringIndexRef.current = 0;
      isPlayingIdleRef.current = true;
      previousTimeRef.current = 0;
      
      playAnimation(animationName, 0.5, THREE.LoopRepeat, Infinity);
    } else if (actions && animations.length > 0) {
      const firstAction = Object.values(actions)[0];
      if (firstAction) {
        firstAction.reset().fadeIn(0.5).play();
        currentActionRef.current = firstAction;
        previousTimeRef.current = 0;
      }
    }
  }, [actions, animationName, animations, playAnimation]);

  useFrame((_state, delta) => {
    if (mixer) {
      mixer.update(delta);
      
      if (currentActionRef.current) {
        const action = currentActionRef.current;
        const currentTime = action.time;
        const duration = action.getClip().duration;
        const previousTime = previousTimeRef.current;
        
        if (action.loop === THREE.LoopRepeat && duration > 0) {
          if (previousTime > duration * 0.9 && currentTime < duration * 0.1) {
            idleLoopCountRef.current++;
            
            if (idleLoopCountRef.current >= 2) {
              idleLoopCountRef.current = 0;
              isPlayingIdleRef.current = false;
              
              if (idleBoringAnimations.length > 0) {
                const boringAnimName = idleBoringAnimations[currentBoringIndexRef.current];
                if (actions && actions[boringAnimName]) {
                  playAnimation(boringAnimName, 0.3, THREE.LoopOnce, 1);
                } else {
                  isPlayingIdleRef.current = true;
                  playAnimation(animationName);
                }
              } else {
                isPlayingIdleRef.current = true;
                playAnimation(animationName);
              }
            }
          }
        } else if (action.loop === THREE.LoopOnce && currentTime >= duration && previousTime < duration) {
          isPlayingIdleRef.current = true;
          idleLoopCountRef.current = 0;
          currentBoringIndexRef.current = (currentBoringIndexRef.current + 1) % idleBoringAnimations.length;
          playAnimation(animationName);
        }
        
        previousTimeRef.current = currentTime;
      }
    }
  });

  useEffect(() => {
    materialsRef.current.forEach((mat) => {
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.transparent = true;
        mat.opacity = opacity;
      }
    });

    return () => {
      materialsRef.current.forEach((mat) => {
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.transparent = false;
          mat.opacity = 1;
        }
      });
    };
  }, [opacity]);

  return (
    <group ref={group}>
      <primitive object={scene} />
    </group>
  );
};

useGLTF.preload('/models/char/orc_grunt.glb');
useGLTF.preload('/models/char/orc_peon.glb');
useGLTF.preload('/models/char/knight.glb');
useGLTF.preload('/models/char/dwarf_warrior.glb');
