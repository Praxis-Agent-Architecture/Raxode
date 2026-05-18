export function tryAcquireOutboundSubmissionLock(params: {
  activeToken: string | null;
  candidateToken: string;
}): {
  acquired: boolean;
  nextToken: string | null;
} {
  if (params.activeToken) {
    return {
      acquired: false,
      nextToken: params.activeToken,
    };
  }
  return {
    acquired: true,
    nextToken: params.candidateToken,
  };
}

export function releaseOutboundSubmissionLock(params: {
  activeToken: string | null;
  candidateToken: string;
}): string | null {
  return params.activeToken === params.candidateToken
    ? null
    : params.activeToken;
}
