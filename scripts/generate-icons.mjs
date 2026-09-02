import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pngToIco from 'png-to-ico'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const svgPath = path.join(root, 'public/icon.svg')
const buildDir = path.join(root, 'build')
const publicDir = path.join(root, 'public')
const iconsetDir = path.join(publicDir, 'icon.iconset')

// Ensure directories exist
fs.mkdirSync(buildDir, { recursive: true })
fs.mkdirSync(iconsetDir, { recursive: true })

// Sizes for icns iconset (macOS)
const iconsetSpecs = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 },
]

// Sizes for public standalone PNGs and build
const pngSizes = [
  { file: 'public/icon-16.png', size: 16 },
  { file: 'public/icon-32.png', size: 32 },
  { file: 'public/icon-64.png', size: 64 },
  { file: 'public/icon-128.png', size: 128 },
  { file: 'public/icon-256.png', size: 256 },
  { file: 'public/icon-512.png', size: 512 },
  { file: 'public/icon.png', size: 1024 },
  { file: 'build/icon.png', size: 512 },
  { file: 'public/icon-1024.png', size: 1024 },
]

async function generatePng(inputSvg, outputPath, size) {
  await sharp(inputSvg, { density: 300 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outputPath)
  console.log(`→ ${outputPath} (${size}x${size})`)
}

async function main() {
  console.log(`Reading SVG: ${svgPath}`)
  if (!fs.existsSync(svgPath)) {
    console.error('SVG not found:', svgPath)
    process.exit(1)
  }

  // Generate public/build PNGs
  for (const { file, size } of pngSizes) {
    const out = path.join(root, file)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    await generatePng(svgPath, out, size)
  }

  // Generate iconset
  for (const { name, size } of iconsetSpecs) {
    const out = path.join(iconsetDir, name)
    await generatePng(svgPath, out, size)
  }

  // Also ensure 512 for build is copied as public/icon.png already 1024, but build needs 512
  // Generate ICO for Windows (16,24,32,48,64,128,256)
  const icoSizes = [16, 24, 32, 48, 64, 128, 256]
  const icoPngs = []
  for (const s of icoSizes) {
    const tmp = path.join(buildDir, `tmp-${s}.png`)
    await generatePng(svgPath, tmp, s)
    icoPngs.push(tmp)
  }
  console.log('Generating ICO...')
  const icoBuffer = await pngToIco(icoPngs)
  const icoPath = path.join(buildDir, 'icon.ico')
  fs.writeFileSync(icoPath, icoBuffer)
  console.log(`→ ${icoPath}`)
  // Also copy to public for consistency
  fs.writeFileSync(path.join(publicDir, 'icon.ico'), icoBuffer)
  // Cleanup tmp
  for (const p of icoPngs) fs.unlinkSync(p)

  // For ICNS, we'll use iconutil if on macOS
  console.log('Iconset ready at', iconsetDir)
  console.log('Build icons ready at', buildDir)
  console.log('Public icons ready at', publicDir)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
