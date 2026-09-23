import multer from "multer";

import { MAX_UPLOAD_BYTES } from "../services/class-list.ts";

/**
 * Multipart handling for the class-list upload (CI-03, SR-10).
 *
 * In memory, never on disk. The file is read once and the buffer goes out of
 * scope with the request, so there is no upload directory to secure, to clean
 * up, or to leak a class list from. SR-10 says an uploaded file is not
 * retained, and the simplest way to honour that is never to write it anywhere.
 *
 * The size limit is enforced here, before any parsing - CI-03 requires the
 * rejection to happen before the contents are looked at, not after.
 */
export const classListUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
    // Enough for the column mapping that travels alongside the file.
    fields: 12,
  },
}).single("file");
