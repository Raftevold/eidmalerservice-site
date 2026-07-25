// Gjer om råbileta frå research/ til optimaliserte filer i public/img.
// Køyrast manuelt ved behov: npm run prep-images
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'research', 'bilder');
const OUT = path.join(__dirname, '..', 'public', 'img');
fs.mkdirSync(OUT, { recursive: true });

// Logoen er kvit på svart. Vi lagar ein variant med gjennomsiktig bakgrunn
// ved å bruke lysstyrken som alfakanal, slik at han kan liggje på kva bakgrunn som helst.
async function kvitLogoMedAlfa(input, output, box) {
  let bilde = sharp(input);
  if (box) bilde = bilde.extract(box);
  const buf = await bilde.toColourspace('b-w').png().toBuffer();
  const { width, height } = await sharp(buf).metadata();
  // Alfa = lysstyrke, RGB = heilkvit
  const kvit = await sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).png().toBuffer();
  await sharp(kvit)
    .joinChannel(buf)
    .png({ compressionLevel: 9 })
    .toFile(output);
}

// Foto -> webp i to breidder, med jpg-fallback i full breidd
async function foto(navn, filnamn, breidder) {
  const input = path.join(SRC, filnamn);
  if (!fs.existsSync(input)) { console.log('hoppar over (finst ikkje):', filnamn); return; }
  for (const b of breidder) {
    await sharp(input)
      .rotate()
      .resize({ width: b, withoutEnlargement: true })
      .webp({ quality: 74, effort: 6 })
      .toFile(path.join(OUT, `${navn}-${b}.webp`));
  }
  await sharp(input)
    .rotate()
    .resize({ width: breidder[breidder.length - 1], withoutEnlargement: true })
    .jpeg({ quality: 76, progressive: true, mozjpeg: true })
    .toFile(path.join(OUT, `${navn}.jpg`));
  console.log('ok:', navn);
}

(async () => {
  const logo = path.join(SRC, 'logo-fb.png');
  if (fs.existsSync(logo)) {
    // Heile ordmerket med ornament
    await kvitLogoMedAlfa(logo, path.join(OUT, 'logo.png'), { left: 20, top: 290, width: 1039, height: 490 });
    // Berre det øvre ornamentet - brukt som seksjonsskilje
    await kvitLogoMedAlfa(logo, path.join(OUT, 'ornament.png'), { left: 295, top: 315, width: 495, height: 140 });
    console.log('ok: logo + ornament');
  }

  await foto('fasade', 'fb-06.jpg', [900, 1600]);      // REMA-fasade frå lift
  await foto('innvendig', 'fb-07.jpg', [700, 1200]);   // veggmåling med rulle
  await foto('golv', 'fb-01.jpg', [700, 1200]);        // banebelegg / golv
  await foto('sproyting', 'fb-05.jpg', [700, 1200]);   // RITMO-sprøytemaskin
  await foto('laget', 'fb-04.jpg', [900, 1600]);       // arbeidslaget ved næringsbygg
  await foto('pauserom', 'fb-03.jpg', [700, 1200]);    // laget i pauserom
  // Rein dekortekstur (KI-generert abstrakt maleflate) - ikkje eit prosjektbilete
  await foto('tekstur', 'tekstur-a.png', [1600]);
})();
