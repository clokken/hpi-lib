import { HapiContextBuilder, FileOrDirectory, File } from "./src/builder/hapiContextBuilder";
import { HapiContextLoader } from "./src";
import * as Fs from 'fs';
import * as Path from 'path';

async function test() {
    let srcPath = Path.resolve('./src');
    let srcPath2 = Path.resolve('./test');
    let toClose: Fs.ReadStream[] = [];

    // TODO pass the whole src folder!

    let fileOrDirs: FileOrDirectory[] = [];

    function foo(nextPath: string) {
        let resultList: FileOrDirectory[] = [];
        let stats = Fs.statSync(nextPath);

        if (stats.isFile()) {
            let rs = Fs.createReadStream(nextPath);
            resultList.push({
                name: Path.basename(nextPath),
                input: rs,
                size: stats.size,
            });
            toClose.push(rs);
        }
        else {
            let children: FileOrDirectory[] = [];
            let childrenNames = Fs.readdirSync(nextPath);
            childrenNames.map(n => Path.join(nextPath, n)).forEach(child => {
                children.push(...foo(child));
            });

            resultList.push({
                name: Path.basename(nextPath),
                children: children,
            });
        }

        return resultList;
    }

    fileOrDirs.push(...foo(srcPath));
    fileOrDirs.push(...foo(srcPath2));

    console.log('Building HAPI...')
    let outputBuffer = await HapiContextBuilder.buildBuffer(fileOrDirs);
    console.log('OK');
    // Fs.writeFileSync(OUT_DESKTOP, outputBuffer);

    toClose.forEach(rs => rs.close());

    //:: READ IT BACK!

    console.log('Reading HAPI...');
    let hapi = await HapiContextLoader.load(outputBuffer);
    console.log(hapi.rootItem.debugPrint());
    console.log('OK');
}

test().catch(console.error);
