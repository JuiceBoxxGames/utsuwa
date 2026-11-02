const RASTER_IMAGE_MIME_RE = /^image\/(?:png|jpe?g|webp|gif|avif|bmp)$/i;
const RASTER_IMAGE_DATA_URL_RE = /^data:image\/(?:png|jpe?g|webp|gif|avif|bmp);base64,/i;

/** Only raster formats may be decoded/opened; SVG can run scripts in the app origin. */
export function isRasterImageMimeType(mimeType: string): boolean {
	return RASTER_IMAGE_MIME_RE.test(mimeType);
}

export function isRasterImageDataUrl(value: string): boolean {
	return RASTER_IMAGE_DATA_URL_RE.test(value);
}
