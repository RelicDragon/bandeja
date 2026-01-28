import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import { isCapacitor, isIOS } from './capacitor';
import { checkPhotoPermission, requestPhotoPermission } from './permissions';
import { permissionService } from '@/services/permissionService';

export interface PhotoCaptureResult {
  file: File;
  dataUrl?: string;
}

export interface PhotoPickResult {
  files: File[];
}

async function convertImageToFile(image: any, index: number = 0): Promise<File> {
  let imageUrl = image.dataUrl || image.webPath;
  let blob: Blob | undefined;
  
  if (image.size && image.size > 20 * 1024 * 1024) {
    throw new Error('Image file too large (max 20MB)');
  }
  
  if (!imageUrl && image.path && isCapacitor()) {
    try {
      if (image.webPath) {
        imageUrl = image.webPath;
      } else if (image.path.startsWith('content://')) {
        const convertedPath = Capacitor.convertFileSrc(image.path);
        try {
          const response = await fetch(convertedPath);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
          }
          blob = await response.blob();
        } catch (fetchError) {
          console.warn('Failed to fetch content:// URI, trying webPath fallback:', fetchError);
          if (image.webPath) {
            imageUrl = image.webPath;
          } else {
            throw new Error('Cannot access content:// URI and no webPath available');
          }
        }
      } else {
        const convertedPath = Capacitor.convertFileSrc(image.path);
        try {
          const response = await fetch(convertedPath);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
          }
          blob = await response.blob();
        } catch (fetchError) {
          try {
            if (image.path.startsWith('file://') || !image.path.includes('://')) {
              const fileData = await Filesystem.readFile({
                path: image.path.replace('file://', ''),
              });
              let base64Data = fileData.data as string;
              
              if (typeof base64Data === 'string') {
                if (base64Data.includes(',')) {
                  base64Data = base64Data.split(',')[1];
                }
                const byteCharacters = atob(base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                  byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                blob = new Blob([byteArray], { type: 'image/jpeg' });
              } else {
                throw new Error('Invalid file data format');
              }
            } else {
              throw new Error('Unsupported path format for Filesystem API');
            }
          } catch (filesystemError) {
            console.error('Failed to read file via Filesystem API:', filesystemError);
            if (image.webPath) {
              imageUrl = image.webPath;
            } else {
              throw new Error('Failed to read image file');
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Failed to process native file path:', error);
      if (image.webPath) {
        imageUrl = image.webPath;
      } else {
        const errorMessage = error?.message || 'Unknown error';
        if (errorMessage.includes('fetch')) {
          throw new Error(`Failed to load image: ${errorMessage}`);
        } else if (errorMessage.includes('Filesystem')) {
          throw new Error(`Failed to read image file: ${errorMessage}`);
        } else {
          throw new Error(`Image conversion failed: ${errorMessage}`);
        }
      }
    }
  }
  
  if (imageUrl && !blob) {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      blob = await response.blob();
    } catch (error: any) {
      console.error('Fetch error:', error);
      const errorMessage = error?.message || 'Unknown error';
      throw new Error(`Failed to fetch image: ${errorMessage}`);
    }
  }
  
  if (!blob) {
    throw new Error('No valid image URL or blob found');
  }
  
  let mimeType = blob.type || 'image/jpeg';
  if (!mimeType.startsWith('image/')) {
    const path = image.path || image.webPath || '';
    if (path.includes('.png')) mimeType = 'image/png';
    else if (path.includes('.gif')) mimeType = 'image/gif';
    else if (path.includes('.webp')) mimeType = 'image/webp';
    else mimeType = 'image/jpeg';
  }
  
  const fileName = image.path 
    ? image.path.split('/').pop() || `photo_${Date.now()}_${index}.jpg`
    : `photo_${Date.now()}_${index}.jpg`;
  
  return new File([blob], fileName, {
    type: mimeType,
    lastModified: Date.now(),
  });
}

export async function pickImages(
  maxImages: number = 1
): Promise<PhotoPickResult | null> {
  if (isCapacitor()) {
    try {
      // Check permissions - on Android, Photo Picker works without READ_MEDIA_IMAGES
      // so we'll still try to open picker even if permission check fails
      try {
        const permissionCheck = await checkPhotoPermission();
        
        if (permissionCheck.status === 'denied') {
          if (isIOS()) {
            console.warn('Photo permission denied. User needs to grant in settings.');
            permissionService.showPermissionModal('photos', () => {
              pickImages(maxImages).catch(console.error);
            });
            return null;
          }
        }
        
        if (permissionCheck.canRequest) {
          const requestResult = await requestPhotoPermission();
          if (requestResult.status !== 'granted' && requestResult.status !== 'limited') {
            if (requestResult.status === 'denied') {
              if (isIOS()) {
                console.warn('Photo permission denied by user.');
                permissionService.showPermissionModal('photos', () => {
                  pickImages(maxImages).catch(console.error);
                });
                return null;
              }
            }
          }
        }
      } catch (permissionError) {
        // Permission check failed - on Android this is OK, Photo Picker works without permission
        // On iOS, we need to handle this more carefully
        console.warn('Permission check failed, attempting to use Photo Picker anyway:', permissionError);
        if (isIOS()) {
          // On iOS, if permission check fails, we should still try but it might fail
          // The picker itself will handle the permission request
        }
      }

      if (typeof (Camera as any).pickImages === 'function') {
        try {
          const images = await (Camera as any).pickImages({
            quality: 90,
            limit: maxImages,
          });

          if (!images.photos || images.photos.length === 0) {
            return null;
          }

          const filePromises = images.photos.map(async (photo: any, index: number) => {
            try {
              return await convertImageToFile(photo, index);
            } catch (error: any) {
              if (error.message?.includes('too large')) {
                console.warn(`Image ${index} is too large (max 20MB), skipping`);
              } else {
                console.error(`Failed to convert image ${index}:`, error);
              }
              return null;
            }
          });

          const files = await Promise.all(filePromises);
          const validFiles = files.filter((file): file is File => file !== null);

          if (validFiles.length === 0) {
            console.warn('No images could be converted');
            return null;
          }

          return { files: validFiles };
        } catch (error: any) {
          if (error.message?.includes('User cancelled') || error.message?.includes('canceled')) {
            return null;
          }
          if (error.message?.includes('permission') || error.message?.includes('Permission') || error.message?.includes('denied')) {
            console.warn('Permission denied when opening picker');
            permissionService.showPermissionModal('photos', () => {
              pickImages(maxImages).catch(console.error);
            });
            return null;
          }
          console.warn('pickImages failed, falling back to single selection:', error);
        }
      }
      
      try {
        const image = await Camera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Photos,
        });

        if (!image.dataUrl) {
          return null;
        }

        const file = await convertImageToFile(image, 0);
        return { files: [file] };
      } catch (error: any) {
        if (error.message?.includes('User cancelled') || error.message?.includes('canceled')) {
          return null;
        }
        if (error.message?.includes('permission') || error.message?.includes('Permission') || error.message?.includes('denied')) {
          console.warn('Permission denied when opening picker');
          permissionService.showPermissionModal('photos', () => {
            pickImages(maxImages).catch(console.error);
          });
          return null;
        }
        throw error;
      }
    } catch (error: any) {
      if (error.message?.includes('User cancelled') || error.message?.includes('canceled')) {
        return null;
      }
      if (error.message?.includes('permission') || error.message?.includes('Permission') || error.message?.includes('denied')) {
        console.warn('Permission denied when opening picker');
        permissionService.showPermissionModal('photos', () => {
          pickImages(maxImages).catch(console.error);
        });
        return null;
      }
      console.error('Error picking images:', error);
      return null;
    }
  } else {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = maxImages > 1;
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
      
      input.onchange = async (e) => {
        const target = e.target as HTMLInputElement;
        const files = target.files;
        
        if (files && files.length > 0) {
          if (resolved) return;
          resolved = true;
          window.removeEventListener('focus', handleWindowFocus);
          
          const fileArray = Array.from(files).slice(0, maxImages);
          cleanup();
          
          resolve({ files: fileArray });
        } else {
          if (!resolved) {
            resolved = true;
            cleanup();
            window.removeEventListener('focus', handleWindowFocus);
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

export async function capturePhoto(): Promise<PhotoCaptureResult | null> {
  const result = await pickImages(1);
  if (!result || result.files.length === 0) {
    return null;
  }

  const file = result.files[0];
  const reader = new FileReader();
  
  return new Promise((resolve) => {
    reader.onload = (event) => {
      resolve({
        file,
        dataUrl: event.target?.result as string,
      });
    };
    
    reader.onerror = () => {
      resolve({
        file,
      });
    };
    
    reader.readAsDataURL(file);
  });
}
