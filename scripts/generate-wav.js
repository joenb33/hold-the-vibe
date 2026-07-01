// Generates minimal placeholder WAV files for development.
const fs = require('fs');
const path = require('path');

function writeToneWav(filePath, frequencyHz, durationSec, volume = 0.25) {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequencyHz * t) * volume;
    const intSample = Math.max(-1, Math.min(1, sample)) * 32767;
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

const mediaDir = path.join(__dirname, '..', 'media');
writeToneWav(path.join(mediaDir, 'ding.wav'), 880, 0.15, 0.35);
writeToneWav(path.join(mediaDir, 'hold-music.wav'), 440, 2.5, 0.12);
console.log('Wrote media/ding.wav and media/hold-music.wav');
