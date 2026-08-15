'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { resizeForUpload } from '@/lib/image-resize';
import {
  uploadProductPhoto,
  deleteProductPhoto,
  setPrimaryPhoto,
  reorderProductPhotos,
} from '@/lib/actions/admin/products';
import { Button } from '@/components/ui/Button';

export interface UploadedPhoto {
  id: string;
  url: string;
  isPrimary: boolean;
}

/** The schema allows four photos per product; storage is the tightest free-tier limit. */
const MAX_PHOTOS = 4;

/**
 * Product photos: upload several, reorder them, choose the primary, delete.
 *
 * Every file is resized to WebP in this browser before it is sent — a 4 MB
 * phone photo leaves as roughly 150 KB (research R12). The upload progress a
 * user sees is therefore short even on a shop's ADSL line, and the free tier's
 * gigabyte lasts.
 *
 * Reordering offers both dragging and a pair of arrow buttons. Dragging is
 * pleasant with a mouse and close to unusable with a thumb, and this console is
 * used from both.
 */
export function ImageUploader({
  productId,
  photos,
}: {
  productId: string;
  photos: UploadedPhoto[];
}) {
  const t = useTranslations('admin');
  const tError = useTranslations();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [order, setOrder] = useState(photos);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const remaining = MAX_PHOTOS - order.length;

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    setBusy(true);
    setError(null);

    for (const file of Array.from(files).slice(0, Math.max(0, remaining))) {
      try {
        const { full, thumb } = await resizeForUpload(file);

        const payload = new FormData();
        payload.set('product_id', productId);
        payload.set('full', new File([full], 'photo.webp', { type: 'image/webp' }));
        payload.set('thumb', new File([thumb], 'thumb.webp', { type: 'image/webp' }));

        const result = await uploadProductPhoto(payload);
        if (!result.ok) {
          setError(result.error);
          break;
        }
      } catch {
        setError('adminErrors.imageUnreadable');
        break;
      }
    }

    if (inputRef.current) inputRef.current.value = '';
    setBusy(false);
    router.refresh();
  }

  async function persistOrder(next: UploadedPhoto[]) {
    setOrder(next);
    await reorderProductPhotos(next.map((photo) => photo.id));
    router.refresh();
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    const moved = next[from];
    if (!moved) return;
    next.splice(from, 1);
    next.splice(to, 0, moved);
    void persistOrder(next);
  }

  async function onDelete(id: string) {
    setBusy(true);
    const result = await deleteProductPhoto(id);
    if (!result.ok) setError(result.error);
    else setOrder((current) => current.filter((photo) => photo.id !== id));
    setBusy(false);
    router.refresh();
  }

  async function onSetPrimary(id: string) {
    setBusy(true);
    const result = await setPrimaryPhoto(productId, id);
    if (!result.ok) setError(result.error);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">{t('photos')}</h2>
        <span className="text-xs text-ink-3">{t('photosRemaining', { count: Math.max(0, remaining) })}</span>
      </div>

      {error && (
        <p role="alert" className="rounded border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {tError(error)}
        </p>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {order.map((photo, index) => (
          <li
            key={photo.id}
            draggable
            onDragStart={() => setDragging(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragging !== null && dragging !== index) move(dragging, index);
              setDragging(null);
            }}
            className={[
              'flex flex-col gap-2 rounded border bg-surface p-2',
              photo.isPrimary ? 'border-brand' : 'border-rule',
            ].join(' ')}
          >
            <div className="relative aspect-square overflow-hidden rounded bg-surface-2">
              <Image
                src={photo.url}
                alt=""
                fill
                sizes="(max-width: 640px) 45vw, 22vw"
                className="object-cover"
                unoptimized
              />
            </div>

            {photo.isPrimary ? (
              <span className="rounded bg-brand px-2 py-1 text-center text-xs font-semibold text-on-brand">
                {t('primaryPhoto')}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onSetPrimary(photo.id)}
                disabled={busy}
                className="min-h-touch rounded border border-rule text-xs font-semibold text-ink-2 hover:border-brand hover:text-brand"
              >
                {t('makePrimary')}
              </button>
            )}

            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={() => move(index, index - 1)}
                disabled={busy || index === 0}
                aria-label={t('moveEarlier')}
                className="min-h-touch flex-1 rounded text-ink-2 hover:bg-surface-2 disabled:opacity-40"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, index + 1)}
                disabled={busy || index === order.length - 1}
                aria-label={t('moveLater')}
                className="min-h-touch flex-1 rounded text-ink-2 hover:bg-surface-2 disabled:opacity-40"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => onDelete(photo.id)}
                disabled={busy}
                aria-label={t('deletePhoto')}
                className="min-h-touch flex-1 rounded text-danger hover:bg-danger-soft disabled:opacity-40"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        disabled={busy || remaining <= 0}
        onChange={(event) => onFiles(event.target.files)}
        className="sr-only"
        id="photo-input"
      />

      <Button
        type="button"
        variant="secondary"
        disabled={busy || remaining <= 0}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? t('uploading') : t('addPhotos')}
      </Button>
    </div>
  );
}
