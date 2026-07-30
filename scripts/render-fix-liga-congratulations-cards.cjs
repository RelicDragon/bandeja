const fs = require('fs/promises');
const path = require('path');

const {
  NAMES,
  createRenderSession,
} = require('./render-fix-liga-congratulations.cjs');

const OUTPUT_DIR = path.resolve(
  __dirname,
  '../Frontend/public/fix-liga-leto-2026-cards'
);
const CARD_FILE_PATTERN = /^card_\d+\.png$/;

async function removePreviouslyGeneratedCards() {
  const entries = await fs.readdir(OUTPUT_DIR);
  const generatedCards = entries.filter((entry) =>
    CARD_FILE_PATTERN.test(entry)
  );
  await Promise.all(
    generatedCards.map((entry) => fs.unlink(path.join(OUTPUT_DIR, entry)))
  );
}

async function renderAllCards() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await removePreviouslyGeneratedCards();

  const session = await createRenderSession();
  try {
    for (const [index, highlightedName] of NAMES.entries()) {
      const cardNumber = index + 1;
      const filename = `card_${cardNumber}.png`;
      await session.renderCard({
        highlightedName,
        outputPath: path.join(OUTPUT_DIR, filename),
      });
      console.log(
        `[${cardNumber}/${NAMES.length}] ${filename} — ${highlightedName}`
      );
    }
  } finally {
    await session.close();
  }

  const renderedCards = (await fs.readdir(OUTPUT_DIR)).filter((entry) =>
    CARD_FILE_PATTERN.test(entry)
  );
  if (renderedCards.length !== NAMES.length) {
    throw new Error(
      `Expected ${NAMES.length} cards, found ${renderedCards.length}`
    );
  }

  console.log(`Rendered ${renderedCards.length} cards into ${OUTPUT_DIR}`);
}

renderAllCards().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
