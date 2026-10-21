# Kaine Forge mark

The mark is the Kaine Forge olive tree. It grows through the U-notch of the Byteforge anvil.

## Files

- `kaine-forge-mark.blend`: the Blender source. It contains the anvil, the tree, the camera, and the lights. Textures are packed.
- `render-mark.py`: the script that builds the tree, renders the masters, and makes every derived image.
- `mark-on-dark.png`: 1024 px transparent master with the light steel anvil. Use it on dark backgrounds.
- `mark-on-light.png`: 1024 px transparent master with the dark steel anvil. Use it on light backgrounds.
- `icon-1024.png`: the app icon. The on-dark mark sits on a rounded ink tile (`#121419`).
- `icon-1024-opaque.png`: the same icon as a full-bleed opaque square. iOS needs this version.

## Derived files

The `--derive` step writes these files:

- `media/logo.png` (README logo)
- `apps/mobile/assets/icon.png`, `adaptive-icon.png`, `splash-icon.png`, `splash-icon-dark.png`
- `apps/web/public/favicon.svg` and `apps/web/public/apple-touch-icon.png`

## Re-render

Use Blender 5.2. Run the commands from the repo root.

1. Render the two masters:

   ```sh
   blender -b media/brand/kaine-forge-mark.blend --python media/brand/render-mark.py -- --variant on-dark --out media/brand/mark-on-dark.png
   blender -b media/brand/kaine-forge-mark.blend --python media/brand/render-mark.py -- --variant on-light --out media/brand/mark-on-light.png
   ```

2. Make the icons, logo, mobile assets, and favicons:

   ```sh
   blender -b --factory-startup --python media/brand/render-mark.py -- --derive
   ```

3. Make the desktop icons:

   ```sh
   pnpm --filter @repo/desktop exec tauri icon ../../media/brand/icon-1024.png --ios-color "#121419"
   ```

The script rebuilds the tree, camera, and lights each time. It does not change the anvil. To save a changed scene, add `--save-blend media/brand/kaine-forge-mark.blend` to a render command.
