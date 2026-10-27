// @ts-check
/** Every feel and behaviour number of the mosaic and the recommender lives here: this is the one place to tune them (the simulators in web/tools show what a change does). */
export const T = {
  SPACING: 225,
  get NEIGHBOUR_R() { return 1.9 * this.SPACING },
  get CHOICE_R() { return 3.0 * this.SPACING },
  GEN_STEP: 0.45, EXPLOIT_CANDIDATES: 40, MIN_PICKS_TO_EXPLOIT: 3, EXPLOIT_TEMP: 0.6, REPEAT_PENALTY: 0.5, HOMOGENEITY_ABOVE: 0.4, HOMOGENEITY_BOOST: 0.5,
  MODEL_DECAY: 0.93, EXPLOIT_PULL: 0.8, GEN_NEIGHBOURS: 2, GEN_EXPLORE: 0.15, TASTE_JUMP_P: 0.4, TASTE_TOP: 14, TASTE_TEMP: 0.3, TASTE_REUSE: 40, VARIANT_BETA: 1.5, ATTR_NONE: 0.25, ATTR_ONE: 0.5, ATTR_TOP: 3, ATTR_RANDOM: 2, ATTR_BETA: 1.5, Z_MAX: 6.5, SNAP_FROM: 1.4, SNAP_PULL: 0.3,
  HISTORY_FADE: 0.85, RECENT_STARTS: 8, START_FLOOR: 0.05, START_TASTE_SIGMA: 1.2, START_FAVOURITE_BONUS: 1.0, START_FRESH_P: 0.15,
  JUMP_P: 0.06, JUMP_P_BORED: 0.012, FIELD_PULL: 0.22, FIELD_NORM: 3.0,
  get FLOW_WAVELENGTH() { return 4 * this.SPACING },
  RFF: 48, LENGTHSCALE: 1.6, LINEAR_PRIOR_STD: 1.0, PRIOR_STD: 1.5, AP_PRIOR_STD: 0.15, AP_TAG_STD: 0.6, get AP_SCALE() { return this.PRIOR_STD / this.AP_PRIOR_STD },          // AP_SCALE: the weights of the look of a picture are small by design; this brings them back to the scale the rest of the code (steering of the style, the screen of what was learned) was written for
  FIT_ITERS: 20,
  WINDOW: 120, HALF_LIFE_DAYS: 14, RANK_DECAY: 0.985, FEATURE_SEED: 20240607, SAVE_WEIGHT: 3, VIEW_WEIGHT: 1.5, DISMISS_WEIGHT: 1, DWELL_MIN_MS: 700, DWELL_WEIGHT: 0.5, DWELL_MAX_CELLS: 3, DWELL_FULL_S: 8, PRIOR_STRENGTH: 0.3, PRIOR_JUMP_P: 0.12, PRIOR_HORIZON: 4, MAX_HISTORY: 120,
  LENS_A: 2.1, TRANSITION_MS: 1500, FRAME_SCALE: 2.0, FRAME_REACH: 0.9, FRAME_FOLLOW_MS: 110, FRAME_HYSTERESIS: 0.12, CHAMFER: 0.86,
}
