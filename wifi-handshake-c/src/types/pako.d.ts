declare module 'pako' {
  export interface GzipOptions {
    level?: number;
    windowBits?: number;
    memLevel?: number;
    strategy?: number;
    dictionary?: Uint8Array | ArrayBuffer;
  }

  export function gzip(
    data: Uint8Array | ArrayBuffer | string,
    options?: GzipOptions
  ): Uint8Array;
}
