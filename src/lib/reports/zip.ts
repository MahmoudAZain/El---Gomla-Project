/**
 * A minimal ZIP writer.
 *
 * An `.xlsx` file is a ZIP archive of XML parts, so producing one needs a ZIP
 * writer and nothing else. This is that writer, in about a hundred lines,
 * rather than a dependency.
 *
 * The reason is the bundle. Every spreadsheet library worth using is hundreds
 * of kilobytes, and this console is loaded over Egyptian mobile data on the
 * free tier of a CDN (Constitution Principle IV). A shop that reorders stock
 * from its phone should not pay for a megabyte of workbook library to download
 * one file.
 *
 * Entries are **stored**, not deflated. Deflate would need a compressor —
 * another few kilobytes and a great deal more code to get right — and the XML
 * in a report workbook is small. A 5,000-row file lands around a megabyte
 * uncompressed, which is a moment on any connection and is written entirely in
 * the browser, so it costs the server nothing.
 */

interface Entry {
  name: string;
  data: Uint8Array;
  crc: number;
}

/** CRC-32, table-driven. Built once on first use rather than shipped as data. */
let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let value = i;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      crcTable[i] = value >>> 0;
    }
  }

  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ (crcTable[(crc ^ byte) & 0xff] as number);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

/**
 * Builds the archive.
 *
 * Local headers, then the central directory, then the end-of-central-directory
 * record — the order every ZIP reader expects, including the one inside Excel.
 */
export function createZip(files: { name: string; content: string }[]): Blob {
  const encoder = new TextEncoder();

  const entries: Entry[] = files.map((file) => {
    const data = encoder.encode(file.content);
    return { name: file.name, data, crc: crc32(data) };
  });

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);

    writeUint32(view, 0, 0x04034b50); // local file header signature
    writeUint16(view, 4, 20); // version needed
    writeUint16(view, 6, 0); // flags
    writeUint16(view, 8, 0); // method: stored
    writeUint16(view, 10, 0); // modification time
    writeUint16(view, 12, 0); // modification date
    writeUint32(view, 14, entry.crc);
    writeUint32(view, 18, entry.data.length); // compressed size
    writeUint32(view, 22, entry.data.length); // uncompressed size
    writeUint16(view, 26, nameBytes.length);
    writeUint16(view, 28, 0); // extra field length
    header.set(nameBytes, 30);

    offsets.push(offset);
    chunks.push(header, entry.data);
    offset += header.length + entry.data.length;
  }

  const directoryStart = offset;

  for (const [index, entry] of entries.entries()) {
    const nameBytes = encoder.encode(entry.name);
    const record = new Uint8Array(46 + nameBytes.length);
    const view = new DataView(record.buffer);

    writeUint32(view, 0, 0x02014b50); // central directory signature
    writeUint16(view, 4, 20); // version made by
    writeUint16(view, 6, 20); // version needed
    writeUint16(view, 8, 0);
    writeUint16(view, 10, 0); // method: stored
    writeUint16(view, 12, 0);
    writeUint16(view, 14, 0);
    writeUint32(view, 16, entry.crc);
    writeUint32(view, 20, entry.data.length);
    writeUint32(view, 24, entry.data.length);
    writeUint16(view, 28, nameBytes.length);
    writeUint16(view, 30, 0); // extra
    writeUint16(view, 32, 0); // comment
    writeUint16(view, 34, 0); // disk number
    writeUint16(view, 36, 0); // internal attributes
    writeUint32(view, 38, 0); // external attributes
    writeUint32(view, 42, offsets[index] as number);
    record.set(nameBytes, 46);

    chunks.push(record);
    offset += record.length;
  }

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeUint32(endView, 0, 0x06054b50); // end of central directory
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, entries.length);
  writeUint16(endView, 10, entries.length);
  writeUint32(endView, 12, offset - directoryStart);
  writeUint32(endView, 16, directoryStart);
  writeUint16(endView, 20, 0); // comment length

  chunks.push(end);

  return new Blob(chunks as BlobPart[], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
