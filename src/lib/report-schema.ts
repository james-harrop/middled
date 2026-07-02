/**
 * The coaching report contract — one JSON schema used both to constrain the
 * model (structured outputs) and to type the app.
 */

export interface DrillSpec {
  name: string
  how_to: string
  reps: string
}

export interface CoachReport {
  status: 'ok' | 'bad_input'
  /** the single highest-leverage fix, golfer-friendly language */
  one_fix: string
  /** why this fix matters, tied to the measured numbers */
  why: string
  drill: DrillSpec
  /** three things to check on the next swing */
  checkpoints: [string, string, string]
  /** 0-1 how confident the coach is given tracking quality */
  confidence: number
  caveats: string[]
  /** populated only when status = bad_input */
  bad_input_reason: string | null
  /** one-line encouraging summary of what's already good */
  whats_good: string
}

export const REPORT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'status',
    'one_fix',
    'why',
    'drill',
    'checkpoints',
    'confidence',
    'caveats',
    'bad_input_reason',
    'whats_good',
  ],
  properties: {
    status: { type: 'string', enum: ['ok', 'bad_input'] },
    one_fix: { type: 'string' },
    why: { type: 'string' },
    drill: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'how_to', 'reps'],
      properties: {
        name: { type: 'string' },
        how_to: { type: 'string' },
        reps: { type: 'string' },
      },
    },
    checkpoints: {
      type: 'array',
      items: { type: 'string' },
    },
    confidence: { type: 'number' },
    caveats: { type: 'array', items: { type: 'string' } },
    bad_input_reason: { type: ['string', 'null'] },
    whats_good: { type: 'string' },
  },
} as const
