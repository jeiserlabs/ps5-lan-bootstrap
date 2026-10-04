const fs = require('fs');
const { execSync } = require('child_process');

const dir = 'C:\\Users\\dev\\AppData\\Roaming\\IDM\\DwnlData\\dev\\M_43942_v1.00_-5B11._138';
const outFile = 'E:\\M_43942_v1.00_[11.00]_OPOISSO893-[DLPSGAME.COM].part4.rar';

const chunk0 = `${dir}\\M_43942_v1.00_-5B11..rar`;
const chunk3 = `${dir}\\M_43942_v1.00_-5B11..rar3`;
const chunk5 = `${dir}\\M_43942_v1.00_-5B11..rar5`;

console.log('Testing assembly of part 4...');
console.log('Chunk0:', fs.statSync(chunk0).size);
console.log('Chunk3:', fs.statSync(chunk3).size);
console.log('Chunk5:', fs.statSync(chunk5).size);

// Assemble: chunk0 + chunk3 + chunk5
const out = fs.openSync(outFile, 'w');
const buf = Buffer.alloc(16 * 1024 * 1024); // 16MB buffer

for (const file of [chunk0, chunk3, chunk5]) {
  console.log(`Writing ${file}...`);
  const fd = fs.openSync(file, 'r');
  let bytesRead = 0;
  while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
    fs.writeSync(out, buf, 0, bytesRead);
  }
  fs.closeSync(fd);
}
fs.closeSync(out);

console.log('Done assembling. Final size:', fs.statSync(outFile).size);

// Test with 7-Zip!
console.log('Running 7-Zip CRC test...');
try {
  const testRes = execSync(`"C:\\Program Files\\7-Zip\\7z.exe" t -pDLPSGAME.COM "${outFile}"`, { encoding: 'utf8' });
  console.log('7-Zip result:\n', testRes);
} catch (e) {
  console.error('7-Zip test failed:', e.stdout || e.message);
}
