import test from "node:test";
import assert from "node:assert/strict";
import { parseFcsFile, parseFcsHeader } from "../web/src/modules/fcs.js";

function pad8(n) {
  return String(n).padStart(8, " ");
}

function encodeLatin1(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
  return bytes;
}

test("fcs: parseFcsHeader reads segment offsets", () => {
  const header = "FCS3.0    " + pad8(58) + pad8(80) + pad8(81) + pad8(88) + pad8(0) + pad8(0);
  assert.equal(header.length, 58);
  const buf = new ArrayBuffer(58);
  new Uint8Array(buf).set(encodeLatin1(header));
  const h = parseFcsHeader(buf);
  assert.equal(h.version, "FCS3.0");
  assert.equal(h.textStart, 58);
  assert.equal(h.textEnd, 80);
  assert.equal(h.dataStart, 81);
  assert.equal(h.dataEnd, 88);
});

test("fcs: parseFcsFile reads preview points from DATA segment", async () => {
  const delim = "|";
  const nEvents = 2;
  const nParams = 2;

  // We'll place TEXT right after header.
  let text = delim;
  text += "$TOT" + delim + String(nEvents) + delim;
  text += "$PAR" + delim + String(nParams) + delim;
  text += "$DATATYPE" + delim + "I" + delim;
  text += "$BYTEORD" + delim + "1,2,3,4" + delim;
  text += "$P1N" + delim + "FSC-A" + delim;
  text += "$P1B" + delim + "16" + delim;
  text += "$P2N" + delim + "SSC-A" + delim;
  text += "$P2B" + delim + "16" + delim;
  // $BEGINDATA/$ENDDATA filled later after we compute offsets.

  const textStart = 58;
  const textBytesBase = encodeLatin1(text);
  const textEndBase = textStart + textBytesBase.length - 1;

  const dataStart = textEndBase + 1 + 20; // give some slack to update text with offsets

  const bytesPerEvent = 4; // 2 params * 2 bytes
  const dataEnd = dataStart + bytesPerEvent * nEvents - 1;

  // Now rebuild TEXT with data offsets.
  text += "$BEGINDATA" + delim + String(dataStart) + delim;
  text += "$ENDDATA" + delim + String(dataEnd) + delim;
  const textBytes = encodeLatin1(text);
  const textEnd = textStart + textBytes.length - 1;

  const headerStr =
    "FCS3.0    " + pad8(textStart) + pad8(textEnd) + pad8(dataStart) + pad8(dataEnd) + pad8(0) + pad8(0);

  const totalLen = dataEnd + 1;
  const file = new Uint8Array(totalLen);
  file.set(encodeLatin1(headerStr), 0);
  file.set(textBytes, textStart);

  // DATA: little endian uint16 pairs
  const dv = new DataView(file.buffer);
  // event 0
  dv.setUint16(dataStart + 0, 1000, true);
  dv.setUint16(dataStart + 2, 2000, true);
  // event 1
  dv.setUint16(dataStart + 4, 1500, true);
  dv.setUint16(dataStart + 6, 2500, true);

  const parsed = await parseFcsFile(file.buffer);
  assert.equal(parsed.nEvents, 2);
  assert.equal(parsed.params.length, 2);
  assert.equal(parsed.preview.n, 2);
  assert.deepEqual(Array.from(parsed.preview.channels[0]), [1000, 1500]);
  assert.deepEqual(Array.from(parsed.preview.channels[1]), [2000, 2500]);
});

