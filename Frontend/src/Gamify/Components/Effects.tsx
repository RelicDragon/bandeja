import { EffectComposer, Bloom, Noise, Vignette, BrightnessContrast } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

export function Effects() {
  return (
    <EffectComposer enableNormalPass={false}>
      <Bloom 
        intensity={1.0} 
        luminanceThreshold={0.2} 
        luminanceSmoothing={0.9} 
        mipmapBlur 
      />

      <Noise 
        opacity={0.05} 
        blendFunction={BlendFunction.OVERLAY} 
      />

      <Vignette 
        eskil={false} 
        offset={0.1} 
        darkness={1.1} 
      />

      <BrightnessContrast 
        brightness={0.0} 
        contrast={0.1} 
      />
    </EffectComposer>
  );
}
