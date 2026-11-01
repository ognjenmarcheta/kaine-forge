// The polyfill goes first: TanStack DB and the sync engine call
// crypto.randomUUID(), which Hermes does not have.
import "./src/lib/crypto.polyfill";
import "expo-router/entry";
