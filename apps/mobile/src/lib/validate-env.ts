// Side-effect module: validate client env at boot, before any consumer reads it.
// Imported first in app/_layout.tsx so a misconfigured build fails fast.
import { getMobileEnv } from "../env.config";

getMobileEnv();
