import { createPageObserver, type PageObserver } from './observer';
import { createNavigationBus, type NavigationBus } from './navigation';

/**
 * Shared services handed to every feature. Centralized so that we run
 * exactly ONE MutationObserver and ONE navigation listener for the whole
 * extension, no matter how many features are active.
 */
export interface YTContext {
  observer: PageObserver;
  navigation: NavigationBus;
}

export function createYTContext(): YTContext {
  return {
    observer: createPageObserver(),
    navigation: createNavigationBus(),
  };
}
