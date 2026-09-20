import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { shouldRunJoinDeepLink, stripJoinParam } from './joinDeepLink';

export interface JoinFromDeepLinkProps {
  /** `false` until the game has actually loaded. */
  ready: boolean;
  /**
   * `true` when running the join would be pointless — the viewer already holds
   * a seat, an invite or a chat slot, or is queued for a game the organizer
   * fills by hand. Derive it with `shouldSwallowJoinDeepLink`.
   */
  alreadyInvolved: boolean;
  /** The details page's own join handler — gates and overlap confirm included. */
  onJoin: () => void;
}

/**
 * PRD 347 — the "Join now" push action lands on `/games/:id?join=1`.
 *
 * Runs the page's normal join flow once the game has loaded, then cleans the
 * param out of the URL so a back-navigation or a refresh cannot re-fire it.
 * Renders nothing.
 */
export function JoinFromDeepLink({ ready, alreadyInvolved, onJoin }: JoinFromDeepLinkProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const firedRef = useRef(false);

  useEffect(() => {
    if (!shouldRunJoinDeepLink(location.search)) return;
    if (!ready) return;
    if (firedRef.current) return;
    firedRef.current = true;

    // Clean the URL first: the join flow can open a confirm dialog, and the
    // param must not survive whatever the user does next.
    navigate(`${location.pathname}${stripJoinParam(location.search)}`, {
      replace: true,
      state: location.state,
    });

    if (!alreadyInvolved) onJoin();
  }, [alreadyInvolved, location.pathname, location.search, location.state, navigate, onJoin, ready]);

  return null;
}
