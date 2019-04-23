import * as pako from 'pako';

export function decompressZLib(source: Buffer) {
    let output = pako.inflate(source);
    return Buffer.from(output);
}
