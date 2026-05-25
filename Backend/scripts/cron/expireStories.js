"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.expireStories = expireStories;
const database_1 = __importDefault(require("../../src/config/database"));
const imageProcessor_1 = require("../../src/utils/imageProcessor");
async function expireStories() {
    const now = new Date();
    const expired = await database_1.default.userStory.findMany({
        where: { expiresAt: { lte: now } },
        include: {
            items: {
                select: {
                    mediaUrl: true,
                    thumbnailUrl: true,
                    posterUrl: true,
                },
            },
        },
    });
    if (expired.length === 0)
        return 0;
    const storyIds = expired.map((s) => s.id);
    await database_1.default.userStory.deleteMany({ where: { id: { in: storyIds } } });
    for (const story of expired) {
        for (const item of story.items) {
            await imageProcessor_1.ImageProcessor.deleteFilePair(item.mediaUrl, item.thumbnailUrl);
            if (item.posterUrl && item.posterUrl !== item.thumbnailUrl) {
                await imageProcessor_1.ImageProcessor.deleteFile(item.posterUrl);
            }
        }
    }
    return expired.length;
}
if (require.main === module) {
    expireStories()
        .then((count) => {
        console.log(`Expired ${count} stories`);
        process.exit(0);
    })
        .catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=expireStories.js.map