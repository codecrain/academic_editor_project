const HWPX_REVIEW_PROFILES = Object.freeze([
  'structural',
  'submission',
  'public-proposal',
]);

function normalizeHwpxReviewProfile(value) {
  const profile = String(value || 'structural');
  return HWPX_REVIEW_PROFILES.includes(profile) ? profile : 'structural';
}

function isSubmissionProfile(value) {
  return normalizeHwpxReviewProfile(value) !== 'structural';
}

function isPublicProposalProfile(value) {
  return normalizeHwpxReviewProfile(value) === 'public-proposal';
}

export {
  HWPX_REVIEW_PROFILES,
  isPublicProposalProfile,
  isSubmissionProfile,
  normalizeHwpxReviewProfile,
};
