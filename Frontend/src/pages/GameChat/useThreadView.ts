import { useContext } from 'react';
import {
  ThreadChromeContext,
  ThreadComposerContext,
  ThreadMessageActionsContext,
  ThreadMessagesContext,
  ThreadMessagesDataContext,
  ThreadScrollContext,
  ThreadViewContext,
  type ThreadChromeValue,
  type ThreadComposerValue,
  type ThreadMessageActionsValue,
  type ThreadMessagesDataValue,
  type ThreadMessagesValue,
  type ThreadScrollValue,
  type ThreadViewValue,
} from './ThreadViewContext';

function requireCtx<T>(ctx: T | null, name: string): T {
  if (!ctx) throw new Error(`${name} must be used within ThreadViewProvider`);
  return ctx;
}

export function useThreadMessageActions(): ThreadMessageActionsValue {
  return requireCtx(useContext(ThreadMessageActionsContext), 'useThreadMessageActions');
}

export function useThreadMessagesData(): ThreadMessagesDataValue {
  return requireCtx(useContext(ThreadMessagesDataContext), 'useThreadMessagesData');
}

export function useThreadMessages(): ThreadMessagesValue {
  return requireCtx(useContext(ThreadMessagesContext), 'useThreadMessages');
}

export function useThreadScroll(): ThreadScrollValue {
  return requireCtx(useContext(ThreadScrollContext), 'useThreadScroll');
}

export function useThreadComposer(): ThreadComposerValue {
  return requireCtx(useContext(ThreadComposerContext), 'useThreadComposer');
}

export function useThreadChrome(): ThreadChromeValue {
  return requireCtx(useContext(ThreadChromeContext), 'useThreadChrome');
}

/** Access full thread view — prefer seam hooks for hot paths. */
export function useThreadView(): ThreadViewValue {
  return requireCtx(useContext(ThreadViewContext), 'useThreadView');
}

export function useThreadViewOptional(): ThreadViewValue | null {
  return useContext(ThreadViewContext);
}

export type {
  ThreadViewValue,
  ThreadMessagesValue,
  ThreadMessageActionsValue,
  ThreadMessagesDataValue,
  ThreadScrollValue,
  ThreadComposerValue,
  ThreadChromeValue,
};
