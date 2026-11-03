// Spoken answers for the T2 voice loop. global-setup renders each to tests/fixtures/audio/<name>.wav via `say`.
export const VOICE_FIXTURES = {
  // interviewer.t2 OPENING (~32 s spoken, so the ~20 s chunk path runs).
  opening:
    'Fixturely sells widget seats to test teams, nine point nine million of ARR growing forty percent. ' +
    'My recommendation is to invest, at the right price. For: strong growth and a product teams use daily. Against: gross retention of eighty five percent is soft. ' +
    'The considerations are retention first, then the industry and how it compares to public comps, then valuation and whether we get to 3x. Happy to dive into each.',
  finance:
    "I'd pass at five hundred forty million; gross retention is eighty seven percent, so the back solve needs forty eight percent CAGR",
  retention:
    'Gross retention is eighty five percent and net retention one hundred four percent for customers live twelve months or more, so expansion barely offsets churn and growth leans on new logos.',
  diligence:
    'Fifteen percent gross churn on nine point nine million of ARR is about one and a half million to replace every year before any growth. I would diligence cohort curves and churn reasons by segment.',
  short: 'I would diligence the cohort curves first.',
  // interviewer.t2 SCRIPT[2], SCRIPT[4]: extra grill answers for the barge-in retry.
  tooling:
    'Test tooling has a real tailwind as teams ship faster, and once seats are wired into CI the switching cost is meaningful. Public dev-tool comps are the easy anchor for the multiple.',
  gaps: 'What the deck does not show is the customer concentration, the payback on new logos and the churn split between small and large teams. Those are my first three diligence asks.'
} as const
