export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  /**
   * Resolves when the message is accepted for delivery; rejects on delivery
   * failure. Callers decide whether a failure is fatal.
   */
  send(message: EmailMessage): Promise<void>;
}
