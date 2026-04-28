#!/usr/bin/env node

import { execSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const TARGET_MAP = {
  'x86_64-apple-darwin': 'x86_64-apple-darwin',
  'aarch64-apple-darwin': 'aarch64-apple-darwin',
  'x86_64-pc-windows-msvc': 'x86_64-pc-windows-msvc',
  'x86_64-unknown-linux-gnu': 'x86_64-unknown-linux-gnu',
  'aarch64-unknown-linux-gnu': 'aarch64-unknown-linux-gnu',
};

function detectTarget() {
  const { platform, arch } = process;

  if (platform === 'darwin') {
    return arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  }

  if (platform === 'win32') {
    return 'x86_64-pc-windows-msvc';
  }

  if (platform === 'linux') {
    return arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
  }

  throw new Error(`Unsupported platform: ${platform} ${arch}`);
}

function buildSidecar(crate, target, ext) {
  execSync(`cargo build -p ${crate} --release --target ${target}`, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env },
  });

  const binaryName = `${crate}${ext}`;
  const sourcePath = join(projectRoot, 'target', target, 'release', binaryName);
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing built sidecar binary: ${sourcePath}`);
  }

  return sourcePath;
}

function copyIfChanged(sourcePath, destinationPath) {
  if (existsSync(destinationPath)) {
    const source = readFileSync(sourcePath);
    const destination = readFileSync(destinationPath);
    if (source.length === destination.length && source.equals(destination)) {
      return;
    }
  }

  copyFileSync(sourcePath, destinationPath);
}

function main() {
  const args = process.argv.slice(2);
  const targetIndex = args.indexOf('--target');
  const target = targetIndex >= 0 ? args[targetIndex + 1] : detectTarget();

  if (!TARGET_MAP[target]) {
    throw new Error(`Unknown target: ${target}`);
  }

  const isWindows = target.includes('windows');
  const ext = isWindows ? '.exe' : '';
  const binariesDir = join(projectRoot, 'src-tauri', 'binaries');

  if (!existsSync(binariesDir)) {
    mkdirSync(binariesDir, { recursive: true });
  }

  const crates = ['goodnight-server', 'goodnight-mcp-bridge'];

  for (const crate of crates) {
    const sourcePath = buildSidecar(crate, target, ext);
    const destinationPath = join(binariesDir, `${crate}-${target}${ext}`);
    copyIfChanged(sourcePath, destinationPath);
  }
}

main();
