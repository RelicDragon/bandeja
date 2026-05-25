import { pruneInvalidStoryItems } from '../../src/services/story/story.prune.service';

if (require.main === module) {
  pruneInvalidStoryItems()
    .then(({ itemsPruned, storiesRemoved }) => {
      console.log(`Pruned ${itemsPruned} invalid story items (${storiesRemoved} empty stories removed)`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
