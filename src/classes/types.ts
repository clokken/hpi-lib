export class IntWrapper {
    readonly size: number;
    readonly signed: boolean;

    constructor(size: number, signed: boolean) {
        this.size = size;
        this.signed = signed;
    }
}

export const I8 = new IntWrapper(8, true);
export const U8 = new IntWrapper(8, false);
export const I32 = new IntWrapper(32, true);
export const U32 = new IntWrapper(32, false);
