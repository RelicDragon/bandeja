import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Cropper from 'react-easy-crop';
import { Loader2 } from 'lucide-react';
import getCroppedImg from '@/utils/cropUtils';
import { Button } from '@/components';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { lightHaptic } from '@/utils/lightHaptic';

type PhotoStoryCropScreenProps = {
  imageUrl: string;
  onConfirm: (file: File) => void;
  onCancel: () => void;
};

export function PhotoStoryCropScreen({ imageUrl, onConfirm, onCancel }: PhotoStoryCropScreenProps) {
  const { t } = useTranslation();
  const trapRef = useFocusTrap(true, onCancel);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
  }, [imageUrl]);

  const handleConfirm = useCallback(async () => {
    if (!area || busy) return;
    setBusy(true);
    try {
      const blobUrl = await getCroppedImg(imageUrl, area, 0);
      const res = await fetch(blobUrl);
      const blob = await res.blob();
      URL.revokeObjectURL(blobUrl);
      lightHaptic();
      onConfirm(new File([blob], `story-crop-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    } finally {
      setBusy(false);
    }
  }, [area, busy, imageUrl, onConfirm]);

  return (
    <div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      className="absolute inset-0 z-30 flex flex-col bg-zinc-950"
    >
      <div className="relative flex-1 min-h-0">
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={9 / 16}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, pixels) => setArea(pixels)}
        />
      </div>
      <div className="flex gap-3 border-t border-white/10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => void handleConfirm()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin mx-auto" size={20} /> : t('common.done')}
        </Button>
      </div>
    </div>
  );
}
