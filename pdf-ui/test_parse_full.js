import fs from 'fs';
import { parsePdfFile } from './src/lib/pdfParser.js';

// Create a mock File object since parsePdfFile expects a File with arrayBuffer()
class MockFile {
  constructor(buffer, name) {
    this.buffer = buffer;
    this.name = name;
  }
  async arrayBuffer() {
    return this.buffer.buffer.slice(this.buffer.byteOffset, this.buffer.byteOffset + this.buffer.byteLength);
  }
}

const pdfPath = '../Sample PDFs/ShriButBhavaniFertilizer-Viramgam_SetupBased_01-04-25_31-03-26-2.PDF';

async function main() {
  try {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const file = new MockFile(data, "test.pdf");
    const result = await parsePdfFile(file);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Error during parsePdfFile:", err);
  }
}

main();
