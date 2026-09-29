import { mkdir, writeFile } from "node:fs/promises";

// Ashtadhyayi.com permits reuse with attribution. Keep the credits in the lookup
// and public/sanskrit/README.md when updating this small, local search catalog.
const source = "https://github.com/ashtadhyayi-com/data";
const response = await fetch("https://raw.githubusercontent.com/ashtadhyayi-com/data/master/sutraani/data.txt");
if (!response.ok) throw new Error(`Sūtra source returned ${response.status}`);
const payload = await response.json();
if (!Array.isArray(payload.data)) throw new Error("Unexpected sūtra source format");
const data = payload.data.map(item => {
  const number = `${item.a}.${item.p}.${item.n}`;
  if (!/^\d+\.\d+\.\d+$/.test(number) || typeof item.s !== "string" || typeof item.e !== "string") {
    throw new Error(`Invalid sūtra entry ${number}`);
  }
  return { number, text: item.s, roman: item.e };
});
if (data.length < 3900) throw new Error("Sūtra catalog appears incomplete; leaving the existing file untouched");
const directory = new URL("../public/sanskrit/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL("sutras.json", directory), JSON.stringify({ source, retrieved: new Date().toISOString().slice(0, 10), data }));
console.log(`Updated ${data.length} sūtras`);
