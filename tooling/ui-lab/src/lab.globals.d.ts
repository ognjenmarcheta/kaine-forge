// The lab publishes its screen frames on window for the screenshot script.
declare global {
  interface Window {
    labScreens?: { id: string; width: number; height: number }[];
  }
}

export {};
