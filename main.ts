// Entry program for the make.fun "Make the AI judge excited" bounty
// (ai-excited-01).
//
// The entry itself is a single image, artwork.png, sitting next to this
// file. This program is the delivery mechanism: it loads the artwork,
// validates it against the competition's limits (a complete PNG or JPEG,
// at most 1 MiB, at most 1024x1024 pixels), and writes it, byte for byte,
// to entry.png inside the output directory.
//
// The output directory is $MAKEFUN_OUTPUT_DIR when set, else /output.
// The program is deterministic: its output depends only on the artwork
// file, so two runs always produce identical bytes.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Competition limits for the entry image. */
const MAX_BYTES = 1_048_576; // 1 MiB
const MAX_WIDTH = 1024;
const MAX_HEIGHT = 1024;

const PNG_SIGNATURE: readonly number[] = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
];

interface ImageInfo {
  format: "png" | "jpeg";
  width: number;
  height: number;
  bytes: number;
}

class ArtworkError extends Error {}

/** True when the buffer starts with the 8-byte PNG signature. */
function hasPngSignature(data: Buffer): boolean {
  if (data.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((byte, i) => data[i] === byte);
}

/** True when the buffer starts with the JPEG SOI marker (FF D8). */
function hasJpegSignature(data: Buffer): boolean {
  return data.length >= 2 && data[0] === 0xff && data[1] === 0xd8;
}

/** Dimensions from the PNG IHDR chunk (width/height are BE uint32 at 16/20). */
function pngDimensions(data: Buffer): { width: number; height: number } {
  // 8-byte signature + 4-byte length + "IHDR" must precede the fields.
  if (data.length < 24) {
    throw new ArtworkError("PNG file is truncated before IHDR completes");
  }
  const chunkType = data.toString("ascii", 12, 16);
  if (chunkType !== "IHDR") {
    throw new ArtworkError(`PNG first chunk is "${chunkType}", expected IHDR`);
  }
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

/**
 * Dimensions from a JPEG Start Of Frame segment. Walks the marker stream
 * from SOI until it finds SOF0 (0xC0) or SOF2 (0xC2); standalone markers
 * (RSTn, TEM, SOI, EOI) carry no length field and are skipped in place.
 */
function jpegDimensions(data: Buffer): { width: number; height: number } {
  let offset = 2; // skip SOI
  while (offset + 1 < data.length) {
    if (data[offset] !== 0xff) {
      throw new ArtworkError(`JPEG marker expected at byte ${offset}`);
    }
    const marker = data[offset + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      // Segment: length(2) precision(1) height(2) width(2), all after marker.
      if (offset + 9 > data.length) {
        throw new ArtworkError("JPEG SOF segment is truncated");
      }
      return {
        height: data.readUInt16BE(offset + 5),
        width: data.readUInt16BE(offset + 7),
      };
    }
    if (marker === 0xd9) break; // EOI reached without a frame header
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2; // standalone marker, no length field
      continue;
    }
    if (offset + 4 > data.length) {
      throw new ArtworkError("JPEG segment header is truncated");
    }
    const segmentLength = data.readUInt16BE(offset + 2);
    if (segmentLength < 2) {
      throw new ArtworkError(`JPEG segment at byte ${offset} has bad length`);
    }
    offset += 2 + segmentLength;
  }
  throw new ArtworkError("JPEG contains no SOF0/SOF2 frame header");
}

/** Checks the closing marker so a truncated file is not shipped as valid. */
function checkComplete(data: Buffer, format: ImageInfo["format"]): void {
  if (format === "jpeg") {
    const tail = data.subarray(data.length - 2);
    if (tail[0] !== 0xff || tail[1] !== 0xd9) {
      throw new ArtworkError("JPEG is missing its EOI marker (truncated?)");
    }
  } else {
    // A PNG ends with an empty IEND chunk: length 0, "IEND", then its CRC.
    const iend = data.indexOf(Buffer.from("IEND", "ascii"), 8);
    if (iend === -1 || iend + 8 !== data.length) {
      throw new ArtworkError("PNG is missing its IEND chunk (truncated?)");
    }
  }
}

/** Validates the artwork against every competition limit. */
function validateArtwork(data: Buffer): ImageInfo {
  if (data.length === 0) {
    throw new ArtworkError("artwork file is empty");
  }
  if (data.length > MAX_BYTES) {
    throw new ArtworkError(
      `artwork is ${data.length} bytes, over the ${MAX_BYTES}-byte limit`,
    );
  }

  let format: ImageInfo["format"];
  let dimensions: { width: number; height: number };
  if (hasPngSignature(data)) {
    format = "png";
    dimensions = pngDimensions(data);
  } else if (hasJpegSignature(data)) {
    format = "jpeg";
    dimensions = jpegDimensions(data);
  } else {
    throw new ArtworkError(
      "artwork is neither PNG nor JPEG (bad format signature)",
    );
  }
  checkComplete(data, format);

  const { width, height } = dimensions;
  if (width < 1 || height < 1 || width > MAX_WIDTH || height > MAX_HEIGHT) {
    throw new ArtworkError(
      `artwork is ${width}x${height}, outside the ${MAX_WIDTH}x${MAX_HEIGHT} limit`,
    );
  }
  return { format, width, height, bytes: data.length };
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const artworkPath = join(here, "artwork.png");
  const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  const entryPath = join(outputDir, "entry.png");

  const data = readFileSync(artworkPath);
  const info = validateArtwork(data);

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(entryPath, data);

  // Verify the delivery: re-read what landed on disk and compare digests,
  // so a short or corrupted write fails here instead of at judging time.
  const digest = (bytes: Buffer): string =>
    createHash("sha256").update(bytes).digest("hex");
  const sourceDigest = digest(data);
  if (digest(readFileSync(entryPath)) !== sourceDigest) {
    throw new ArtworkError("entry.png on disk differs from artwork.png");
  }

  console.log(
    `entry.png written: ${info.format} ${info.width}x${info.height}, ` +
      `${info.bytes} bytes, sha256 ${sourceDigest.slice(0, 12)}… -> ${entryPath}`,
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`main.ts: ${message}`);
  process.exit(1);
}
