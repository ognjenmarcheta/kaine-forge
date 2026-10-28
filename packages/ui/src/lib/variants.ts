import { cva } from "class-variance-authority";

export const buttonVariants = cva("ui-button", {
  variants: {
    appearance: {
      default: "ui-button--primary",
      secondary: "ui-button--subtle",
      subtle: "ui-button--subtle",
      ghost: "ui-button--ghost",
      link: "ui-button--link",
      outline: "ui-button--outline",
      warning: "ui-button--warning",
      danger: "ui-button--danger"
    },
    spacing: {
      compact: "ui-button--sm",
      default: "ui-button--md",
      spacious: "ui-button--lg",
      icon: "ui-button--icon"
    }
  },
  defaultVariants: {
    appearance: "default",
    spacing: "default"
  }
});
