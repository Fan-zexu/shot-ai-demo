export interface ByteRange {
  start: number;
  end: number;
  length: number;
}

export function parseByteRange(header: string | undefined, size: number): ByteRange | null {
  if (!header) return null;
  if (size <= 0 || !header.startsWith('bytes=') || header.includes(',')) {
    throw new RangeError('RANGE_NOT_SATISFIABLE');
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new RangeError('RANGE_NOT_SATISFIABLE');
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      throw new RangeError('RANGE_NOT_SATISFIABLE');
    }
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || start >= size) {
      throw new RangeError('RANGE_NOT_SATISFIABLE');
    }
    end = Math.min(end, size - 1);
  }
  return { start, end, length: end - start + 1 };
}
