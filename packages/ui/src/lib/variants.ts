import { cva } from "class-variance-authority";

export const buttonVariants = cva("ui-button", {
  variants: {
    intent: {
      primary: "ui-button--primary",
      subtle: "ui-button--subtle",
      danger: "ui-button--danger"
    },
    size: {
      sm: "ui-button--sm",
      md: "ui-button--md",
      lg: "ui-button--lg"
    }
  },
  defaultVariants: {
    intent: "primary",
    size: "md"
  }
});
