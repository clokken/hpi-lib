import * as fs from 'fs';
import { HapiContext } from './hapiContext';
import { HapiContextLoader } from './hapiContextLoader';

function match(s: string) {
    return s.indexOf('*') != -1 ? wildcardToRegExp(s) : s;
}
function wildcardToRegExp (s: string) {
    return new RegExp('^' + s.split(/\*+/).map(regExpEscape).join('.*') + '$', 'i');
}
function regExpEscape (s: string) {
    return s.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

const HPI = process.cwd() + '/test/v3rocket.hpi';
let bytes = fs.readFileSync(HPI);
let hapi: HapiContext;

beforeAll(() => {
    hapi = null;
    return HapiContextLoader.load(Buffer.from(bytes)).then(ctx => {
        hapi = ctx;
    });
});

test('#findChild should find verpar.fbi', () => {
    let item = hapi.rootItem.findChild('verpar.fbi');
    expect(item.name).toMatch('verpar.fbi');
});

test('#findChild should find *.fbi', () => {
    let item = hapi.rootItem.findChild('*.fbi');
    expect(item.name).toMatch(match('*.fbi'));
});

test('#findChild should find ver*.fbi', () => {
    let item = hapi.rootItem.findChild('ver*.fbi');
    expect(item.name).toMatch(match('ver*.fbi'));
});

test('#findChild should NOT find zilch.fbi', () => {
    let item = hapi.rootItem.findChild('zilch.fbi');
    expect(item).toBeNull();
});

test('#findChildAt should find /unitscb/verpar.fbi', () => {
    let item = hapi.rootItem.findChildAt('/unitscb/verpar.fbi');
    expect(item.path).toMatch('/unitscb/verpar.fbi');
});

test('#findChildAt should find unitscb/verpar.fbi', () => {
    let item = hapi.rootItem.findChildAt('unitscb/verpar.fbi');
    expect(item.parent.name).toMatch('unitscb');
    expect(item.name).toMatch('verpar.fbi');
});

test('#findChildAt should find /unitscb', () => {
    let item = hapi.rootItem.findChildAt('/unitscb');
    expect(item.path).toMatch('/unitscb');
});

test('#findChildAt should find unitscb', () => {
    let item = hapi.rootItem.findChildAt('unitscb');
    expect(item.name).toMatch('unitscb');
});

test('#findChildAt should find unitscb/', () => {
    let item = hapi.rootItem.findChildAt('unitscb/');
    expect(item.name).toMatch('unitscb');
});

test('#findChildAt should NOT find /verpar.fbi', () => {
    let item = hapi.rootItem.findChildAt('/verpar.fbi');
    expect(item).toBeNull();
});

test('#findChildAt should NOT find /unitscb/verpar.fbi/', () => {
    let item = hapi.rootItem.findChildAt('/unitscb/verpar.fbi/');
    expect(item).toBeFalsy();
});

test('#findChildAt should find /anims/buildpic', () => {
    let item = hapi.rootItem.findChildAt('/anims/buildpic');
    expect(item.path.toLowerCase()).toMatch('/anims/buildpic/');
});

test('#findChildAt should NOT find /buildpic', () => {
    let item = hapi.rootItem.findChildAt('/buildpic');
    expect(item).toBeFalsy();
});

test('#findChildren should find 5 items matching a pattern', () => {
    let items = hapi.rootItem.findChildren('*.fbi', 5);
    expect(items).toHaveLength(5);
    items.forEach(item => {
        expect(item.name).toMatch(match('*.fbi'));
    });
});

test('#findChildAt should find /unitscb/ver*.fbi', () => {
    let item = hapi.rootItem.findChildAt('/unitscb/ver*.fbi');
    expect(item.path).toMatch(match('/unitscb/ver*.fbi'));
});

test('#findChildAt should find all items of pattern /*/ver*.fbi', () => {
    let item = hapi.rootItem.findChildAt('/*/ver*.fbi');
    expect(item.path).toMatch(match('/*/ver*.fbi'));
});

test('#findChildrenAt should find 5 items of pattern /*/ver*/*', () => {
    let items = hapi.rootItem.findChildrenAt('/*/ver*/*', 5);
    expect(items).toHaveLength(5);
    items.forEach(item => {
        expect(item.path).toMatch(match('/*/ver*/*'));
    });
});
