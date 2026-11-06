import type { LabCrop } from "./lab.registry";

// The lab publishes its screen frames on window for the screenshot and diff scripts.
declare global {
  interface Window {
    labScreens?: {
      id: string;
      width: number;
      height: number;
      mode: "light" | "dark";
      reference: string;
      referenceCrop?: LabCrop | undefined;
    }[];
  }
}

export {};
