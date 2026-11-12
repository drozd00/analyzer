import type { EventTargetLike } from "@/internal/types/EventTargetLike";

export interface ListenerRegistration {
  target: EventTargetLike;
  type: string;
  handler: (event: Event) => void;
  options?: boolean | AddEventListenerOptions;
}
