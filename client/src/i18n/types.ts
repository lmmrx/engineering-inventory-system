import type { MessageKey } from "./en";

/** A translation: any key it leaves out shows in English. */
export type Messages = Partial<Record<MessageKey, string>>;
