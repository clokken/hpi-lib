export enum HorizontalAlignment {
    Left, Center, Right
}

export interface BoxBorders {
    h: string;   // horizontal |
    v: string;   // vertical -
    tr: string;  // TOP-RIGHT aka |_
    br: string;  // BOTTOM-RIGHT
    bl: string;  // BOTTOM-LEFT
    tl: string;  // TOP-LEFT aka _|
    tlb: string; // TOP-LEFT-BOTTOM aka -|
    trb: string; // TOP-RIGHT-BOTTOM aka |-
    lbr: string; // LEFT-BOTTOM-RIGHT aka T shape
    ltr: string; // LEFT-TOP-RIGHT
    x: string;   // all directions aka +
}

export interface TableFormatterOptions {
    header?: string[];  // Always prefer names with an EVEN length number
    filler?: string,
    padding?: number;
    hAlignments?: HorizontalAlignment[];
    hBorder?: string;
    vBorder?: string;

    boxBorders?: BoxBorders
}

const TABLE_FORMATTER_DEFAULT: TableFormatterOptions = {
    filler: ' ',
    padding: 1,
    /*borderTop: ' ' + '\u0332',
    borderBottom: '\u203E'*/
};

const BOX_BORDERS_REGULAR: BoxBorders = {
    h: '\u2502',
    v: '\u2500',
    tr: '\u2514',
    br: '\u250c',
    bl: '\u2510',
    tl: '\u2518',
    tlb: '\u2524',
    trb: '\u251c',
    lbr: '\u252c',
    ltr: '\u2534',
    x: '\u253c'
};

const BOX_BORDERS_BOLD: BoxBorders = {
    h: '\u2503',
    v: '\u2501',
    tr: '\u2517',
    br: '\u250f',
    bl: '\u2513',
    tl: '\u251b',
    tlb: '\u252b',
    trb: '\u2523',
    lbr: '\u2533',
    ltr: '\u253b',
    x: '\u254b'
};

const BOX_BORDERS_DOUBLE: BoxBorders = {
    h: '\u2551',
    v: '\u2550',
    tr: '\u255a',
    br: '\u2554',
    bl: '\u2557',
    tl: '\u255d',
    tlb: '\u2563',
    trb: '\u2560',
    lbr: '\u2566',
    ltr: '\u2569',
    x: '\u256c'
};

export class TableFormatter {
    private options: TableFormatterOptions;

    private rows: string[][];
    private columnWidths: number[];
    private result: string;

    constructor(options?: TableFormatterOptions) {
        if (options) {
            this.options = {
                header: options.header || TABLE_FORMATTER_DEFAULT.header,
                filler: options.filler || TABLE_FORMATTER_DEFAULT.filler,
                padding: options.padding || TABLE_FORMATTER_DEFAULT.padding,
                hAlignments: options.hAlignments || TABLE_FORMATTER_DEFAULT.hAlignments,
                hBorder: options.hBorder || TABLE_FORMATTER_DEFAULT.hBorder,
                vBorder: options.vBorder || TABLE_FORMATTER_DEFAULT.vBorder,
                boxBorders: options.boxBorders || BOX_BORDERS_REGULAR,
            };
        } else {
            this.options = TABLE_FORMATTER_DEFAULT;
        }

        if (this.options.boxBorders) {
            if (!this.options.hBorder)
                this.options.hBorder = this.options.boxBorders.h;
            if (!this.options.vBorder)
                this.options.vBorder = this.options.boxBorders.v;
        }

        this.rows = [];
        if (this.options.header)
            this.columnWidths = options.header.map(col => col.length);
        else
            this.columnWidths = [];
    }

    static header(header: string[]) {
        return new this({
            header: header
        });
    }

    push(...values: any[]) {
        this.result = null;

        for (let i = 0; i < values.length; i++) {
            let value = new String(values[i]);
            let width = value.length;

            if (this.columnWidths[i])
                this.columnWidths[i] = Math.max(this.columnWidths[i], width);
            else
                this.columnWidths[i] = width;
        }

        this.rows.push(values);
    }

