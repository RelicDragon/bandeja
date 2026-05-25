import { expireStories } from '../../src/services/story/story.expire.service';

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
