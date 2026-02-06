import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';

export class PollService {
    /**
     * Vote via ID (Atomic transaction)
     */
    static async vote(pollId: string, userId: string, optionIds: string[]) {
        return await prisma.$transaction(async (tx) => {
            const poll = await tx.poll.findUnique({
                where: { id: pollId },
                include: { options: true }
            });

            if (!poll) {
                throw new ApiError(404, 'Poll not found');
            }

            // Validate options belong to poll
            const validOptionIds = poll.options.map(o => o.id);
            const allValid = optionIds.every(id => validOptionIds.includes(id));
            if (!allValid) {
                throw new ApiError(400, 'Invalid option IDs for this poll');
            }

            // Check single choice
            if (!poll.allowsMultipleAnswers && optionIds.length > 1) {
                throw new ApiError(400, 'This poll only allows a single answer');
            }

            // Remove existing votes for this user in this poll
            await tx.pollVote.deleteMany({
                where: {
                    pollId,
                    userId
                }
            });

            // Add new votes
            await tx.pollVote.createMany({
                data: optionIds.map(optionId => ({
                    pollId,
                    optionId,
                    userId
                }))
            });

            // Return updated poll with options and votes
            return await tx.poll.findUnique({
                where: { id: pollId },
                include: {
                    options: {
                        include: {
                            votes: true
                        },
                        orderBy: {
                            order: Prisma.SortOrder.asc
                        }
                    },
                    votes: true
                }
            });
        });
    }
}
