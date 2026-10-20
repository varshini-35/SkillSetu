export type UserRole = 'WORKER' | 'ASSESSOR' | 'REVIEWER' | 'ADMIN';

export type AuthenticatedUser = {
  id: string;
  role: UserRole;
  displayName: string;
  hasProfile: boolean;
  authorizedOccupationIds?: string[];
};

export function authenticatedUserFromResponse(payload: any): AuthenticatedUser {
  const user = payload?.user;
  if (!user || typeof user.id !== 'string' || typeof user.displayName !== 'string' ||
      !['WORKER', 'ASSESSOR', 'REVIEWER', 'ADMIN'].includes(user.role)) {
    throw new Error('The server did not return a valid authenticated user and role.');
  }
  return user as AuthenticatedUser;
}

export function dashboardForRole(role: UserRole): 'worker' | 'assessor' | 'admin' {
  if (role === 'WORKER') return 'worker';
  if (role === 'ASSESSOR') return 'assessor';
  return 'admin';
}
