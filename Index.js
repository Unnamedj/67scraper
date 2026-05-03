// Author: xi (@howtobag)
// Discord: https://discord.gg/sabmodules

const axios = require("axios");
const fs = require("fs");

const API = "https://stealabrainrot.fandom.com/api.php";

// tune this (8–16 is usually safe)
const CONCURRENCY = 10;
const BATCH_SIZE = 50;

const results = {};

// simple delay
const sleep = ms => new Promise(r => setTimeout(r, ms));

// retry wrapper
async function fetchWithRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(300 * (i + 1));
    }
  }
}

// get all pages
async function getAllPages() {
  let pages = [];
  let apcontinue = null;

  do {
    const res = await fetchWithRetry(() =>
      axios.get(API, {
        params: {
          action: "query",
          list: "allpages",
          aplimit: "max",
          apcontinue,
          format: "json",
        },
      })
    );

    pages.push(...res.data.query.allpages);
    apcontinue = res.data.continue?.apcontinue;

  } while (apcontinue);

  return pages
    .map(p => p.title)
    .filter(t => !t.includes(":")); // remove special pages
}

// batch image fetch
async function getImagesBatch(titles) {
  const res = await fetchWithRetry(() =>
    axios.get(API, {
      params: {
        action: "query",
        titles: titles.join("|"),
        prop: "pageimages",
        pithumbsize: 1000,
        format: "json",
      },
    })
  );

  return res.data.query.pages;
}

// clean names
function cleanName(name) {
  return name.toLowerCase().replace(/_/g, " ").trim();
}

// worker pool
async function run() {
  const titles = await getAllPages();
  console.log("Total pages:", titles.length);

  // split into batches of 50
  const batches = [];
  for (let i = 0; i < titles.length; i += BATCH_SIZE) {
    batches.push(titles.slice(i, i + BATCH_SIZE));
  }

  let index = 0;

  async function worker(id) {
    while (index < batches.length) {
      const i = index++;
      const batch = batches[i];

      try {
        const pages = await getImagesBatch(batch);

        for (const page of Object.values(pages)) {
          if (page.title && page.thumbnail?.source) {
            const name = cleanName(page.title);
            results[name] = page.thumbnail.source;
          }
        }

        console.log(`Worker ${id} ✔ batch ${i + 1}/${batches.length}`);
      } catch (e) {
        console.log(`Worker ${id} ✖ batch ${i}`);
      }
    }
  }

  // start workers
  await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) => worker(i))
  );

  fs.writeFileSync("brainrot.json", JSON.stringify(results, null, 2));
  console.log("✅ Done");
}

run();
