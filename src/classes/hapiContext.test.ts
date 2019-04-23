import * as fs from 'fs';
import { HapiContext } from './hapiContext';

const HPI = process.cwd() + '/test/v3rocket.hpi';
let bytes = fs.readFileSync(HPI);
let hapi: HapiContext;

beforeAll(() => {
    hapi = null;
    return HapiContext.load(Buffer.from(bytes)).then(ctx => {
        hapi = ctx;
    });
});

test('hapi should parse a valid version', () => {
    expect(hapi.version.get('marker')).toBe(0x49504148);
    expect(hapi.version.get('version')).toBe(0x20000);
});

test('hapi should have a sactisfatory item structure', () => {
    expect(hapi.rootItem.children).toHaveLength(19);
});
