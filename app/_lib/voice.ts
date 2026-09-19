import * as data from "@/lib/data";
import { buildVoiceInput, registersFor, type Correction, type VoiceSample } from "@/lib/biographer/voice";

export type VoiceMaterial = { samples: VoiceSample[]; corrections: Correction[] };

/** Everything the person has written that an avatar of theirs may learn manner from. Their own words, for their own avatars only. */
export async function loadVoiceMaterial(userId: string): Promise<VoiceMaterial> {
  const [answers, pasted, corrections] = await Promise.all([data.listOwnAnswers(userId), data.listVoiceSamples(userId), data.listCorrections(userId)]);
  return { samples: [...answers.map((text) => ({ register: "considered" as const, text })), ...pasted.map((s) => ({ register: s.register, text: s.text }))], corrections };
}

export const voiceFor = (material: VoiceMaterial, avatar: Parameters<typeof registersFor>[0]) => buildVoiceInput({ ...material, registers: registersFor(avatar) });