    get() {
        if (this.result)
            return this.result;

        this.result = '';

        const vBorder = this.options.vBorder;
        const header = this.options.header;
        let borderStr = '';

        if (header && header.length) {
            if (vBorder) {
                for (let i = 0; i < header.length; i++) {
                    this.result += this.makeBorderCell(i, 0);
                }

                this.result += '\n';
            }

            for (let i = 0; i < header.length; i++) {
                this.result += this.makeCell(header[i], i);
            }

            if (vBorder) {
                this.result += '\n';

                for (let i = 0; i < header.length; i++) {
                    this.result += this.makeBorderCell(i, 1);
                }
            }
        }

        for (let y = 0; y < this.rows.length; y++) {
            let row = this.rows[y];
            let rowStr = '';

            for (let x = 0; x < row.length; x++) {
                let cell = row[x];
                rowStr += this.makeCell(cell + '', x);
            }

            if (vBorder) {
                rowStr += '\n';
                for (let x = 0; x < row.length; x++)
                    rowStr += this.makeBorderCell(x, 2 + y);
            }

            this.result += '\n' + rowStr;

            /*if (y == this.rows.length - 1)
                this.result += '\n' + borderBottom.repeat(rowStr.length);*/
        }

        return this.result;
    }

    private makeCell(str: string, columnIndex: number) {
        const filler = this.options.filler;
        const padding = this.options.padding;
        const hBorder = this.options.hBorder;
        const alignment = this.options.hAlignments ?
            this.options.hAlignments[columnIndex] : HorizontalAlignment.Left;

        let fillSize = this.columnWidths[columnIndex] - str.length;
        let fillStr = fillSize ? filler.repeat(fillSize) : '';
        let padStr = padding ? filler.repeat(padding) : '';
        let innerStr = str;

        if (fillSize > 0) {
            if (alignment == HorizontalAlignment.Center) {
                let remainder = fillSize % 2;
                let fillHalf = Math.floor(fillSize / 2);
                let fillLeft = filler.repeat(fillHalf);
                let fillRight = filler.repeat(fillHalf + remainder);
                innerStr = fillLeft + str + fillRight;
            }
            else if (alignment == HorizontalAlignment.Right) {
                innerStr = fillStr + str;
            } else {
                innerStr = str + fillStr;
            }
        }

        if (columnIndex == 0)
            return hBorder + padStr + innerStr + padStr + hBorder;
        else
            return padStr + innerStr + padStr + hBorder;
    }

    private makeBorderCell(columnIndex: number, rowIndex: number) {
        const isLastCol = columnIndex == this.columnWidths.length - 1;
        const isLastRow = rowIndex == this.rows.length + (this.options.header ? 1 : 0);
        const isFirstCol = columnIndex == 0;
        const isFirstRow = rowIndex == 0;

        const borders = this.options.boxBorders;
        let size = this.columnWidths[columnIndex] + (this.options.padding * 2);

        if (this.options.hBorder) {
            size += this.options.hBorder.length;
            if (columnIndex == 0) size++;
        }

        if (!borders) {
            return this.options.vBorder.repeat(size);
        }

        let resultPre = '';
        let resultPos = '';

        if (isFirstRow) {
            if (isFirstCol) {
                resultPre = borders.br; size--;
                resultPos = borders.lbr; size--;
            }
            else if (isLastCol) {
                resultPos = borders.bl; size--;
            }
            else { // mid col
                resultPos = borders.lbr; size--;
            }
        }
        else if (isLastRow) {
            if (isFirstCol) {
                resultPre = borders.tr; size--;
                resultPos = borders.ltr; size--;
            }
            else if (isLastCol) {
                resultPos = borders.tl; size--;
            }
            else { // mid col
                resultPos = borders.ltr; size--;
            }
        }
        else { // mid row
            if (isFirstCol) {
                resultPre = borders.trb; size--;
                resultPos = borders.x; size--;
            }
            else if (isLastCol) {
                resultPos = borders.tlb; size--;
            }
            else { // mid col
                resultPos = borders.x; size--;
            }
        }

        let resultMid = this.options.vBorder.repeat(size);
        return resultPre + resultMid + resultPos;
    }

    log() {
        if (!this.result)
            this.get();

        console.log(this.result);
    }
}
