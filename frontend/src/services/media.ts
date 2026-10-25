const MAX_EDGE = 1600;
const MAX_BYTES = 650 * 1024;

/** Resize member photos before upload so both R2 and the development inline
 * fallback stay within predictable transfer and request-body limits. */
export async function preparePhoto(file: File): Promise<File> {
  if (file.size <= MAX_BYTES && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file;

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * scale));
    let height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');

    for (let resizePass = 0; resizePass < 3; resizePass += 1) {
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Photo processing is unavailable in this browser.');
      context.drawImage(bitmap, 0, 0, width, height);

      for (const quality of [0.82, 0.72, 0.62, 0.52]) {
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Could not process this photo.')), 'image/jpeg', quality);
        });
        if (blob.size <= MAX_BYTES) {
          const name = file.name.replace(/\.[^.]+$/, '') || 'photo';
          return new File([blob], `${name}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
        }
      }
      width = Math.max(1, Math.round(width * 0.78));
      height = Math.max(1, Math.round(height * 0.78));
    }
    throw new Error('This photo is too large to process. Choose another image.');
  } finally {
    bitmap.close();
  }
}
