import { HapiItem } from "./hapiItem";
import { EntryStruct } from "./structs";

export class EntryItem extends HapiItem {
    size: number;
    cache: Buffer;

    get struct() {
        return <EntryStruct> this._struct;
    }

    set struct(struct: EntryStruct) {
        this._struct = struct;
    }

    get isDirectory() {
        return false;
    }

    debugPrint() {
        return `${this.path} (${this.size})\n`;
    }
}
