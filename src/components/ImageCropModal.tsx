"use client";

import { useState, useRef, useCallback } from "react";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";

interface ImageCropModalProps {
  onClose: () => void;
  onSaved: (downloadURL: string, aspectRatio: "1:1" | "3:4") => void;
  menuName: string;
}

type AspectRatioOption = "1:1" | "3:4";
const ASPECT_RATIOS: Record<AspectRatioOption, number> = { "1:1": 1, "3:4": 3 / 4 };

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number) {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 90 }, aspect, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight,
  );
}

export default function ImageCropModal({ onClose, onSaved, menuName }: ImageCropModalProps) {
  const [imgSrc, setImgSrc] = useState("");
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>("1:1");
  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/jpg", "image/png"];
    if (!validTypes.includes(file.type)) {
      setError("Format harus JPG, JPEG, atau PNG.");
      return;
    }

    setError("");
    const reader = new FileReader();
    reader.onload = () => setImgSrc(reader.result as string);
    reader.readAsDataURL(file);
  };

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setCrop(centerAspectCrop(naturalWidth, naturalHeight, ASPECT_RATIOS[aspectRatio]));
  }, [aspectRatio]);

  const handleAspectChange = (newRatio: AspectRatioOption) => {
    setAspectRatio(newRatio);
    const image = imgRef.current;
    if (image) {
      setCrop(centerAspectCrop(image.naturalWidth, image.naturalHeight, ASPECT_RATIOS[newRatio]));
    }
  };

  const getCroppedBlob = (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const image = imgRef.current;
      if (!image || !completedCrop) return reject("No crop data");

      const canvas = document.createElement("canvas");
      const aspect = ASPECT_RATIOS[aspectRatio];
      const outW = 800;
      const outH = Math.round(outW / aspect);
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject("No canvas context");

      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      ctx.drawImage(
        image,
        completedCrop.x * scaleX,
        completedCrop.y * scaleY,
        completedCrop.width * scaleX,
        completedCrop.height * scaleY,
        0, 0, outW, outH,
      );

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject("Failed to create blob")),
        "image/jpeg",
        0.85,
      );
    });
  };

  const handleUpload = async () => {
    if (!completedCrop) return;
    setUploading(true);
    setError("");
    try {
      const blob = await getCroppedBlob();
      const safeName = menuName.trim().replace(/[^a-zA-Z0-9_-]/g, "_") || "menu_item";
      const fileName = `${safeName}_${Date.now()}.jpg`;
      const storageRef = ref(storage, `pos375_assets/${fileName}`);
      await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
      const downloadURL = await getDownloadURL(storageRef);
      onSaved(downloadURL, aspectRatio);
    } catch (err) {
      console.error("Upload error:", err);
      setError("Gagal mengunggah gambar. Coba lagi.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <style jsx global>{`
        .icm-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.6);
          display: flex; align-items: center; justify-content: center;
          z-index: 2000; backdrop-filter: blur(3px); padding: 1rem;
        }
        .icm-card {
          background: white; border-radius: 12px; width: 100%; max-width: 480px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.25); animation: icm-pop 0.2s;
          display: flex; flex-direction: column; max-height: 90vh;
        }
        @keyframes icm-pop { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; }}
        .icm-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 1.25rem 1.5rem; border-bottom: 1px solid #eee;
        }
        .icm-header h3 { margin: 0; font-size: 1.1rem; font-weight: 700; color: #333; }
        .icm-close { background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #888; }
        .icm-body { padding: 1.5rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem; align-items: center; }
        .icm-dropzone {
          width: 100%; border: 2px dashed #ccc; border-radius: 10px;
          padding: 2.5rem 1rem; text-align: center; cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
        }
        .icm-dropzone:hover { border-color: #00b14f; background: #f0faf4; }
        .icm-dropzone-icon { font-size: 2.5rem; margin-bottom: 0.5rem; }
        .icm-dropzone-text { font-size: 0.9rem; color: #666; font-weight: 500; }
        .icm-dropzone-hint { font-size: 0.75rem; color: #999; margin-top: 0.3rem; }
        .icm-crop-area {
          width: 100%; display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
        }
        .icm-crop-area img { max-width: 100%; max-height: 380px; }
        .icm-change-btn {
          background: none; border: 1px solid #ddd; padding: 0.4rem 1rem;
          border-radius: 6px; font-size: 0.8rem; font-weight: 600;
          cursor: pointer; color: #555;
        }
        .icm-change-btn:hover { background: #f5f5f5; }
        .icm-ratio-picker {
          display: flex; gap: 0.5rem; justify-content: center; margin-bottom: 0.25rem;
        }
        .icm-ratio-btn {
          background: white; border: 1px solid #ddd; padding: 0.35rem 0.9rem;
          border-radius: 6px; font-size: 0.8rem; font-weight: 600;
          cursor: pointer; color: #555; transition: all 0.15s;
        }
        .icm-ratio-btn:hover { background: #f5f5f5; }
        .icm-ratio-btn.active {
          background: #00b14f; color: white; border-color: #00b14f;
        }
        .icm-error { color: #d32f2f; font-size: 0.85rem; font-weight: 500; text-align: center; }
        .icm-footer {
          padding: 1.25rem 1.5rem; border-top: 1px solid #eee;
          display: flex; justify-content: flex-end; gap: 0.75rem; background: #fafafa;
          border-radius: 0 0 12px 12px;
        }
        .icm-btn-cancel {
          background: white; border: 1px solid #ddd; padding: 0.6rem 1.2rem;
          border-radius: 6px; font-weight: 600; cursor: pointer; color: #333;
        }
        .icm-btn-save {
          background: #00b14f; color: white; border: none; padding: 0.6rem 1.5rem;
          border-radius: 6px; font-weight: 600; cursor: pointer;
        }
        .icm-btn-save:disabled { background: #a5d6a7; cursor: not-allowed; }
      `}</style>

      <div className="icm-overlay" onClick={onClose}>
        <div className="icm-card" onClick={(e) => e.stopPropagation()}>
          <div className="icm-header">
            <h3>Upload Gambar Menu</h3>
            <button className="icm-close" onClick={onClose}>✕</button>
          </div>

          <div className="icm-body">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png"
              onChange={onSelectFile}
              style={{ display: "none" }}
            />

            {!imgSrc ? (
              <div className="icm-dropzone" onClick={() => fileInputRef.current?.click()}>
                <div className="icm-dropzone-icon">📷</div>
                <div className="icm-dropzone-text">Pilih gambar dari perangkat</div>
                <div className="icm-dropzone-hint">JPG, JPEG, atau PNG</div>
              </div>
            ) : (
              <div className="icm-crop-area">
                <div className="icm-ratio-picker">
                  {(Object.keys(ASPECT_RATIOS) as AspectRatioOption[]).map((r) => (
                    <button
                      key={r}
                      className={`icm-ratio-btn${aspectRatio === r ? " active" : ""}`}
                      onClick={() => handleAspectChange(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={ASPECT_RATIOS[aspectRatio]}
                  circularCrop={false}
                >
                  <img
                    ref={imgRef}
                    src={imgSrc}
                    alt="Crop preview"
                    onLoad={onImageLoad}
                    style={{ maxWidth: "100%", maxHeight: "380px" }}
                  />
                </ReactCrop>
                <button className="icm-change-btn" onClick={() => fileInputRef.current?.click()}>
                  Ganti Gambar
                </button>
              </div>
            )}

            {error && <p className="icm-error">{error}</p>}
          </div>

          <div className="icm-footer">
            <button className="icm-btn-cancel" onClick={onClose}>Batal</button>
            <button
              className="icm-btn-save"
              onClick={handleUpload}
              disabled={!completedCrop || uploading}
            >
              {uploading ? "Mengunggah..." : "Simpan Gambar"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
