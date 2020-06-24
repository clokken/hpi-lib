import { Struct, Field } from "./structs";
import { U32, U8 } from "./types";
import { TableFormatter, HorizontalAlignment } from "./utils";

export interface Buffer2D {
    width: number;
    height: number;
    data: Buffer;
}

export type ItemCoord = [number, number, number]; // [index, posX, posY]

const ROAD_NULL = 0xFFFF;
const ROAD_WATER = 0xFFFC;

export class TNTMapper {
    public readonly buffer: Buffer;
    public readonly struct: TNTStruct;

    // Derived data:
    public readonly minimap: Buffer2D;
    public readonly tabmap: Buffer2D;
    public readonly heightMap: Buffer2D;
    public readonly roadMap: Buffer2D;

    public itemList: string[];
    public itemCounts: number[];
    public itemCoords: ItemCoord[];

    constructor(buffer: Buffer, loadItems?: boolean) {
        this.buffer = buffer;
        this.struct = new TNTStruct(buffer);

        let minimapPtr = this.struct.getField('minimapPtr');
        let minimapWidth = this.buffer.readUInt32LE(minimapPtr);
        let minimapHeight = this.buffer.readUInt32LE(minimapPtr + 4);
        this.minimap = {
            width: minimapWidth,
            height: minimapHeight,
            data: this.buffer.slice(minimapPtr + 8, minimapPtr + 8 + (minimapWidth * minimapHeight))
        };

        let tabmapPtr = this.struct.getField('tabmapPtr');
        let tabmapWidth = this.buffer.readUInt32LE(tabmapPtr);
        let tabmapHeight = this.buffer.readUInt32LE(tabmapPtr + 4);
        this.tabmap = {
            width: tabmapWidth,
            height: tabmapHeight,
            data: this.buffer.slice(tabmapPtr + 8, tabmapPtr + 8 + (tabmapWidth * tabmapHeight))
        };

        let mapWidth = this.struct.getField('width');
        let mapHeight = this.struct.getField('height');

        let heightMapPtr = this.struct.getField('heightMapPtr');
        this.heightMap = {
            width: mapWidth,
            height: mapHeight,
            data: this.buffer.slice(heightMapPtr, heightMapPtr + (mapWidth * mapHeight))
        };

        let roadMapPtr = this.struct.getField('roadMapPtr');
        this.roadMap = {
            width: mapWidth,
            height: mapHeight,
            data: this.buffer.slice(roadMapPtr, roadMapPtr + (mapWidth * mapHeight * 2)) // * 2 because each entry is 2 bytes long!
        };

        if (loadItems) {
            this.autoLoadItems();
        }
    }

    private autoLoadItems() {
        let itemCount = this.struct.getField('itemCount');

        this.itemList = new Array(itemCount);
        let itemBuffer = this.buffer.slice(this.struct.getField('itemListPtr'));
        for (let i = 0; i < itemCount; i++) {
            let offset = i * (4 + 128); // 4 = index size; 128 = name size
            let index = itemBuffer.readUInt32LE(offset);
            let name = itemBuffer.toString('utf8', offset + 4, itemBuffer.indexOf(0, offset + 4)); // TODO validate boundary (128 bytes)

            this.itemList[index] = name;
        }

        this.itemCounts = new Array(itemCount);
        this.itemCoords = new Array();
        let roadBuffer = this.roadMap.data; // aka this.buffer.slice(this.struct.get('roadMapPtr'));
        let roadWidth = this.roadMap.width; // aka mapWidth
        let roadHeight = this.roadMap.height; // aka mapHeight

        for (let i = 0; i < roadWidth * roadHeight; i++) {
            let index = roadBuffer.readUInt16LE(i * 2);

            if (index >= itemCount) // if (index == ROAD_NULL || index == ROAD_WATER)
                continue;

            let x = i % roadWidth, y = Math.floor(i / roadWidth);
            let count = this.itemCounts[index];
            this.itemCounts[index] = count ? count + 1 : 1;
            this.itemCoords.push([index, x, y]);
        }
    }

    debugPrint() {
        let itemTable = new TableFormatter({
            header: ['NAME', 'ID', 'NUMBER'],
            hAlignments: [HorizontalAlignment.Center, HorizontalAlignment.Center, HorizontalAlignment.Center]
        });
        for (let i = 0; i < this.struct.getField('itemCount'); i++) {
            let name = this.itemList[i];
            let count = this.itemCounts[i] || 0;

            if (name)
                itemTable.push(name, i, count);
        }
        itemTable.log();

        let coordsTable = TableFormatter.header(['X', 'Y', 'NAME', 'ID']);
        for (let i = 0; i < this.itemCoords.length; i++) {
            let coord = this.itemCoords[i];
            let index = coord[0];
            let x = coord[1], y = coord[2];
            let name = this.itemList[index];

            if (name) {
                coordsTable.push(x, y, name, index);
            }
        }
        coordsTable.log();
    }
}

const TNT = [
    new Field('marker',         U32), // 4
    new Field('width',          U32), // 4
    new Field('height',         U32), // 4
    new Field('seaHeight',      U32), // 4
    new Field('heightMapPtr',   U32), // 4
    new Field('roadMapPtr',     U32), // 4
    new Field('itemListPtr',    U32), // 4
    new Field('itemCount',      U32), // 4
    new Field('textureListPtr', U32), // 4
    new Field('uMapPtr',        U32), // 4
    new Field('vMapPtr',        U32), // 4
    new Field('minimapPtr',     U32), // 4
    new Field('tabmapPtr',      U32), // 4
];
const TNT_SIZE = 13 * 4; // 52 bytes
export type TNTField = 'marker' | 'width' | 'height' | 'seaHeight' | 'heightMapPtr'
    | 'roadMapPtr' | 'itemListPtr' | 'itemCount' | 'textureListPtr' | 'uMapPtr'
    | 'vMapPtr' | 'minimapPtr' | 'tabmapPtr';

export class TNTStruct extends Struct<TNTField> {
    constructor(bytes: Buffer, offset?: number) {
        super(TNT, bytes, offset);
    }

    static get totalLength() { return TNT_SIZE }
}
