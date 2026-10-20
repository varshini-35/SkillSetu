export function requestableDeclaredSkills(profile: any, taskMappings: any[], standards: any[], qualificationPackId: string): any[] {
  if (!profile || !profile.declaration || !Array.isArray(profile.declaredSkills)) return [];
  const validTaskIds = new Set((taskMappings || [])
    .filter(mapping => (standards || []).some(standard => standard.id === mapping.nosId && standard.qpId === qualificationPackId))
    .map(mapping => String(mapping.taskId)));
  const declaredTaskIds = new Set(Array.isArray(profile.declaration.taskIds) ? profile.declaration.taskIds : []);
  return profile.declaredSkills.filter((skill: any) => declaredTaskIds.has(skill.id) && validTaskIds.has(String(skill.id)));
}
