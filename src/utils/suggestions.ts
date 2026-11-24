import {
  AudioState,
  DEFAULT_ROSTER,
  RosterEntry,
  TeachingSuggestion,
  TrackedParticipant,
} from '../types/attendai';

export function buildTeachingSuggestion(params: {
  activeTracks: TrackedParticipant[];
  classEngagement: number;
  audioState: AudioState;
  inactivityThresholdSec: number;
}): TeachingSuggestion {
  const { activeTracks, classEngagement, audioState, inactivityThresholdSec } = params;
  const nFaces = activeTracks.length;

  if (nFaces === 0) {
    return {
      level: 'info',
      title: 'Standby — Camera Angle & Coverage Check',
      body: '0 participants detected in frame. Adjust webcam angle, verify classroom lighting, upload a lecture video, or run the Virtual Demo Class.',
      actionLabel: 'Verify Framing',
    };
  }

  const maxStatic = activeTracks.reduce(
    (acc, t) => Math.max(acc, t.staticStreakSec),
    0
  );
  const lookingAwayCount = activeTracks.filter(
    (t) => t.headPose === 'Looking Away'
  ).length;
  const majorityLookingAway = lookingAwayCount >= Math.max(1, nFaces / 2);

  if (maxStatic >= inactivityThresholdSec) {
    return {
      level: 'warn',
      title: `Passive / Static Learners Detected (${maxStatic.toFixed(1)}s Inactivity)`,
      body: 'Learners have remained static beyond the inactivity threshold. Launch a quick 1-question poll, think-pair-share prompt, or brief comprehension check.',
      actionLabel: 'Launch Quick Poll',
    };
  }

  if (classEngagement < 55 && majorityLookingAway) {
    return {
      level: 'alert',
      title: 'Attention Drop Alert — Visual Focus Declining (<55%)',
      body: `${lookingAwayCount} of ${nFaces} learners are looking away. Introduce a visual diagram, worked example, or rapid concept-check question to re-anchor attention.`,
      actionLabel: 'Introduce Visual Aid',
    };
  }

  if (classEngagement < 55 && audioState === 'High Noise / Disturbance') {
    return {
      level: 'alert',
      title: 'Classroom Management Alert — High Ambient Noise (<55%)',
      body: 'High ambient noise detected alongside low engagement. Pause briefly for a structured reset or clarify the active exercise instructions.',
      actionLabel: 'Brief Classroom Reset',
    };
  }

  if (classEngagement < 55) {
    return {
      level: 'warn',
      title: 'Engagement Dip Detected (<55%)',
      body: 'Multimodal engagement is below target. Shift pacing with a concrete analogy or invite student responses before moving to the next topic.',
      actionLabel: 'Switch Instructional Mode',
    };
  }

  if (classEngagement > 78) {
    return {
      level: 'success',
      title: 'Peak Engagement Window (>78%) — Optimal Cognitive Readiness',
      body: 'Class attention and vocal participation are peaking. This is the ideal moment to introduce complex concepts, derivations, or challenge problems.',
      actionLabel: 'Advance to Complex Concepts',
    };
  }

  return {
    level: 'info',
    title: 'Steady Classroom State (55%–78%)',
    body: 'Participants are maintaining steady attention. Encourage open Q&A or ask a learner to summarize the core takeaway.',
    actionLabel: 'Encourage Q&A',
  };
}

export function parseRosterInput(rawText: string): RosterEntry[] {
  const rows: RosterEntry[] = [];
  const seenIds = new Map<string, number>();
  const lines = rawText.split(/\r?\n/);

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let baseId = `STU-${101 + idx}`;
    let name = trimmed;

    if (trimmed.includes(',')) {
      const [idPart, ...nameParts] = trimmed.split(',');
      baseId = idPart.trim() || `STU-${101 + idx}`;
      name = nameParts.join(',').trim() || `Student ${idx + 1}`;
    }

    const prevCount = seenIds.get(baseId) ?? 0;
    seenIds.set(baseId, prevCount + 1);
    const uniqueId = prevCount === 0 ? baseId : `${baseId}-${prevCount + 1}`;

    rows.push({
      studentId: uniqueId,
      name,
    });
  });

  return rows.length > 0 ? rows : [...DEFAULT_ROSTER];
}
