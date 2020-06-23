function formatHexDec(num: number) {
    return `0x${num.toString(16)} (${num})`;
}

export class HapiError {
    static invalidMarker(expected: number, got: number) {
        return new Error(`Invalid HAPI marker. Expected: ${formatHexDec(expected)} Got: ${formatHexDec(got)}`);
    }

    static invalidVersion(expected: number, got: number) {
        return new Error(`Unsupported HAPI version. Expected: ${formatHexDec(expected)} Got: ${formatHexDec(got)}`);
    }
}
