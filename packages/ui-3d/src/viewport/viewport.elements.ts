import type { ThreeElements } from "@react-three/fiber";

// React Three Fiber adds its elements (<mesh>, <ambientLight>) to JSX by augmenting "react" as
// seen from its own folder. It does not declare @types/react, so pnpm links none there, and the
// augmentation can land on another @types/react copy than the app's. Repeat it here, where
// "react" resolves to the app's copy. Every module that draws three.js elements imports this.
declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- JSX lives in a namespace.
  namespace JSX {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- merges R3F elements.
    interface IntrinsicElements extends ThreeElements {}
  }
}
