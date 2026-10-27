import { createPageObserver } from './observer';
import { createNavigationBus } from './navigation';

/**
 * Shared services handed to every feature. Centralized so that we run
 * exactly ONE MutationObserver and ONE navigation listener for the whole
 * extension, no matter how many features are active.
 */
export const createYTContext = () => ({
  observer: createPageObserver(),
  navigation: createNavigationBus(),
});

export type YTContext = ReturnType<typeof createYTContext>;
