const textEncoder = new TextEncoder();

export function utf8Bytes(text: string) {
  return textEncoder.encode(text);
}

export function concatBytes(parts: Uint8Array[]) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[index] = value >>> 0;
}

export function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function adler32(bytes: Uint8Array) {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

export function uint32be(value: number) {
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

function uint16le(value: number) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function uint32le(value: number) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}

export function pngChunk(type: string, data: Uint8Array) {
  const typeBytes = utf8Bytes(type);
  return concatBytes([uint32be(data.length), typeBytes, data, uint32be(crc32(concatBytes([typeBytes, data])))]);
}

export function deflateStored(bytes: Uint8Array) {
  const blocks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += 65535) {
    const chunk = bytes.slice(offset, offset + 65535);
    const header = new Uint8Array(5);
    header[0] = offset + chunk.length >= bytes.length ? 1 : 0;
    header[1] = chunk.length & 0xff;
    header[2] = (chunk.length >>> 8) & 0xff;
    const inverted = (~chunk.length) & 0xffff;
    header[3] = inverted & 0xff;
    header[4] = (inverted >>> 8) & 0xff;
    blocks.push(header, chunk);
  }
  return concatBytes([new Uint8Array([0x78, 0x01]), ...blocks, uint32be(adler32(bytes))]);
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

export interface ZipEntryInput {
  path: string;
  content: string | Uint8Array;
}

export function createZip(entries: ZipEntryInput[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const { dosTime, dosDate } = dosDateTime();

  for (const entry of entries) {
    const name = utf8Bytes(entry.path);
    const content = typeof entry.content === "string" ? utf8Bytes(entry.content) : entry.content;
    const crc = crc32(content);
    const local = concatBytes([
      uint32le(0x04034b50),
      uint16le(20),
      uint16le(0),
      uint16le(0),
      uint16le(dosTime),
      uint16le(dosDate),
      uint32le(crc),
      uint32le(content.length),
      uint32le(content.length),
      uint16le(name.length),
      uint16le(0),
      name,
      content
    ]);
    localParts.push(local);
    centralParts.push(concatBytes([
      uint32le(0x02014b50),
      uint16le(20),
      uint16le(20),
      uint16le(0),
      uint16le(0),
      uint16le(dosTime),
      uint16le(dosDate),
      uint32le(crc),
      uint32le(content.length),
      uint32le(content.length),
      uint16le(name.length),
      uint16le(0),
      uint16le(0),
      uint16le(0),
      uint16le(0),
      uint32le(0),
      uint32le(offset),
      name
    ]));
    offset += local.length;
  }

  const central = concatBytes(centralParts);
  const end = concatBytes([
    uint32le(0x06054b50),
    uint16le(0),
    uint16le(0),
    uint16le(entries.length),
    uint16le(entries.length),
    uint32le(central.length),
    uint32le(offset),
    uint16le(0)
  ]);
  return concatBytes([...localParts, central, end]);
}
