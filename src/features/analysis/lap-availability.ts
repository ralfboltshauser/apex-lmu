export interface LapPlaybackAvailability {
  readonly samplesAvailable: boolean;
  /** Missing is accepted for legacy summaries written before replayability was persisted. */
  readonly replayable?: boolean;
}

/** A payload can be retained as integrity evidence without being complete enough to replay. */
export function lapPlaybackAvailable(lap: LapPlaybackAvailability): boolean {
  return lap.samplesAvailable && lap.replayable !== false;
}
