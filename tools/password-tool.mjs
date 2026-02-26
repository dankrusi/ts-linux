#!/usr/bin/env node
import { randomBytes, webcrypto } from "node:crypto";

const crypto = webcrypto;
const textEncoder = new TextEncoder();
const PASSWORD_HASH_VERSION = "twx2";

const decodePepper = (encoded) => {
  return encoded
    .map((value, index) => {
      return String.fromCharCode(value ^ ((index * 41 + 73) & 0xff));
    })
    .join("");
};

const PEPPER_A = decodePepper([
  61, 5, 238, 173, 192, 102, 87, 9, 226, 223, 206, 109, 89, 46, 239, 209, 244, 116, 25
]);
const PEPPER_B = decodePepper([
  61, 5, 238, 173, 192, 102, 87, 9, 226, 223, 206, 110, 80, 42, 230, 157, 175, 48
]);
const PEPPER_C = decodePepper([
  61, 5, 238, 173, 192, 102, 87, 9, 226, 223, 206, 107, 84, 51, 234, 209, 244, 116, 25
]);

const toHex = (bytes) => {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
};

const fromHex = (value) => {
  if (!/^[\da-f]+$/i.test(value) || value.length % 2 !== 0) {
    throw new Error(`invalid hex value: ${value}`);
  }

  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < value.length; i += 2) {
    bytes[i / 2] = Number.parseInt(value.slice(i, i + 2), 16);
  }
  return bytes;
};

const joinBytes = (...chunks) => {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
};

const rotateLeft8 = (value, amount) => {
  const shift = amount % 8;
  return ((value << shift) | (value >> (8 - shift))) & 0xff;
};

const shaDigest = async (algorithm, payload) => {
  const digest = await crypto.subtle.digest(algorithm, payload);
  return new Uint8Array(digest);
};

const mixPhase = (input, reference, salt) => {
  const mixed = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const left = input[i] ?? 0;
    const right = reference[i % reference.length] ?? 0;
    const saltByte = salt[(i * 7) % salt.length] ?? 0;
    const spun = rotateLeft8((left ^ right ^ saltByte ^ ((i * 17 + 31) & 0xff)) & 0xff, (i % 7) + 1);
    mixed[i] = spun;
  }
  return mixed;
};

const hashPasswordWithSalt = async (password, saltHex) => {
  const salt = fromHex(saltHex.toLowerCase());
  const normalized = password.normalize("NFKC");
  const passwordBytes = textEncoder.encode(normalized);

  const phaseA = await shaDigest(
    "SHA-256",
    joinBytes(textEncoder.encode(PEPPER_A), salt, passwordBytes, textEncoder.encode(String(passwordBytes.length)))
  );

  const phaseBSeed = await shaDigest(
    "SHA-512",
    joinBytes(textEncoder.encode(PEPPER_B), phaseA, salt, passwordBytes)
  );
  const phaseB = mixPhase(phaseBSeed, phaseA, salt);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    joinBytes(phaseB.slice(0, 48), passwordBytes, salt),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const iterations = 75000 + (salt[0] ?? 0) * 97 + (salt[1] ?? 0) * 53;
  const pbkdfBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: joinBytes(salt, phaseA.slice(0, 8), phaseB.slice(0, 8)),
      iterations
    },
    keyMaterial,
    256
  );
  const phaseC = new Uint8Array(pbkdfBits);

  const braid = new Uint8Array(96);
  for (let i = 0; i < braid.length; i += 1) {
    const a = phaseA[i % phaseA.length] ?? 0;
    const b = phaseB[i % phaseB.length] ?? 0;
    const c = phaseC[i % phaseC.length] ?? 0;
    const d = salt[i % salt.length] ?? 0;
    const value = a ^ b ^ c ^ d ^ ((i * 29 + 19) & 0xff);
    braid[i] = rotateLeft8(value & 0xff, (i % 5) + 1);
  }

  const digest = await shaDigest(
    "SHA-256",
    joinBytes(textEncoder.encode(PEPPER_C), braid, phaseC, salt, phaseA.slice(0, 16))
  );

  return `${PASSWORD_HASH_VERSION}$${saltHex.toLowerCase()}$${toHex(digest)}`;
};

const generatePassword = (length) => {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+[]{}";
  const bytes = randomBytes(Math.max(12, length));
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    const index = bytes[i] % alphabet.length;
    out += alphabet[index];
  }
  return out;
};

const usage = () => {
  console.log("Usage: pnpm pwtool -- [--user NAME] [--password VALUE] [--length N] [--salt HEX] [--json]");
  console.log("");
  console.log("Examples:");
  console.log("  pnpm pwtool -- --user guest --password guest");
  console.log("  pnpm pwtool -- --length 24");
  console.log("  pnpm pwtool -- --password root --salt 50f2a4c71e3d9984a4f95d4bc38af6f0");
};

const main = async () => {
  const args = process.argv.slice(2);

  let user = "user";
  let password;
  let length = 20;
  let saltHex;
  let asJson = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      usage();
      return;
    }

    if (arg === "--user") {
      user = args[i + 1] ?? user;
      i += 1;
      continue;
    }

    if (arg === "--password") {
      password = args[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--length" || arg === "-l") {
      const raw = Number.parseInt(args[i + 1] ?? "", 10);
      if (Number.isNaN(raw) || raw < 8 || raw > 256) {
        throw new Error("length must be between 8 and 256");
      }
      length = raw;
      i += 1;
      continue;
    }

    if (arg === "--salt") {
      saltHex = (args[i + 1] ?? "").toLowerCase();
      i += 1;
      continue;
    }

    if (arg === "--json") {
      asJson = true;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  const finalPassword = password ?? generatePassword(length);
  const finalSalt = saltHex ?? toHex(randomBytes(16));
  const hash = await hashPasswordWithSalt(finalPassword, finalSalt);

  const payload = {
    user,
    password: finalPassword,
    hash
  };

  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`user: ${payload.user}`);
  console.log(`password: ${payload.password}`);
  console.log(`hash: ${payload.hash}`);
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`pwtool: ${message}`);
  process.exitCode = 1;
});
