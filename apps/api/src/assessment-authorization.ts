import type { Role, User } from './store';

/** The current account model is single-role. Assignment requires the explicit ASSESSOR role. */
export function canAssignAssessment(user: Pick<User, 'role' | 'authorizedOccupationIds'>, occupationId: string): boolean {
  return user.role === 'ASSESSOR' && (!user.authorizedOccupationIds || user.authorizedOccupationIds.includes(occupationId));
}

/** A legacy Admin assignment may be released only by an Admin and only while still in progress. */
export function canReleaseLegacyAdminAssignment(actorRole: Role, status: string, assigneeRole?: Role): boolean {
  return actorRole === 'ADMIN' && status === 'IN_PROGRESS' && assigneeRole === 'ADMIN';
}
