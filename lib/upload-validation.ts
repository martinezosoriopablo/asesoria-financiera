// lib/upload-validation.ts
// Shared server-side validation for file uploads

interface ValidateUploadOptions {
  maxSizeMB: number;
  allowedTypes?: string[];
  allowedExtensions?: string[];
}

/**
 * Validates a file upload on the server side.
 * Returns an error message string if invalid, or null if the file passes all checks.
 */
export function validateUpload(
  file: File | Blob,
  options: ValidateUploadOptions
): string | null {
  const { maxSizeMB, allowedTypes, allowedExtensions } = options;

  // Check file size
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return `Archivo demasiado grande (máx ${maxSizeMB} MB)`;
  }

  // Check MIME type if specified
  if (allowedTypes && allowedTypes.length > 0) {
    if (!allowedTypes.includes(file.type)) {
      return "Tipo de archivo no permitido";
    }
  }

  // Check file extension if specified (only works with File, not plain Blob)
  if (allowedExtensions && allowedExtensions.length > 0 && "name" in file) {
    const name = (file as File).name.toLowerCase();
    const hasValidExtension = allowedExtensions.some((ext) =>
      name.endsWith(ext.toLowerCase())
    );
    if (!hasValidExtension) {
      return "Tipo de archivo no permitido";
    }
  }

  return null;
}
