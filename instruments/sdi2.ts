import raw from "@/config/instruments/sdi2.json";
import { defineInstrument } from "./define";

const mod = defineInstrument(raw);

/** Instrument definition loaded and validated from config/instruments/sdi2.json. */
export const definition = mod.definition;

/** Pure, synchronous scorer. Throws IncompleteResponsesError on partial response sets. */
export const score = mod.score;
