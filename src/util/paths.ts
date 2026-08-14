import path from 'path';

// webpack always outputs the frontend build to <packageRoot>/lib/public.
// This file sits at src/util in source and lib/util once compiled — two levels up is the package
// root either way, so tests running against src and production running lib resolve the same build.
const packageRoot = path.join(__dirname, '../..');

export const PUBLIC_DIR = path.join(packageRoot, 'lib/public');

export const DEVTOOLS_DIR = path.join(PUBLIC_DIR, 'devtools');
