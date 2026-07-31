const fs = require('fs/promises');
const path = require('path');

const {
  OUTPUT_DIR,
  cardFilename,
  createRenderSession,
  fetchWishes,
} = require('./render-liza-birthday-2026-wish.cjs');

const CARD_FILE_PATTERN = /^card_\d+\.png$/;

async function removePreviouslyGeneratedCards() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const entries = await fs.readdir(OUTPUT_DIR);
  const generatedCards = entries.filter((entry) => CARD_FILE_PATTERN.test(entry));
  await Promise.all(
    generatedCards.map((entry) => fs.unlink(path.join(OUTPUT_DIR, entry)))
  );
}

async function renderAllWishes() {
  const wishes = await fetchWishes();
  await removePreviouslyGeneratedCards();

  const session = await createRenderSession();
  try {
    for (const [index, wish] of wishes.entries()) {
      const filename = cardFilename(index);
      const { stats } = await session.renderCard({
        wish,
        index,
        total: wishes.length,
        outputPath: path.join(OUTPUT_DIR, filename),
      });
      console.log(
        `[${index + 1}/${wishes.length}] ${filename} — ${wish.displayName} ` +
          `(${stats.messageFontPx}px message)`
      );
    }
  } finally {
    await session.close();
  }

  const renderedCards = (await fs.readdir(OUTPUT_DIR)).filter((entry) =>
    CARD_FILE_PATTERN.test(entry)
  );
  if (renderedCards.length !== wishes.length) {
    throw new Error(
      `Expected ${wishes.length} cards, found ${renderedCards.length}`
    );
  }
  console.log(`Rendered ${renderedCards.length} cards into ${OUTPUT_DIR}`);
}

renderAllWishes().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
