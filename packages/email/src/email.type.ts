/** A rendered email: the subject and both parts of one template in one locale. */
export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface EmailMessage extends EmailContent {
  to: string;
}

export interface EmailSender {
  /**
   * Resolves when the message is accepted for delivery; rejects on delivery
   * failure. Callers decide whether a failure is fatal.
   */
  send(message: EmailMessage): Promise<void>;
}
