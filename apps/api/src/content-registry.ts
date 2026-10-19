import fs from 'node:fs';
import path from 'node:path';

export type ContentBundle = Record<string, any> & { contentSet: { id: string; trade: string; [key: string]: any } };

function occupationId(bundle: ContentBundle) {
  const declared = bundle.contentSet.occupationId;
  return typeof declared === 'string' && declared ? declared : bundle.contentSet.trade.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function loadContentRegistry(primaryPath: string) {
  const importedDirectory = path.resolve(process.cwd(), 'database/imported');
  const configuredPaths = (process.env.SKILLSETU_CONTENT_FILES || '').split(/[;,]/).map(x => x.trim()).filter(Boolean);
  const paths = [primaryPath, ...configuredPaths.map(x => path.resolve(process.cwd(), x))];
  if (fs.existsSync(importedDirectory)) {
    paths.push(...fs.readdirSync(importedDirectory).filter(x => x.toLowerCase().endsWith('.json')).sort().map(x => path.join(importedDirectory, x)));
  }
  const bundles = new Map<string, ContentBundle>();
  for (const file of [...new Set(paths)]) {
    const bundle = JSON.parse(fs.readFileSync(file, 'utf8')) as ContentBundle;
    if (!bundle.contentSet?.id || !bundle.contentSet?.trade) throw new Error(`Invalid content bundle at ${file}: contentSet.id and contentSet.trade are required`);
    if (!bundles.has(bundle.contentSet.id)) bundles.set(bundle.contentSet.id, bundle);
  }
  const primary = bundles.get(JSON.parse(fs.readFileSync(primaryPath, 'utf8')).contentSet.id)!;
  return {
    primary,
    bundles,
    occupationId,
    byOccupation(id?: string) {
      const list = [...bundles.values()].filter(bundle => occupationId(bundle) === id).sort((a, b) => `${b.contentSet.effectiveDate || ''}:${b.contentSet.version || ''}`.localeCompare(`${a.contentSet.effectiveDate || ''}:${a.contentSet.version || ''}`));
      return list[0];
    },
    occupations(availability: Record<string, boolean> = {}) {
      const grouped = new Map<string, ContentBundle[]>();
      for (const bundle of bundles.values()) {
        const id = occupationId(bundle), group = grouped.get(id) || [];
        group.push(bundle); grouped.set(id, group);
      }
      return [...grouped.entries()].map(([id, versions]) => {
        versions.sort((a, b) => `${b.contentSet.effectiveDate || ''}:${b.contentSet.version || ''}`.localeCompare(`${a.contentSet.effectiveDate || ''}:${a.contentSet.version || ''}`));
        const active = versions[0];
        const isProvisional =
          active.contentSet.classification === 'PROVISIONAL_IMPORTED' ||
          active.contentSet.assessmentReady === false;

        return {
              id,
              name: active.contentSet.trade,
              trade: active.contentSet.trade,
              enabled: availability[id] ?? !isProvisional,
          contentSets: versions.map(x => ({ id: x.contentSet.id, version: x.contentSet.version, classification: x.contentSet.classification, source: x.contentSet.source, effectiveDate: x.contentSet.effectiveDate, qualificationPackCount: (x.qualificationPacks || []).length, standardCount: (x.standards || []).length, criterionCount: (x.performanceCriteria || []).length })) };
      });
    }
  };
}

export function taskOptionsFor(bundle: ContentBundle) {
  return (bundle.taskMappings || []).map((m: any) => ({ id: m.taskId, label: m.taskLabel, nosId: m.nosId, criterionIds: m.criterionIds }));
}
