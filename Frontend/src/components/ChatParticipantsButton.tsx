import React from 'react';
import { Game } from '@/types';

interface ChatParticipantsButtonProps {
  game: Game;
  onClick: () => void;
}

export const ChatParticipantsButton: React.FC<ChatParticipantsButtonProps> = ({ game, onClick }) => {
  return (
    <button 
      onClick={onClick}
      className="flex -space-x-5 hover:opacity-80 transition-opacity"
    >
      {(() => {
        const playingParticipants = game.participants.filter(p => p.isPlaying);
        const guestParticipants = game.participants.filter(p => !p.isPlaying);
        const totalUsers = playingParticipants.length + guestParticipants.length + (game.invites?.length || 0);
        const maxVisible = 3;
        
        // Show playing participants first (up to maxVisible)
        const visibleParticipants = playingParticipants.slice(0, maxVisible);
        
        // Show guests if we have space after playing participants
        const remainingSlotsAfterParticipants = maxVisible - playingParticipants.length;
        const visibleGuests = remainingSlotsAfterParticipants > 0 ? guestParticipants.slice(0, remainingSlotsAfterParticipants) : [];
        
        // Show invites only if we have space after playing participants and guests
        const remainingSlotsAfterGuests = maxVisible - playingParticipants.length - visibleGuests.length;
        const visibleInvites = remainingSlotsAfterGuests > 0 ? (game.invites || []).slice(0, remainingSlotsAfterGuests) : [];
        
        return (
          <>
            {visibleParticipants.map((participant) => (
              <div
                key={participant.userId}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold border-2 border-white dark:border-gray-800"
                title={`${participant.user.firstName || ''} ${participant.user.lastName || ''}`.trim()}
              >
                {participant.user.avatar ? (
                  <img
                    src={participant.user.avatar || ''}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  (participant.user.firstName || 'U').charAt(0).toUpperCase()
                )}
              </div>
            ))}
            {visibleGuests.map((guest) => (
              <div
                key={`guest-${guest.userId}`}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white text-xs font-semibold border-2 border-white dark:border-gray-800"
                title={`${guest.user.firstName || ''} ${guest.user.lastName || ''} (guest)`.trim()}
              >
                {guest.user.avatar ? (
                  <img
                    src={guest.user.avatar || ''}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  (guest.user.firstName || 'G').charAt(0).toUpperCase()
                )}
              </div>
            ))}
            {visibleInvites.map((invite) => (
              <div
                key={`invite-${invite.id}`}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-xs font-semibold border-2 border-white dark:border-gray-800"
                title={`${invite.receiver?.firstName || ''} ${invite.receiver?.lastName || ''} (invited)`.trim()}
              >
                {invite.receiver?.firstName ? invite.receiver.firstName.charAt(0).toUpperCase() : 'I'}
              </div>
            ))}
            {totalUsers > maxVisible && (
              <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 text-xs font-semibold border-2 border-white dark:border-gray-800">
                +{totalUsers - maxVisible}
              </div>
            )}
          </>
        );
      })()}
    </button>
  );
};
