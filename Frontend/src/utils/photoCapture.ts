import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { isCapacitor } from './capacitor';

export interface PhotoCaptureResult {
  file: File;
  dataUrl?: string;
}

export async function capturePhoto(): Promise<PhotoCaptureResult | null> {
  if (isCapacitor()) {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
      });

      if (!image.dataUrl) {
        return null;
      }

      const response = await fetch(image.dataUrl);
      const blob = await response.blob();
      const file = new File([blob], `photo_${Date.now()}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });

      return {
        file,
        dataUrl: image.dataUrl,
      };
    } catch (error) {
      console.error('Error capturing photo:', error);
      return null;
    }
  } else {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.position = 'fixed';
      input.style.top = '-9999px';
      input.style.left = '-9999px';
      
      let resolved = false;
      
      const cleanup = () => {
        setTimeout(() => {
          if (input.parentNode) {
            input.parentNode.removeChild(input);
          }
        }, 100);
      };
      
      const handleWindowFocus = () => {
        setTimeout(() => {
          if (!resolved) {
            const files = input.files;
            if (!files || files.length === 0) {
              resolved = true;
              cleanup();
              window.removeEventListener('focus', handleWindowFocus);
              resolve(null);
            }
          }
        }, 300);
      };
      
      const handleFileSelect = async (file: File) => {
        if (resolved) return;
        resolved = true;
        window.removeEventListener('focus', handleWindowFocus);
        
        try {
          const reader = new FileReader();
          
          const dataUrlPromise = new Promise<string>((resolveReader, rejectReader) => {
            reader.onload = (event) => {
              resolveReader(event.target?.result as string);
            };
            
            reader.onerror = () => {
              rejectReader(new Error('Failed to read file'));
            };
            
            reader.readAsDataURL(file);
          });
          
          const dataUrl = await dataUrlPromise;
          cleanup();
          
          resolve({
            file,
            dataUrl,
          });
        } catch (error) {
          console.error('Error processing file:', error);
          cleanup();
          resolve(null);
        }
      };
      
      input.onchange = (e) => {
        const target = e.target as HTMLInputElement;
        const files = target.files;
        
        if (files && files.length > 0) {
          handleFileSelect(files[0]);
        } else {
          if (!resolved) {
            resolved = true;
            cleanup();
            resolve(null);
          }
        }
      };
      
      window.addEventListener('focus', handleWindowFocus);
      
      document.body.appendChild(input);
      
      setTimeout(() => {
        input.click();
      }, 0);
    });
  }
}

