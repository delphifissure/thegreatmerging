import raw from "@/config/instruments/map.json";
import { defineInstrument } from "./define";

const mod = defineInstrument(raw);

/** Instrument definition loaded and validated from config/instruments/map.json. */
export const definition = mod.definition;

/** Pure, synchronous scorer. Throws IncompleteResponsesError on partial response sets. */
export const score = mod.score;
