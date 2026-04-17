#!/usr/bin/env node
// Compress GLBs under public/monsters/ using gltf-transform.
// - Geometry: Draco (decoded at runtime by the already-registered DRACOLoader).
// - Textures: re-encoded as WebP inside the GLB (no loader change needed).
// - Also runs prune + dedup to drop unused data.
//
// Usage:
//   node scripts/compress-glbs.mjs                       # all of public/monsters/
//   node scripts/compress-glbs.mjs --only treekin-animation
//   node scripts/compress-glbs.mjs --in  public/monsters/minotaur
//   node scripts/compress-glbs.mjs --dry-run
//
// Output defaults to public/monsters-compressed/<same subpath>. Originals are untouched.

import { readdir, stat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco, prune, dedup, textureCompress } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { only: null, in: null, out: null, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') args.only = argv[++i];
    else if (a === '--in') args.in = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

async function walkGlbs(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walkGlbs(full));
    else if (e.isFile() && e.name.toLowerCase().endsWith('.glb')) out.push(full);
  }
  return out;
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

async function main() {
  const args = parseArgs(process.argv);

  const inDir = args.in
    ? resolve(projectRoot, args.in)
    : args.only
      ? resolve(projectRoot, 'public/monsters', args.only)
      : resolve(projectRoot, 'public/monsters');

  const outDir = args.out
    ? resolve(projectRoot, args.out)
    : resolve(projectRoot, 'public/monsters-compressed');

  if (!existsSync(inDir)) {
    console.error(`Input dir does not exist: ${inDir}`);
    process.exit(1);
  }

  console.log(`Input : ${relative(projectRoot, inDir)}`);
  console.log(`Output: ${relative(projectRoot, outDir)}`);
  if (args.dryRun) console.log('(dry run — no files will be written)\n');

  const files = await walkGlbs(inDir);
  if (files.length === 0) {
    console.log('No .glb files found.');
    return;
  }
  console.log(`Found ${files.length} .glb file(s).\n`);

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    });

  // Relative root under public/monsters to preserve directory structure in output.
  const monstersRoot = resolve(projectRoot, 'public/monsters');
  const relRoot = inDir.startsWith(monstersRoot) ? monstersRoot : inDir;

  let totalIn = 0;
  let totalOut = 0;
  let failed = 0;

  for (const file of files) {
    const relPath = relative(relRoot, file);
    const outPath = join(outDir, relPath);
    const inSize = (await stat(file)).size;
    totalIn += inSize;

    process.stdout.write(`${relPath}  ${fmtBytes(inSize)} -> `);

    try {
      const doc = await io.read(file);
      await doc.transform(
        prune(),
        dedup(),
        draco({ method: 'edgebreaker' }),
        textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85 }),
      );

      const bytes = await io.writeBinary(doc);
      const outSize = bytes.byteLength;
      totalOut += outSize;

      if (!args.dryRun) {
        await mkdir(dirname(outPath), { recursive: true });
        await writeFile(outPath, bytes);
      }

      const pct = ((1 - outSize / inSize) * 100).toFixed(1);
      console.log(`${fmtBytes(outSize)}  (-${pct}%)`);
    } catch (err) {
      failed++;
      console.log(`FAILED — ${err.message}`);
    }
  }

  console.log('');
  console.log(`Total in : ${fmtBytes(totalIn)}`);
  console.log(`Total out: ${fmtBytes(totalOut)}  (-${((1 - totalOut / totalIn) * 100).toFixed(1)}%)`);
  if (failed) console.log(`Failed   : ${failed}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
