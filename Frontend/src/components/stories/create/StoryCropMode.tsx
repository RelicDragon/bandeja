import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Cropper from 'react-easy-crop';
import { Loader2 } from 'lucide-react';
import getCroppedImg from '@/utils/cropUtils';
import { Button } from '@/components';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { lightHaptic } from '@/utils/lightHaptic';

type StoryCropModeProps = {
  imageUrl: string;
  onConfirm: (file: File) => void;
  onCancel: () => void;
};

const INITIAL_CROP = { x: 0, y: 0 };

export function StoryCropMode({ imageUrl, onConfirm, onCancel }: StoryCropModeProps) {
  const { t } = useTranslation();
  const trapRef = useFocusTrap(true, onCancel);
  const [crop, setCrop] = useState(INITIAL_CROP);
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCrop(INITIAL_CROP);
    setZoom(1);
    setCroppedAreaPixels(null);
  }, [imageUrl]);

  const onCropComplete = useCallback((_: unknown, area: typeof croppedAreaPixels) => {
    setCroppedAreaPixels(area);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!croppedAreaPixels || busy) return;
    setBusy(true);
    try {
      const blobUrl = await getCroppedImg(imageUrl, croppedAreaPixels, 0);
      const res = await fetch(blobUrl);
      const blob = await res.blob();
      URL.revokeObjectURL(blobUrl);
      const file = new File([blob], `story-crop-${Date.now()}.jpg`, { type: 'image/jpeg' });
      lightHaptic();
      onConfirm(file);
    } finally {
      setBusy(false);
    }
  }, [busy, croppedAreaPixels, imageUrl, onConfirm]);

  return (
    <div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('stories.editor.toolCrop')}
      className="absolute inset-0 z-30 flex flex-col bg-black"
    >
      <div className="relative flex-1 min-h-0">
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={9 / 16}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>
      <div className="flex gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => void handleConfirm()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin mx-auto" size={18} /> : t('common.done')}
        </Button>
      </div>
    </div>
  );
}
