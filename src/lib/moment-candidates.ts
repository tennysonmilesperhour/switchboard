export type MomentCandidateStage =
  | 'none'
  | 'curious'
  | 'revealed'
  | 'accepted'
  | 'passed';

export interface MomentCandidateIntro {
  name: string;
  interests: string[];
  headline: string | null;
}

/**
 * Payload sent to the Moments client.
 *
 * `userId` is optional on purpose: omitting the property before mutual reveal
 * keeps identity out of the serialized React payload, rather than sending a
 * hidden/null UI field beside every anonymous candidate.
 */
export interface MomentCandidate {
  id: string;
  userId?: string;
  experiences: string[];
  headline: string | null;
  stage: MomentCandidateStage;
  intro: MomentCandidateIntro | null;
}

export interface FoundMomentCandidate {
  id: string;
  experiences: string[];
  headline: string | null;
}

function stageFor(value: string | undefined): MomentCandidateStage {
  switch (value) {
    case 'curious':
    case 'revealed':
    case 'accepted':
    case 'passed':
      return value;
    default:
      return 'none';
  }
}

/** Build the exact candidate payload that crosses the server/client boundary. */
export function buildMomentCandidates(input: {
  found: FoundMomentCandidate[];
  stageByMoment: ReadonlyMap<string, string>;
  introByMoment: ReadonlyMap<string, MomentCandidateIntro>;
  userIdByMoment: ReadonlyMap<string, string>;
}): MomentCandidate[] {
  return input.found
    .map((candidate): MomentCandidate => {
      const stage = stageFor(input.stageByMoment.get(candidate.id));
      const revealed = stage === 'revealed' || stage === 'accepted';
      const intro = revealed ? input.introByMoment.get(candidate.id) ?? null : null;
      const userId = revealed ? input.userIdByMoment.get(candidate.id) : undefined;

      return {
        id: candidate.id,
        experiences: candidate.experiences,
        // A free-text headline can identify its author. The anonymous RPC now
        // returns null too; keep the client payload fail-closed independently.
        headline: revealed ? intro?.headline ?? null : null,
        stage,
        intro,
        ...(userId ? { userId } : {}),
      };
    })
    .filter((candidate) => candidate.stage !== 'passed');
}
