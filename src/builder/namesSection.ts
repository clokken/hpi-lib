export interface MappedName {
    readonly key?: any;
    readonly position: number;
    readonly name: string;
}

export class NamesSection {
    private mappedNames: MappedName[];
    private totalLength = 0;

    constructor() {
        this.mappedNames = [];
    }

    pushName(name: string, key?: any, filterASCII = true): MappedName {
        if (filterASCII)
            name = NamesSection.filterASCII(name);

        let mappedName: MappedName = {
            key: key,
            name: name,
            position: this.totalLength,
        };

        this.mappedNames.push(mappedName);
        this.totalLength += mappedName.name.length + 1; // + 1 = null-terminator
        return mappedName;
    }

    compile(): Buffer {
        let result = Buffer.alloc(this.totalLength);

        this.mappedNames.forEach(next => {
            result.write(next.name, next.position, 'ascii');
            result.writeUInt8(0, next.position + next.name.length); // null terminator; this line is probably redundant
        });

        return result;
    }

    getNames(): ReadonlyArray<MappedName> {
        return this.mappedNames;
    }

    private static filterASCII(str: string): string {
        return str.replace(/[^\x00-\x7F]/g, "");
    }
}
