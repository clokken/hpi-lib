import { HapiItem, ReadonlyHapiItem } from "./hapiItem";
import { ReadonlyStruct, DirectoryField, Struct } from "./structs";
import { ReadonlyEntryItem } from './entryItem';

export enum ItemFilter {
    ANY,
    ENTRY_ONLY,
    DIRECTORY_ONLY,
}

export class ReadonlyDirectoryItem extends ReadonlyHapiItem {
    protected _children: ReadonlyHapiItem[];
    protected _struct: ReadonlyStruct<DirectoryField>;

    get children() { return this._children; }
    get struct() { return this._struct; }

    get isDirectory() {
        return true;
    }

    debugPrint() {
        let me = `${this.path}\n`;
        let children = this.children.map(child => child.debugPrint()).join('');
        return me + children;
    }

    findChildren(name: string, limit?: number, filter?: ItemFilter.ENTRY_ONLY, recurseDown?: boolean): ReadonlyEntryItem[];
    findChildren(name: string, limit?: number, filter?: ItemFilter.DIRECTORY_ONLY, recurseDown?: boolean): ReadonlyDirectoryItem[];
    findChildren(name: string, limit?: number, filter?: ItemFilter, recurseDown?: boolean): ReadonlyHapiItem[];

    findChildren(name: string, limit: number = -1, filter = ItemFilter.ANY, recurseDown = true): ReadonlyHapiItem[] {
        if (limit === null)
            limit = -1;

        let result: ReadonlyHapiItem[] = [];

        name = name.toLowerCase();
        let regexp: RegExp = null;

        if (name.indexOf('*') > -1)
            regexp = wildcardToRegExp(name);

        for (let i = 0; i < this.children.length; i++) {
            let child = this.children[i];
            let match = false;

            if (filter == ItemFilter.DIRECTORY_ONLY && !child.isDirectory)
                continue;
            if (filter == ItemFilter.ENTRY_ONLY && child.isDirectory)
                continue;

            if (regexp)
                match = regexp.exec(child.name.toLowerCase()) != null;
            else
                match = name == child.name.toLowerCase();

            if (match)
                result.push(child);

            if (result.length == limit)
                return result;
        }

        if (!recurseDown)
            return result;

        for (let i = 0; i < this.children.length; i++) {
            let child = this.children[i];
            if (!child.isDirectory)
                continue;

            let remainder = limit == -1 ? -1 : (limit - result.length);
            let recursedChildren = (<ReadonlyDirectoryItem> child).findChildren(name, remainder, filter, true);

            if (recursedChildren.length)
                result = result.concat(recursedChildren);

            if (result.length == limit)
                break;
        }

        return result;
    }

    findChild(name: string, filter?: ItemFilter.ENTRY_ONLY, recurseDown?: boolean): ReadonlyEntryItem;
    findChild(name: string, filter?: ItemFilter.DIRECTORY_ONLY, recurseDown?: boolean): ReadonlyDirectoryItem;
    findChild(name: string, filter?: ItemFilter, recurseDown?: boolean): ReadonlyHapiItem;

    findChild(name: string, filter = ItemFilter.ANY, recurseDown = true): ReadonlyHapiItem {
        let result = this.findChildren(name, 1, filter, recurseDown);
        return result.length ? result[0] : null;
    }

    private findChildrenAtNodes(nodes: string[], nodePos: number, limit: number, filter = ItemFilter.ANY): ReadonlyHapiItem[] {
        let result: ReadonlyHapiItem[] = [];

        let currentNode = nodes[nodePos];
        let isLast = nodePos == nodes.length - 1;
        let nextFilter = isLast ? filter : ItemFilter.DIRECTORY_ONLY;
        let nextLimit = isLast ? limit : -1;

        let find = this.findChildren(currentNode, nextLimit, nextFilter, false);

        if (isLast) {
            result = result.concat(find);
            return result;
        }

        for (let i = 0; i < find.length; i++) {
            let child = find[i];
            if (child.isDirectory) {
                let remainder = limit == -1 ? -1 : (limit - result.length);
                let subResult = (<ReadonlyDirectoryItem> child).findChildrenAtNodes(nodes, nodePos + 1, remainder, filter);

                if (subResult.length)
                    result = result.concat(subResult);

                if (result.length == limit)
                    break;
            }
        }

        return result;
    }

    findChildrenAt(fullpath: string, limit?: number, filter?: ItemFilter.ENTRY_ONLY): ReadonlyEntryItem[];
    findChildrenAt(fullpath: string, limit?: number, filter?: ItemFilter.DIRECTORY_ONLY): ReadonlyDirectoryItem[];
    findChildrenAt(fullpath: string, limit?: number, filter?: ItemFilter): ReadonlyHapiItem[];

    findChildrenAt(fullpath: string, limit: number = -1, filter: ItemFilter = ItemFilter.ANY): ReadonlyHapiItem[] {
        if (limit === null)
            limit = -1;

        let expectDirectory = fullpath.endsWith('/');
        if (expectDirectory)
            fullpath = fullpath.substr(0, fullpath.length - 1);

        let nodes = fullpath.split('/'); // [ '', 'unitscb', 'arabow.fbi' ]
        if (nodes[0] == '')
            nodes = nodes.slice(1);

        let result = this.findChildrenAtNodes(nodes, 0, limit, expectDirectory ? ItemFilter.DIRECTORY_ONLY : ItemFilter.ANY);

        if (filter === ItemFilter.ENTRY_ONLY)
            return result.filter(item => !item.isDirectory);

        if (filter === ItemFilter.DIRECTORY_ONLY)
            return result.filter(item => item.isDirectory);

        return result;
    }

    findChildAt(fullpath: string, filter?: ItemFilter.DIRECTORY_ONLY): ReadonlyDirectoryItem;
    findChildAt(fullpath: string, filter?: ItemFilter.ENTRY_ONLY): ReadonlyEntryItem;

    findChildAt(fullpath: string, filter: ItemFilter = ItemFilter.ANY): ReadonlyHapiItem {
        let children = this.findChildrenAt(fullpath, 1, filter);
        let result = children.length ? children[0] : null;

        if (result === null)
            return null;

        if (filter === ItemFilter.ENTRY_ONLY)
            return result.isDirectory ? null : result;

        if (filter === ItemFilter.DIRECTORY_ONLY)
            return result.isDirectory ? result : null;

        return result;
    }
}

export class DirectoryItem extends ReadonlyDirectoryItem {
    get struct() {
        return this._struct as Struct<DirectoryField>;
    }

    get children() {
        return this._children as HapiItem[];
    }

    setStruct(struct: Struct<DirectoryField>) { this._struct = struct; }
    setChildren(children: HapiItem[]) { this._children = children; }

    // Make HapiItem fields writeable:
    setParent(parent: DirectoryItem) { this._parent = parent; }
    setName(name: string) { this._name = name; }
    setPath(path: string) { this._path = path; }
    setStructOrigin(structOrigin: number) { this._structOrigin = structOrigin; }
}

function wildcardToRegExp (s: string) {
    return new RegExp('^' + s.split(/\*+/).map(regExpEscape).join('.*') + '$');
}

function regExpEscape (s: string) {
    return s.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}
